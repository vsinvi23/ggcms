# OAuth 2.0 mTLS: Binding Access Tokens to Client Certificates (RFC 8705)

## The Problem
By default, OAuth 2.0 access tokens are "bearer tokens." This means that any entity in possession of the token string can use it to gain authorized access, regardless of who originally requested it. If a bearer token is intercepted—whether through server logs, database leaks, proxy compromises, or client-side cross-site scripting (XSS)—an attacker can immediately replay the token to steal sensitive resource data.

In highly regulated or zero-trust environments (such as Open Banking, healthcare networks, or defense platforms), relying on pure bearer tokens is unacceptable. RFC 8705 solves this vulnerability by defining Mutual TLS (mTLS) Client Authentication and Certificate-Bound Access Tokens. By binding the issued access token directly to the client's public TLS certificate, the token is transformed from a bearer token into a "sender-constrained" token. If an attacker intercepts the token, it remains entirely useless to them unless they also possess the client's private cryptographic key.

## The Mental Model
The sender-constrained paradigm relies on an end-to-end cryptographic handshake between the Client, the Authorization Server (AS), and the Resource Server (RS):

```
+--------+               1. POST /token (mTLS Handshake)               +----+
|        | ----------------------------------------------------------> |    |
|        | <---------------------------------------------------------- | AS |
| Client |                   2. Access Token with cnf                  +----+
|        |                                                               
|        |               3. GET /resource (mTLS Handshake)             +----+
|        | ----------------------------------------------------------> |    |
|        |        [Access Token + Client Cert Present on Conn]         | RS |
|        |                                                             |    |
|        |                  4. Verifies Client Cert                    |    |
|        |                     Matches cnf.jkt                         |    |
+--------+                                                             +----+
```

1. During token request, the client establishes an mTLS session with the AS.
2. The AS computes the SHA-256 thumbprint of the client's certificate and inserts it into the access token payload as a confirmation claim: `cnf.jkt` (JSON Web Key Thumbprint).
3. When the client accesses the RS, it must do so over an mTLS connection.
4. The RS extracts the client certificate from the TLS layer and verifies that its SHA-256 thumbprint matches the `cnf.jkt` claim inside the presented JWT access token.

## Attack Vectors & Pitfalls
1. **Bearer Replay via Proxy Eavesdropping**: If an attacker intercepts a token from an application's logs, they will try to replay it against the RS using their own network connection. If the RS validates the token's cryptographic signature but neglects to verify the mTLS certificate binding, the attack succeeds.
2. **TLS Termination / Offloading Bypasses**: In modern microservice meshes, TLS is often terminated at an edge gateway or load balancer. If the gateway strips the client's client certificate metadata before forwarding the request to the internal RS, the RS cannot verify the thumbprint. Attackers who bypass the gateway and access the RS directly can bypass the mTLS assertion.
3. **Weak Thumbprint Validation (MD5/SHA-1)**: Relying on legacy hashing algorithms to verify certificate identity can allow collision attacks, where a malicious certificate is crafted to match a legitimate client's thumbprint.

## Defensive Architecture
Securing an API using RFC 8705 requires both configuring your gateway to forward the client certificate and writing code at the RS layer to perform the thumbprint binding verification.

### Node.js: Verifying Certificate-Bound Access Tokens
Here is a secure Node.js middleware for a Resource Server that extracts the client certificate from HTTP headers (forwarded by a secure gateway like Envoy or NGINX) and matches its SHA-256 thumbprint against the token's `cnf.jkt` parameter.

```javascript
const crypto = require('crypto');

function verifyMtlsTokenBinding(req, res, next) {
  // req.tokenContext represents the parsed and cryptographically validated JWT
  const token = req.tokenContext; 
  
  if (!token || !token.cnf || !token.cnf.jkt) {
    return res.status(403).json({ error: 'Access token is not bound to a client certificate' });
  }

  // Retrieve client cert in PEM format from gateway header
  const clientCertPem = req.headers['x-client-cert'];
  if (!clientCertPem) {
    return res.status(401).json({ error: 'Mutual TLS client certificate is missing' });
  }

  try {
    // Parse PEM to extract DER buffer
    const certString = clientCertPem
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s+/g, '');
    const certBuffer = Buffer.from(certString, 'base64');

    // Compute SHA-256 fingerprint
    const sha256Thumbprint = crypto
      .createHash('sha256')
      .update(certBuffer)
      .digest('base64url');

    // Compare thumbprint with token confirmation claim
    if (sha256Thumbprint !== token.cnf.jkt) {
      return res.status(403).json({ 
        error: 'Certificate mismatch. Token not bound to this TLS connection.' 
      });
    }

    next();
  } catch (error) {
    console.error('mTLS Verification Error:', error.message);
    return res.status(500).json({ error: 'Failed to process client certificate binding' });
  }
}
```

## Best Practices
- **Secure the Edge Forwarding**: Ensure the gateway header (e.g., `x-client-cert`) is completely stripped from external requests so that clients cannot spoof certificates.
- **Enforce SHA-256**: Always use Base64URL-encoded SHA-256 thumbprints (`jkt`) for token bindings, and reject any outdated SHA-1 or MD5 bindings.
- **Use Sender-Constrained Tokens Everywhere**: Standardize mTLS token bindings across all high-security backend APIs to enforce defense-in-depth.
