---
title: "OAuth 2.0 Token Introspection (RFC 7662): Validating Opaque Tokens"
description: "Why opaque access tokens require a backchannel introspection call to the Authorization Server, and how to build a secure, rate-limited, short-TTL-cached introspection middleware that resists harvesting and denial-of-service."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "oauth-2"
  - "token-introspection"
  - "rfc-7662"
  - "opaque-tokens"
  - "revocation"
---

# OAuth 2.0 Token Introspection (RFC 7662): Validating Opaque Tokens

## The Problem

Modern distributed applications face a key dilemma when selecting token formats: self-contained JSON Web Tokens (JWTs) simplify validation but leak internal metadata and cannot be easily revoked before their expiration. To protect internal architectures and support immediate revocation, many organizations issue completely opaque tokens (randomly generated high-entropy strings, such as UUIDv4 or hex-encoded sequences).

Since an opaque token contains no readable identity or cryptographic signatures, a Resource Server (RS) cannot validate it locally. It must verify the token's validity, scope, and lifespan by making an out-of-band backchannel API call to the Authorization Server (AS). However, this introduces substantial latency, couples the RS directly to the AS, and exposes a critical validation endpoint that — if misconfigured — can become a prime target for credential harvesting, token spoofing, or denial-of-service (DoS) attacks.

## The Mental Model

Opaque token validation relies on RFC 7662 Token Introspection. The client presents an opaque token to the RS. The RS behaves as an introspection client, calling the AS over a highly secure, authenticated backchannel.

```text
+--------+           Opaque Token          +-----------------+
|        | -------------------------------> |                 |
| Client |                                  | Resource Server |
|        | <------------------------------- |  (RS / API)     |
+--------+         Protected Data           +-----------------+
                                                    |
                                    POST /introspect| (Authenticated Basic/mTLS)
                                    token=opaque_str|
                                                    v
                                           +-----------------+
                                           |  Authorization  |
                                           |   Server (AS)   |
                                           +-----------------+
```

## Attack Vectors

1. **Introspection Harvesting & Credential Leaks:** If the introspection endpoint `/introspect` on the AS does not strictly enforce client authentication, any malicious actor who intercepts or guesses an opaque token can query the endpoint to learn its metadata, user identities, and scopes.
2. **Replay of De-authorized Tokens:** If the RS relies heavily on client-side caching of introspection responses without checking the AS, a revoked token may continue to grant access during the cache time-to-live (TTL) window.
3. **Database & Network Denial of Service (DoS):** Because every inbound request to the RS triggers an outbound HTTP call to the AS to introspect the token, attackers can flood the RS with dummy tokens. This forces the RS to generate a wave of backchannel calls to the AS, saturating network connections and overwhelming the AS's token database.

## Defensive Architecture

Mitigating these risks requires a multi-layered defense focused on transport security, rate-limiting, and short-term secure caching.

### 1. Enforce Introspection Client Authentication

The AS must require strong authentication for the RS. This is typically achieved via OAuth 2.0 client credentials (Basic Auth using the RS client ID and secret) or mutual TLS (mTLS).

### 2. Implementation: Secure Introspection Middleware (Node.js)

Here is an idiomatic Node.js implementation of a secure introspection middleware that includes short-term memory caching to minimize database roundtrips while enforcing structure checks.

```javascript
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache introspection responses for 10 seconds to balance freshness and performance
const tokenCache = new NodeCache({ stdTTL: 10, checkperiod: 2 });

async function introspectMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7);

  // Validate token format before network call to prevent injection/DoS
  if (!/^[a-zA-Z0-9\-_]{16,128}$/.test(token)) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  const cachedResponse = tokenCache.get(token);
  if (cachedResponse) {
    if (!cachedResponse.active) {
      return res.status(403).json({ error: 'Token is inactive (cached)' });
    }
    req.tokenContext = cachedResponse;
    return next();
  }

  try {
    const response = await axios.post(
      process.env.INTROSPECT_ENDPOINT,
      new URLSearchParams({ token }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: process.env.RS_CLIENT_ID,
          password: process.env.RS_CLIENT_SECRET,
        },
        timeout: 2000, // 2-second strict timeout to prevent RS starvation
      }
    );

    const { active, scope, exp, sub, client_id } = response.data;

    if (!active) {
      tokenCache.set(token, { active: false });
      return res.status(403).json({ error: 'Token is inactive' });
    }

    // Verify expected audience or resource constraints
    if (response.data.aud && response.data.aud !== process.env.RS_AUDIENCE) {
      return res.status(403).json({ error: 'Audience mismatch' });
    }

    const context = { active: true, scope, exp, sub, client_id };
    tokenCache.set(token, context);
    req.tokenContext = context;
    next();
  } catch (error) {
    console.error('Introspection failure:', error.message);
    return res.status(500).json({ error: 'Unable to validate token' });
  }
}
```

## Best Practices

- **Rate-Limit Introspection Requests:** Limit the number of failed token validation requests per IP on the RS to protect the AS against flooding attacks.
- **Short-Lived Caching:** Use a cache TTL of no more than 15-30 seconds to maintain a balance between API latency and immediate revocation capabilities.
- **Backchannel Isolation:** Ensure the backchannel communication between the RS and the AS occurs over a private virtual cloud network (VPC) whenever possible.

## Key Takeaways

- Opaque tokens trade local validation speed for revocability — the RS must call the AS's `/introspect` endpoint, authenticated with its own client credentials or mTLS, on every request that misses cache.
- A short-lived cache (15-30 seconds) is the right trade-off between reducing AS load and keeping revocation effectively immediate; caching much longer than that reopens the revoked-token replay window.
- Validate token format before making the network call, and enforce a strict request timeout, so that a flood of garbage tokens cannot be used to exhaust the RS's connections to the AS.
