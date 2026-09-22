---
title: "Mitigating JWT Replay Attacks with JTI and Nonce Tracking"
description: "Why stateless JWT validation alone can't stop replay attacks, and how to enforce jti-based single-use tracking in Redis alongside OIDC nonces for high-value APIs."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "jwt"
  - "replay-attack"
  - "jti"
  - "nonce"
  - "redis"
  - "rfc-7519"
---

# Mitigating JWT Replay Attacks with JTI and Nonce Tracking

## The Problem: The Stateless Liability of JSON Web Tokens

JWTs are widely adopted because a Resource Server (RS) can verify them entirely by checking a cryptographic signature and an expiration claim (`exp`) — no database round-trip required per request. That statelessness is also the vulnerability: if an attacker intercepts a valid JWT (transport exposure, an XSS payload, a logging pipeline that captures headers), they can replay that exact token against the API repeatedly until it naturally expires. Even if the legitimate user logs out immediately after, the server holds no session state to check against — it has no way to distinguish the real client's next request from the attacker's replay.

For high-value operations — a funds transfer, a permission change, an administrative action — relying solely on `exp` is an unacceptable residual risk.

## The Mental Model: Dynamic Uniqueness Verification

To defend against replay without giving up the stateless win entirely, we introduce a hybrid model using two claims defined in RFC 7519:

- **`jti` (JWT ID)** — a globally unique identifier stamped on the token at issuance. The first time a resource server accepts a token with a given `jti`, it records that ID in a fast, distributed store. If the same `jti` shows up again before the token's original expiration, the request is rejected.
- **`nonce`** — a cryptographically random "number used once" that the client generates and the authorization server echoes back in the token. The client checks the returned `nonce` matches the one it sent, defending the OIDC login flow itself against replayed authorization responses.

```
 Client                          Resource Server                    Redis Cache
   |                                    |                                |
   |--- 1. Send Request + JWT(jti) ---->|                                |
   |                                    |--- 2. Query jti in Cache ----->|
   |                                    |<-- 3. jti Not Found (OK) ------|
   |                                    |                                |
   |                                    |--- 4. Store jti + TTL (exp) -->|
   |                                    |                                |
   |<-- 5. Authorized Response ---------|                                |
   |                                    |                                |
   |--- 6. Replay Same JWT(jti) ------->|                                |
   |                                    |--- 7. Query jti in Cache ----->|
   |                                    |<-- 8. jti Found (EXISTS) ------|
   |                                    |                                |
   |<-- 9. HTTP 401 Unauthorized -------|                                |
```

Because the resource server only needs to track a `jti` for the remainder of the token's own lifetime, the cache entry is written with a TTL equal to `exp - now`. Once the token would have expired anyway, Redis evicts the entry automatically — no unbounded storage growth, no manual cleanup job.

## Technical Attack Vectors and Scenarios

1. **Man-in-the-middle interception** — transport-level sniffing on insecure Wi-Fi, or a misconfigured TLS-terminating proxy, exposes the raw `Authorization` header.
2. **API gateway log leakage** — enterprise logging/APM systems that dump full request headers can end up storing bearer tokens in plaintext logs.
3. **Cross-Site Scripting (XSS)** — tokens stored in `localStorage` are fully readable by any injected script, which can exfiltrate them for later replay.

## Implementing JTI Tracking with Redis and Node.js

```javascript
const redis = require('redis');
const jwt = require('jsonwebtoken');
const redisClient = redis.createClient({ url: 'redis://localhost:6379' });

redisClient.connect().catch(console.error);

async function preventJWTReplay(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Standard signature and expiration validation first.
        const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
            algorithms: ['RS256']
        });

        const jti = decoded.jti;
        const exp = decoded.exp;

        if (!jti) {
            return res.status(400).json({ error: 'Missing JTI claim' });
        }

        // Remaining time-to-live, in seconds, until the token's own expiry.
        const currentTime = Math.floor(Date.now() / 1000);
        const ttl = exp - currentTime;

        if (ttl <= 0) {
            return res.status(401).json({ error: 'Token expired' });
        }

        // NX: only set the key if it does not already exist (atomic check-and-set).
        const isUnique = await redisClient.set(`jti:${jti}`, 'used', {
            EX: ttl,
            NX: true
        });

        if (!isUnique) {
            return res.status(401).json({ error: 'Token has already been used (Replay attack detected)' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
```

The `NX` flag is the load-bearing detail here: `SET key value NX` only succeeds if the key doesn't already exist, and Redis executes it atomically. Without atomicity, two concurrent requests carrying the same replayed token could both pass a "does it exist?" check before either writes the key — a classic TOCTOU race that a naive `GET` then `SET` implementation would miss.

## Hardening Recommendations

1. **Short token lifespans.** Cap access token lifetime at 15 minutes or less — this bounds how long each `jti` entry needs to live in the cache and shrinks the replay window even before the `jti` check runs.
2. **Enforce nonces in the OIDC flow itself.** Before redirecting to the authorization server, an SPA should generate a cryptographically random `nonce`, persist it locally (e.g. `sessionStorage`), and verify it against the `nonce` claim returned in the ID token — this specifically defends the login handshake against replayed authorization responses, distinct from the `jti` check defending API calls after login.
3. **Treat cache unavailability as a security event**, not a reason to skip the check — see the companion article on JWT revocation via Redis for the fail-closed pattern this implies.

By combining atomic `jti` tracking at the API layer with nonce verification at the OIDC layer, a team can close the stateless-replay gap for high-value transactional endpoints without giving up JWTs' core scalability advantage.
