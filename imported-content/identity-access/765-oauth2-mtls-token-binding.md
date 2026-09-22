# OAuth 2.0 mTLS: Binding Access Tokens to Client Certificates (RFC 8705)

## The Problem: The Threat of Stolen Bearer Tokens

In standard OAuth 2.0, access tokens are **Bearer Tokens**. A bearer token acts exactly like a cash bill: whoever holds the token can spend it. If an attacker intercepts an active token—whether through a compromised log server, a client-side Cross-Site Scripting (XSS) exploit, a man-in-the-middle (MitM) network tap, or an SSRF vulnerability—they can use that token to access protected APIs without needing to prove their identity.

To solve this vulnerability, the IETF developed **RFC 8705: OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens**. Instead of trusting the token on its own, the system cryptographically binds the access token to the client's unique Mutual TLS (mTLS) client certificate. 

If an attacker steals a certificate-bound token and attempts to use it from their own machine, the Resource Server (RS) will reject the call. This rejection occurs because the attacker's TLS connection does not possess the matching private key corresponding to the client certificate bound inside the token's claims.

---

## Architectural Blueprint: Certificate-Bound Verification Pipeline

When a client initiates a request, it must complete an mTLS handshake at the Edge Proxy (e.g., NGINX, Envoy, Cloudflare). The Edge Proxy terminates the TLS connection and forwards the client certificate details downstream using standardized HTTP headers (like `X-Forwarded-Client-Cert` or `X-SSL-Client-Cert`). 

The downstream Resource Server validates the incoming access token. It extracts the SHA-256 thumbprint of the client certificate from the HTTP header and matches it directly against the token's **Confirmation (`cnf`)** claim.

```
+--------+             +------------+             +-------------------+             +---------------+
| Client |             | Edge Proxy |             |  Resource Server  |             |  Auth Server  |
|  (mTLS)|             | (TLS Term) |             |    (Microservice) |             |     (IdP)     |
+--------+             +------------+             +-------------------+             +---------------+
    |                         |                             |                               |
    | 1. mTLS Handshake &     |                             |                               |
    |    Access Token Request |                             |                               |
    |------------------------>|                             |                               |
    |                         | 2. Proxy credentials & cert |                               |
    |                         |------------------------------------------------------------>|
    |                         |                             |                               | 3. Issue Token
    |                         |                             |                               |    with "cnf"
    |                         | <-----------------------------------------------------------|    containing cert hash
    |                         |    JSON Web Token (JWT)     |                               |
    | <-----------------------|                             |                               |
    |    Bearer Token + Cert  |                             |                               |
    |                         |                             |                               |
    | 4. Call API via mTLS    |                             |                               |
    |------------------------>|                             |                               |
    |                         | 5. Forward request with cert|                               |
    |                         |    header (X-Client-Cert)   |                               |
    |                         |---------------------------->|                               |
    |                         |                             | 6. Validate:                  |
    |                         |                             |    Token Signature            |
    |                         |                             |    AND "cnf" claim matches   |
    |                         |                             |    the forwarded Cert Hash   |
    |                         |                             |                               |
    |                         | <---------------------------|                               |
    | <-----------------------|    Success / Data Response  |                               |
```

---

## Technical Implementation

Below is a robust Node.js/TypeScript implementation for a Resource Server API. It extracts the client's mTLS certificate from the forwarded headers, computes its SHA-256 thumbprint, and validates it against the token's `cnf.x5t#S256` claim.

