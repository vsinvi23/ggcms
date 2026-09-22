---
title: "OAuth 2.0 Token Introspection: Validating Opaque Tokens Across Microservices"
description: "How to validate opaque OAuth 2.0 access tokens with RFC 7662 introspection, including a cached Node.js/TypeScript middleware implementation and cache-TTL hardening rules."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "oauth-2"
  - "token-introspection"
  - "rfc-7662"
  - "opaque-tokens"
  - "microservices"
  - "access-token-revocation"
---

# OAuth 2.0 Token Introspection: Validating Opaque Tokens Across Microservices

## The Problem: Stateless Payload Leakage vs. Opaque Verification Latency

Many distributed systems pass identity between microservices using JSON Web Tokens (JWTs). Standard JWTs have two architectural drawbacks: **data exposure** and **revocation lag**.

Because JWTs can be decoded by anyone who holds them, encoding sensitive claims (internal roles, feature flags, PII) in a client-visible JWT exposes backend structure to the public web. And because JWT signature validation is stateless, revoking an access token instantly across decoupled services is hard without a real-time revocation pipeline.

The alternative is **opaque tokens** — random, high-entropy strings with zero structured data. The client holds a meaningless handle; each microservice validates it in real time against the Authorization Server (AS). But if every downstream call hits the AS database directly, the AS becomes a single point of failure and a latency bottleneck.

**OAuth 2.0 Token Introspection (RFC 7662)**, combined with short-lived local caching at the resource server, solves this without reintroducing stateless-JWT trade-offs.

---

## Architectural Blueprint: The RFC 7662 Verification Flow

RFC 7662 defines a standard HTTP POST protocol where microservices, acting as Resource Servers (RS), query the Authorization Server's protected `/introspect` endpoint with a client-submitted opaque token. To keep latency low, services cache verification results locally for a short, strictly bounded period.

```
+------------+             +-----------------+             +-------------------+             +---------------+
| Client SPA |             | Microservice RS |             | Local Cache (TTL) |             | Auth Server AS|
+------------+             +-----------------+             +-------------------+             +---------------+
      |                             |                                |                               |
      | 1. Request + Opaque Token   |                                |                               |
      |---------------------------->|                                |                               |
      |                             | 2. Check local token cache     |                               |
      |                             |------------------------------->|                               |
      |                             | <------------------------------|                               |
      |                             |    Cache Miss                  |                               |
      |                             |                                |                               |
      |                             | 3. POST /introspect (RFC 7662)                                 |
      |                             |    (Basic Auth or Bearer)                                      |
      |                             |--------------------------------------------------------------->|
      |                             |                                |                               | 4. Validate
      |                             | <--------------------------------------------------------------|    & Return Claims
      |                             |    JSON: { "active": true, ... }                               |
      |                             |                                |                               |
      |                             | 5. Populate Token Cache (Short TTL)                            |
      |                             |------------------------------->|                               |
      |                             |                                |                               |
      | 6. Serve Request Data       |                                |                               |
      |<----------------------------|                                |                               |
```

---

## Technical Implementation

Below is a production-ready Node.js/TypeScript middleware for downstream microservices. It intercepts incoming HTTP calls, performs RFC 7662 introspection, parses standard claims, and caches the authenticated state with an expiry-aware TTL.

```typescript
import axios from 'axios';
import NodeCache from 'node-cache';

interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  aud?: string;
  iss?: string;
}

export class IntrospectionMiddleware {
  // Local cache to prevent Authorization Server bottlenecking
  private tokenCache: NodeCache;

  constructor(
    private introspectionEndpoint: string,
    private clientId: string,
    private clientSecret: string,
    cacheDefaultTtlSeconds: number = 60
  ) {
    this.tokenCache = new NodeCache({
      stdTTL: cacheDefaultTtlSeconds,
      checkperiod: 10,
      useClones: false,
    });
  }

  /**
   * Express-compatible middleware for introspecting incoming opaque tokens
   */
  public getHandler() {
    return async (req: any, res: any, next: () => void) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'invalid_request', error_description: 'Missing Bearer token' });
      }

      const opaqueToken = authHeader.substring(7);

      try {
        const tokenDetails = await this.introspectTokenWithCache(opaqueToken);

        if (!tokenDetails.active) {
          return res.status(401).json({ error: 'invalid_token', error_description: 'The access token is inactive or revoked' });
        }

        // Attach validated token claims to request context
        req.tokenClaims = tokenDetails;
        next();
      } catch (err) {
        console.error('CRITICAL: Token Introspection failure', err);
        // Fail closed for security safety
        return res.status(500).json({ error: 'server_error', error_description: 'Identity verification system is currently offline' });
      }
    };
  }

  private async introspectTokenWithCache(token: string): Promise<IntrospectionResponse> {
    // 1. Check local memory cache
    const cachedData = this.tokenCache.get<IntrospectionResponse>(token);
    if (cachedData) {
      return cachedData;
    }

    // 2. Perform outbound Introspection Call (RFC 7662)
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await axios.post<IntrospectionResponse>(
      this.introspectionEndpoint,
      new URLSearchParams({ token }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json',
        },
        timeout: 2000, // Strict timeout to keep microservice latency low
      }
    );

    const data = response.data;

    if (!data || typeof data.active !== 'boolean') {
      throw new Error('INVALID_INTROSPECTION_RESPONSE: Response payload must contain boolean "active" claim');
    }

    // 3. Cache the introspection result if active
    if (data.active) {
      const remainingTtl = this.calculateCacheTtl(data.exp);
      if (remainingTtl > 0) {
        this.tokenCache.set(token, data, remainingTtl);
      }
    }

    return data;
  }

  private calculateCacheTtl(expSecs?: number): number {
    if (!expSecs) {
      return 30; // Default fallback TTL
    }
    const currentTimeSecs = Math.floor(Date.now() / 1000);
    const timeToExpiry = expSecs - currentTimeSecs;

    // Cap TTL to maximum 120 seconds to guarantee timely revocation checks
    return Math.max(0, Math.min(timeToExpiry, 120));
  }
}
```

---

## Defensive Hardening Checklist

1. **Mutual Authenticated Introspection**: Always require downstream microservices to authenticate themselves to the Authorization Server (Client Credentials, Basic Auth, or mTLS) before querying the introspection endpoint. An unauthenticated introspection endpoint lets any caller check the state of arbitrary tokens.
2. **Cap Introspection TTL**: Keep local cache TTLs low (typically 30–60 seconds, hard-capped as shown above). A high TTL reintroduces the revocation lag that opaque tokens exist to fix.
3. **Handle Empty Scopes**: Ensure microservices validate not just `"active": true`, but also the returned `scope` and `aud` fields before processing a request — an active token for the wrong audience or scope must still be rejected.
4. **Fail Closed on Introspection Errors**: If the introspection call times out or the AS is unreachable, reject the request (as the middleware above does with a `500`) rather than treating an unverifiable token as valid.
