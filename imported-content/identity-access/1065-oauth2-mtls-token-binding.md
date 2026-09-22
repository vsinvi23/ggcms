# OAuth 2.0 mTLS: Binding Access Tokens to Client Certificates (RFC 8705)

Standard OAuth 2.0 access tokens are typically "bearer" tokens. Under the bearer paradigm, anyone who possesses the token can use it to gain authorized access, regardless of how they obtained it. If a bearer token is exposed via application logging, insecure proxies, or client-side storage exploitation, the security model is compromised. RFC 8705 solves this by introducing Mutual TLS (mTLS) Client Certificate-Bound Access Tokens.

---

## The Problem: The Bearer Token Vulnerability

The core security issue with standard OAuth 2.0 is the lack of "sender-constraining." When a resource server receives an API request, it verifies the signature and scope of the token, but it cannot verify if the client presenting the token is the *authentic client* to whom the token was originally issued.

RFC 8705 mitigates this by binding the access token to the client's TLS client certificate.
- **Token Request:** During the initial authentication flow, the client performs a Mutual TLS handshake with the Authorization Server (AS). The AS extracts the client’s certificate thumbprint.
- **Token Minting:** The AS includes a confirmation claim (`cnf`) containing the SHA-256 thumbprint of the certificate directly inside the access token.
- **API Call:** When the client calls the Resource Server (RS), it must do so over an mTLS channel. The RS validates both the incoming certificate and the token, ensuring the certificate matches the hash inside the token’s `cnf` block. If an attacker intercepts the token, they cannot use it because they do not hold the corresponding client-side private key required to establish the mTLS session.

---

## Technical Architecture: End-to-End mTLS Binding

In enterprise deployments, mTLS is typically terminated at a Reverse Proxy or Load Balancer (e.g., NGINX, Envoy) rather than at the application layer itself. The proxy must validate the client certificate and forward its SHA-256 fingerprint downstream via secure HTTP headers.

```
+--------+                 +---------------------+                 +--------------------+
| Client |                 | Proxy / Gateway     |                 | Resource Server    |
| (mTLS) |                 | (TLS Termination)   |                 | (API Engine)       |
+--------+                 +---------------------+                 +--------------------+
    |                                 |                                      |
    | 1. Establish mTLS Handshake     |                                      |
    |<===============================>|                                      |
    |                                 |                                      |
    | 2. GET /api/secure              |                                      |
    |    (Authorization: Bearer JWT)  |                                      |
    |-------------------------------->|                                      |
    |                                 | 3. Extract Certificate Hash          |
    |                                 | 4. Inject Forwarding Headers:        |
    |                                 |    X-Client-Cert-Thumbprint: a1b2c3d |
    |                                 |------------------------------------->|
    |                                 |                                      | 5. Verify JWT Sig
    |                                 |                                      | 6. Extract token claim:
    |                                 |                                      |    "cnf": { "x5t#S256": "..." }
    |                                 |                                      | 7. Match 'cnf' with
    |                                 |                                      |    X-Client-Cert-Thumbprint
    |                                 |                                      |--+
    |                                 |                                      |  | Cryptographic
    |                                 |                                      |<-+ Matching
    |                                 |<-------------------------------------|
    | 8. HTTPS Response (200 OK)      |                                      |
    |<--------------------------------|                                      |
```

---

## Production-Grade Code: RFC 8705 Verification Engine

Below is a Node.js/TypeScript Express implementation of a Resource Server verification layer. It decodes the incoming JWT, locates the RFC 8705 confirmation metadata (`cnf.x5t#S256`), reads the forwarded client certificate fingerprint, and enforces strict cryptographic alignment.

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const EXPECTED_ALGORITHMS = ['RS256', 'ES256'];
const PUBLIC_KEY_STORE = process.env.TOKEN_VERIFICATION_PUBLIC_KEY || '--- PUBLIC KEY ---';

interface TokenCnfClaim {
  'x5t#S256'?: string; // Base64URL-encoded SHA-256 thumbprint of client certificate
}

interface BoundAccessPayload extends jwt.JwtPayload {
  cnf?: TokenCnfClaim;
  sub: string;
}

/**
 * Middleware: Enforce RFC 8705 mTLS Token Binding.
 * Expects the upstream TLS termination proxy to pass verified cert headers.
 */
export function enforceMtlsTokenBinding(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // 1. Retrieve the client certificate thumbprint from a trusted forwarding header.
  // The value is injected by a secure load-balancer (e.g. Envoy or Nginx).
  const rawCertThumbprint = req.headers['x-client-cert-thumbprint'] as string;
  if (!rawCertThumbprint) {
    res.status(400).json({ error: 'Missing client mutual TLS credential context.' });
    return;
  }

  try {
    // 2. Statelessly decode and verify the JWT access token
    const decoded = jwt.verify(token, PUBLIC_KEY_STORE, {
      algorithms: EXPECTED_ALGORITHMS,
    }) as BoundAccessPayload;

    // 3. Enforce presence of the mandatory confirmation ('cnf') claim
    if (!decoded.cnf || !decoded.cnf['x5t#S256']) {
      res.status(403).json({ error: 'Invalid token policy: Token not bound to mTLS certificate.' });
      return;
    }

    const tokenCertHashBase64Url = decoded.cnf['x5t#S256'];
    
    // Normalize proxy thumbprint to Base64URL-encoding to match RFC 8705 token formatting
    const normalizedProxyHash = normalizeThumbprintToBase64Url(rawCertThumbprint);

    // 4. Cryptographic comparison of the TLS certificate thumbprints
    // Uses constant-time matching to prevent timing attacks on token hashes
    if (!safeCompare(tokenCertHashBase64Url, normalizedProxyHash)) {
      res.status(403).json({
        error: 'Sender-Constraining Mismatch: Bound certificate does not match the active TLS connection.'
      });
      return;
    }

    // Bind successful token and certificate context to request
    req.user = decoded;
    next();
  } catch (error: any) {
    res.status(401).json({ error: `Authentication verification aborted: ${error.message}` });
  }
}

/**
 * Normalizes hex-encoded proxy fingerprints (e.g., from Nginx) to RFC 8705 Base64URL encoding
 */
function normalizeThumbprintToBase64Url(hexFingerprint: string): string {
  // Strip any colons if present from standard PEM representations (e.g. AA:BB:CC...)
  const cleanHex = hexFingerprint.replace(/:/g, '');
  const buffer = Buffer.from(cleanHex, 'hex');
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Constant-time comparison helper to prevent side-channel timing analysis
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

---

## Defensive Strategy: Protecting Terminated mTLS Headers

- **Header Spoofing Prevention:** The Reverse Proxy MUST strip any incoming `X-Client-Cert-Thumbprint` headers directly from the external internet before processing client connections. Failure to do so allows an attacker to bypass binding entirely by spoofing the header string over standard HTTP.
- **Secure Intranet Transport:** Ensure the internal connection from the proxy to the resource server is fully encrypted and authenticated (e.g. internal TLS) to prevent header tampering by internal network actors.