```typescript
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface CertificateBoundTokenPayload extends jwt.JwtPayload {
  cnf?: {
    'x5t#S256'?: string; // Base64URL-encoded SHA-256 thumbprint of the client certificate
  };
}

export class MtlsTokenBindingValidator {
  constructor(private jwtPublicKey: string, private expectedIssuer: string) {}

  /**
   * Validates a client request, enforcing certificate binding rules
   */
  public async validateRequest(
    token: string,
    rawClientCertPem?: string,
    forwardedCertHeader?: string
  ): Promise<CertificateBoundTokenPayload> {
    
    // 1. Decrypt and cryptographically verify the JWT signature first
    let payload: CertificateBoundTokenPayload;
    try {
      payload = jwt.verify(token, this.jwtPublicKey, {
        issuer: this.expectedIssuer,
        algorithms: ['RS256', 'ES256'],
      }) as CertificateBoundTokenPayload;
    } catch (err) {
      throw new Error(`TOKEN_VERIFICATION_FAILED: ${(err as Error).message}`);
    }

    // 2. Extract and check the Confirmation (cnf) claim
    if (!payload.cnf || !payload.cnf['x5t#S256']) {
      throw new Error('POLICY_VIOLATION: Access token is not bound to an mTLS client certificate (missing cnf claim)');
    }

    const expectedThumbprint = payload.cnf['x5t#S256'];

    // 3. Resolve the client certificate from immediate connection or forwarded proxy header
    let clientCertPem = rawClientCertPem;
    if (!clientCertPem && forwardedCertHeader) {
      clientCertPem = this.parseForwardedCertHeader(forwardedCertHeader);
    }

    if (!clientCertPem) {
      throw new Error('SECURITY_VIOLATION: Request missing required client certificate credentials');
    }

    // 4. Calculate the SHA-256 Thumbprint of the received client certificate
    const actualThumbprint = this.calculateCertSha256Thumbprint(clientCertPem);

    // 5. Assert the cryptographic bindings match exactly (mitigates token theft)
    if (actualThumbprint !== expectedThumbprint) {
      throw new Error(
        `BINDING_VIOLATION: Client certificate thumbprint mismatch. Expected: ${expectedThumbprint}, Received: ${actualThumbprint}`
      );
    }

    return payload;
  }

  /**
   * Computes the Base64URL-encoded SHA-256 thumbprint of a PEM-encoded certificate
   */
  private calculateCertSha256Thumbprint(pem: string): string {
    // Strip PEM headers and footers to isolate the raw Base64 DER encoding
    const base64Der = pem
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s+/g, ''); // Remove all whitespace/newlines

    const derBuffer = Buffer.from(base64Der, 'base64');
    
    // Compute SHA-256 hash
    const hash = crypto.createHash('sha256').update(derBuffer).digest();

    // Convert to Base64URL format (no padding, replaces + with - and / with _)
    return hash
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Helper to parse and clean certificates extracted from reverse-proxy headers
   */
  private parseForwardedCertHeader(headerValue: string): string {
    // Proxies like NGINX or HAProxy often URL-encode or escape the PEM cert
    let decoded = decodeURIComponent(headerValue);
    
    // Some proxies swap spaces for newlines; restore structured formatting
    if (!decoded.includes('\n') && decoded.includes('-----BEGIN CERTIFICATE-----')) {
      decoded = decoded
        .replace(/-----BEGIN CERTIFICATE-----/, '-----BEGIN CERTIFICATE-----\n')
        .replace(/-----END CERTIFICATE-----/, '\n-----END CERTIFICATE-----')
        .replace(/(.{64})/g, '$1\n');
    }
    return decoded;
  }
}
```

---

## Defensive Hardening Checklist

1. **Verify Mutual TLS Termination**: Ensure your Edge Proxy is configured to perform *strict client certificate verification* (`ssl_verify_client on` in NGINX), dropping invalid certificate requests before they reach downstream services.
2. **Prevent Header Spoofing**: Configure the Edge Proxy to strip out and overwrite any user-supplied `X-Forwarded-Client-Cert` headers before forwarding incoming requests. Downstream servers must only trust headers injected directly by the reverse proxy.
3. **Keep Certificates Short-Lived**: Issue short-lived client certificates (e.g., utilizing an internal PKI or HashiCorp Vault) to minimize the impact of client-side certificate theft.
