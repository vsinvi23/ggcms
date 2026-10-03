---
title: "API Security From Scratch: Stateful Sessions to Stateless JWTs"
description: "How migrating from stateful sessions to stateless JWTs introduces the alg:none forgery risk, and how to build a hardened token pipeline with RS256 pinning, JWKS rotation, and Redis-backed revocation."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "jwt"
  - "alg-none"
  - "rs256"
  - "jwks"
  - "token-revocation"
  - "api-security"
---

# API Security from Scratch: Migrating from Stateful Sessions to Cryptographic Stateless Tokens

The architectural transition from monoliths to microservices, mobile apps, and distributed cloud gateways necessitates a fundamental shift in how we track identity. Classic monolithic web apps rely on **stateful sessions** stored in backend memory or shared relational tables. This model falls apart at scale due to latency, database overhead, and cross-domain limitations.

Migrating to **stateless cryptographic tokens** (like JSON Web Tokens - JWTs) solves scalability but introduces dangerous security traps if implemented incorrectly. If your stateless token parser is naive, an attacker can forge identity claims, execute privilege escalation, or abuse stolen tokens indefinitely.

---

## The Problem: The Stateless Validation Gap

In a stateful model, the backend holds the source of truth. Revoking a session is simple: delete its record from database storage.

In a stateless model, the token *itself* is the source of truth, containing signed metadata claims (e.g., `user_id`, `role`, `expiry`). The database is bypassed entirely during standard authorization checks to save performance.

```text
+---------------------------------------------------------------------------------+
|                        Stateful vs. Stateless Architectures                     |
+---------------------------------------------------------------------------------+

  [STATEFUL SESSION FLOW]
  Client --(Cookie: session_123)--> Gateway --> Query DB --> [Validate Session Record]
                                                              (Slower, Bottleneck)

  [STATELESS TOKEN FLOW]
  Client --(Auth: Bearer JWT)-----> Gateway --> [Verify Signature Locally via Public Key]
                                                 (Extremely Fast, Highly Scalable)
```

However, because the server no longer checks a central database on every request, we create two critical security issues:

1. **The Trust Boundary Vulnerability:** How do we prove the client didn't modify their `user_id` or `role` inside the token?
2. **The Revocation Problem:** If a stateless token is stolen, how do we invalidate it before its hard absolute expiration time?

---

## Vulnerable Code: The Trusting Token Parser

The most famous architectural vulnerability in custom JWT parsers is honoring the user-supplied `alg` header. If a library blindly trusts this header, an attacker can craft a token and set `"alg": "none"`, which instructs the verification engine to skip cryptographic signature checks entirely.

```javascript
// VULNERABLE JWT VALIDATION MIDDLEWARE
const express = require('express');
const app = express();

app.get('/api/v1/user/data', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    try {
        const [headerB64, payloadB64, signatureB64] = token.split('.');

        // VULNERABILITY 1: Base64 decoding the header to extract the algorithm
        const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

        // VULNERABILITY 2: Honorable trust of 'none' algorithm.
        // If the attacker specifies "none", the engine assumes no cryptographic check is needed!
        if (header.alg === 'none') {
            req.user = payload; // Directly trust user-supplied claims!
            return next();
        }

        // ... otherwise perform signature checks ...
    } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
    }
});
```

### The Exploit Vector

The attacker takes their standard low-privilege JWT payload:
`{"user_id": 99, "role": "USER"}`

Modifies it to:
`{"user_id": 1, "role": "ADMIN"}`

Re-encodes the header with `"alg": "none"`, stitches them together as `headerBase64.payloadBase64.`, and sends the request without a signature. The vulnerable API treats this as a valid, fully authorized administrator token.

---

## Secure Mitigation: Asymmetric (RS256) Keys & Redis Blacklisting

To design a robust, secure stateless API auth system, we must enforce three structural rules:

1. **Mandate Asymmetric Cryptography (RS256):** The identity provider signs tokens using a private key, and downstream microservices validate them using a public key. Downstream services do not need access to the private key, limiting the blast radius of key compromises.
2. **Explicit Algorithm Pinning:** Hardcode the verification library to only accept one specific algorithm (e.g., `RS256`). Completely reject all other headers.
3. **Sliding-Window Redis Blacklist:** Maintain an in-memory, high-speed Redis blacklist. When a user logs out or has their credentials revoked, write the token's unique ID (`jti` claim) to Redis with an expiration matching the token's remaining lifespan. Check this blacklist on every API request.

### Production-Ready Token Validation Engine (Node.js)

Below is a complete, secure validation module using asymmetric signing (`RS256`), algorithm pinning, and Redis-backed instant revocation checking.

```javascript
const jwt = require('jsonwebtoken');
const redis = require('redis');

const redisClient = redis.createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// In a real environment, load this asymmetric public key from a secure vault or JWKS endpoint
const PUBLIC_VERIFICATION_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0G9...
-----END PUBLIC KEY-----`;

/**
 * Express middleware to enforce secure, stateless JWT authorization
 */
async function authenticateStatelessToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <JWT>"

    if (!token) {
        return res.status(401).json({ error: "Access token required." });
    }

    try {
        // Step 1: Verify JWT with strict algorithm pinning.
        // Explicitly defining algorithms=['RS256'] prevents algorithm fallback attacks.
        const decoded = jwt.verify(token, PUBLIC_VERIFICATION_KEY, {
            algorithms: ['RS256'],
            audience: 'https://api.target-app.com',
            issuer: 'https://auth.target-app.com'
        });

        // Step 2: Validate JWT ID (jti) presence
        if (!decoded.jti) {
            return res.status(401).json({ error: "Invalid token claims: JTI missing." });
        }

        // Step 3: Check Redis Blacklist for revoked tokens
        const isRevoked = await redisClient.get(`revoked_token:${decoded.jti}`);
        if (isRevoked) {
            return res.status(401).json({
                error: "Unauthorized",
                code: "TOKEN_REVOKED",
                details: "This token has been invalidated."
            });
        }

        // Step 4: Populate user context safely
        req.user = {
            id: decoded.sub,
            role: decoded.role,
            tenantId: decoded.tenant_id
        };

        next();

    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: "Token expired.", code: "TOKEN_EXPIRED" });
        }
        return res.status(401).json({ error: "Invalid or tampered signature." });
    }
}

/**
 * Revokes a stateless token instantly by blacklist registration.
 * @param {string} token - The raw JWT to invalidate.
 */
async function revokeToken(token) {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.jti || !decoded.exp) return;

    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    if (ttl > 0) {
        // Register token JTI to Redis with expiry set to remaining TTL of the token
        await redisClient.setEx(`revoked_token:${decoded.jti}`, ttl, 'true');
    }
}
```

---

## Architectural Protections

1. **Short Token Lifespans:** Set JWT lifetimes to a maximum of 15 minutes. Use high-entropy, statefully-tracked **Refresh Tokens** stored in HTTP-only cookies to silently request new short-lived JWTs.
2. **JWKS (JSON Web Key Sets) Endpoints:** Configure your API microservices to dynamically fetch public verification keys from a secure authentication server endpoint (`/.well-known/jwks.json`). Implement local caching and cache-invalidation rules to handle automatic cryptographic key rotations gracefully.
3. **Use Standardized Claims:** Align token payload claims with RFC 7519 standards (`sub` for subject user ID, `iss` for issuer origin, `aud` for target audience, `exp` for expiration timestamp, and `jti` for unique token ID).
