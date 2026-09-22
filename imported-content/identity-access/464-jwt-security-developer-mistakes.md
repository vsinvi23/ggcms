# JWT Security: Critical Exploits and Architecture Pitfalls

## The Problem: Structural Fragility in Token Verification
JSON Web Tokens (JWTs) delegate authentication state entirely to the client. This shifts the security burden to the Resource Server (API). Because of this decentralized nature, minor implementation oversights in token parsing result in catastrophic, complete-compromise vulnerabilities.

Two classic flaws dominate modern JWT exploits:
1.  **The "none" Algorithm Exploit:** Early JWT libraries allowed tokens to be "signed" using the algorithm `"none"`. Attackers could intercept a legitimate token, decode the header, change `"alg"` to `"none"`, alter the payload claims (e.g., setting `isAdmin: true` or changing `sub` to a target victim's ID), remove the signature entirely (leaving the trailing dot), and present it to the API. If the server-side verification library was configured poorly, it accepted the unverified token as valid.
2.  **Symmetric vs. Asymmetric Key Mismanagement:** Using symmetric keys (e.g., HMAC-SHA256) means the same secret key is used to both *sign* (create) and *verify* a token. In a microservice ecosystem, if multiple downstream services need to verify incoming tokens, every service must have access to that shared secret. **If even one microservice is compromised, the attacker obtains the secret and can forge valid tokens for the entire system.**

---

## Technical Architectures: Key Distribution Patterns

### Vulnerable: Shared Symmetric Key (HMAC-SHA256)
If any downstream microservice is breached, the signing key is lost.

```
+------------------+                   +--------------------+
|  Identity Auth   +--[Signs Token]--->|  Client Browser    |
|  Server (Secret) |                   +---------+----------+
+------------------+                             |
                                                 v [Access API]
                                    +------------+------------+
                                    |                         |
                                    v                         v
                           +------------------+      +------------------+
                           |  Microservice A  |      |  Microservice B  |
                           |     (Secret)     |      |  (Compromised!)  |
                           +------------------+      +--------+---------+
                                                              |
                                                              v [Attacker extracts secret]
                                                     FORGES ALL TOKENS!
```

### Secure: Asymmetric Key Pair (RS256 / ES256)
 Downstream services only possess the **Public Key** (distributed via JWKS). Even if Microservice B is fully compromised, the attacker cannot forge tokens because they lack the **Private Key**, which never leaves the Identity Server.

```
+------------------+                   +--------------------+
|  Identity Auth   +--[Signs Token]--->|  Client Browser    |
| (Private Key)    |                   +---------+----------+
+--------+---------+                             |
         |                                       v [Access API]
         | (Publishes Keys)         +------------+------------+
         v                          |                         |
  +------+-------+                  v                         v
  | JWKS Portal  |<--------+------------------+      +------------------+
  | (Public Keys)|         |  Microservice A  |      |  Microservice B  |
  +--------------+         |   (Public Key)   |      |  (Compromised!)  |
                           +------------------+      +------------------+
                                                              |
                                                              v
                                                    CANNOT FORGE TOKENS
```

---

## Implementation: Production-Grade Asymmetric Validation with JWKS
The following TypeScript middleware secures an Express-based resource server. It fetches keys from a JWKS endpoint, caches them, validates the algorithm strictly, and completely blocks `"none"` algorithm exploits.

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Initialize JWKS client with secure caching parameters
const jwkClientInstance = jwksClient({
  jwksUri: 'https://auth.yourcompany.com/.well-known/jwks.json',
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

// Explicitly define verified algorithms. DO NOT support HS256 and RS256 simultaneously on one endpoint.
const ALLOWED_ALGORITHMS = ['RS256'];

interface CustomRequest extends Request {
  userContext?: jwt.JwtPayload;
}

function getKey(header: JwtHeader, callback: SigningKeyCallback) {
  // Defensive check against missing key identifier (kid)
  if (!header.kid) {
    return callback(new Error('JWT Header lacks a "kid" (Key ID)'));
  }

  // Defend against 'none' algorithm bypass
  if (!header.alg || !ALLOWED_ALGORITHMS.includes(header.alg)) {
    return callback(new Error(`Algorithm ${header.alg} is not permitted`));
  }

  jwkClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      return callback(err || new Error('JWK Key not found'));
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Strict JWT Verification Middleware
 */
export function authorizeJwt(req: CustomRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ALLOWED_ALGORITHMS as jwt.Algorithm[],
      issuer: 'https://auth.yourcompany.com',
      audience: 'https://api.yourcompany.com/v2' // Must target this API
    },
    (err, decoded) => {
      if (err || !decoded) {
        // Log the exact error internally for debugging, but return generic error to client
        console.error('JWT Verification Error:', err?.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Explicit type check to guard against string payloads
      if (typeof decoded === 'string') {
        return res.status(401).json({ error: 'Invalid JWT structure' });
      }

      req.userContext = decoded;
      next();
    }
  );
}
```

---

## Strategic Mitigations
1.  **Never Use Vulnerable JWT Libraries:** Ensure your language-specific JWT validation library is up-to-date and inherently blocks `"none"` algorithm parsing unless explicitly overridden (which should never happen in production).
2.  **Separate Signing and Verification:** Adopt **RS256** (RSA Signature with SHA-256) or **ES256** (ECDSA Signature with SHA-256) as your default token verification architecture. Your authorization server holds the private key, while client microservices fetch and cache public keys via OIDC JWKS endpoints.
3.  **Strict Audience Checking:** Every single API service MUST validate its own specific identifier against the `aud` claim. Accepting a token meant for a different service allows cross-service token replay attacks.
