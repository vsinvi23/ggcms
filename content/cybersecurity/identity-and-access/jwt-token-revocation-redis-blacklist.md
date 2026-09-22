---
title: "JWT Revocation: Real-Time Token Blacklisting with Redis"
description: "Why stateless JWTs can't be revoked before their expiry, and how to build a fail-closed Redis blacklist keyed on jti with TTLs that track token lifetime exactly."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "jwt"
  - "token-revocation"
  - "redis"
  - "jti"
  - "fail-closed"
  - "logout"
---

# JWT Revocation: Real-Time Token Blacklisting with Redis

## The Problem: Stateless Expiration vs. Immediate Revocation

JWTs carry their own signature and expiration (`exp`) inside the token payload, which is what makes them stateless — no database round trip needed to validate a request. That same property means a JWT can't be invalidated before its scheduled `exp` by any mechanism intrinsic to the token itself.

If a user logs out, resets a compromised password, has their roles downgraded, or reports a stolen device, the previously issued JWT is still fully valid as far as any decoupled service checking its signature is concerned. Shrinking token lifetime to 5 minutes narrows the exposure window but does not close it — and doesn't meet compliance requirements that call for immediate, real-time session termination.

## Architectural Blueprint: The Hybrid Revocation Engine

The fix is a hybrid model: keep stateless signature validation as the fast path, and add a real-time blocklist check backed by an in-memory store (Redis) as a second, stateful gate. Revoked tokens are tracked by their `jti` (JWT ID) claim, with the blocklist entry's TTL set to exactly the token's remaining lifetime — once the token would have expired anyway, Redis evicts the entry automatically, so the blocklist never grows unbounded.

```
+------------+             +-------------+             +---------------+             +-------------+
| Client SPA |             | API Gateway |             |  Redis Cache  |             | Auth Server |
+------------+             +-------------+             +---------------+             +-------------+
      |                           |                            |                            |
      | 1. Request with Bearer    |                            |                            |
      |-------------------------->|                            |                            |
      |                           | 2. Extract 'jti' & check   |                            |
      |                           |    blacklist existence     |                            |
      |                           |--------------------------->|                            |
      |                           | <--------------------------|                            |
      |                           |    Result: NOT_BLACKLISTED |                            |
      |                           |                            |                            |
      |                           | 3. Execute normal route    |                            |
      |<--------------------------|                            |                            |
      |                           |                            |                            |
      | 4. User triggers Logout   |                            |                            |
      |------------------------------------------------------------------------------------>|
      |                           |                            | 5. Add 'jti' to blacklist  |
      |                           |                            |    with TTL = Token Exp    |
      |                           |                            |<---------------------------|
```

## Technical Implementation (Node.js / TypeScript, `ioredis`)

Built to fail-secure: if Redis is unreachable, requests are rejected rather than silently allowed through.

```typescript
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';

interface TokenPayload extends jwt.JwtPayload {
  jti: string;
  sub: string;
}

export class JWTRevocationService {
  private redis: Redis;
  private readonly blacklistPrefix = 'blacklist:jti:';

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // don't buffer commands if the connection drops
    });

    this.redis.on('error', (err) => {
      console.error('CRITICAL: Redis connection error in JWTRevocationService', err);
    });
  }

  /** Revoke a token immediately by blacklisting its unique jti. */
  public async revokeToken(token: string, jwtSecret: string): Promise<void> {
    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
    if (!decoded.jti) {
      throw new Error('MISSING_JTI: token must carry a unique jti to be revocable');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const remainingTime = decoded.exp ? decoded.exp - currentTime : 0;
    if (remainingTime <= 0) {
      return; // already expired, nothing to blacklist
    }

    const key = `${this.blacklistPrefix}${decoded.jti}`;
    // TTL matches the token's own remaining lifespan exactly.
    await this.redis.set(key, 'revoked', 'EX', remainingTime);
  }

  /**
   * Validates a JWT against both its cryptographic signature and the
   * Redis blocklist. Fail-closed: if Redis is down, validation fails.
   */
  public async validateToken(token: string, jwtSecret: string): Promise<TokenPayload> {
    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
    if (!decoded.jti) {
      throw new Error('INVALID_TOKEN_STRUCTURE: token missing jti claim');
    }

    const key = `${this.blacklistPrefix}${decoded.jti}`;
    let isBlacklisted: string | null;
    try {
      isBlacklisted = await this.redis.get(key);
    } catch (err) {
      // Fail-secure: an unreachable revocation store is treated as a
      // security-relevant outage, not a reason to skip the check.
      throw new Error('SECURITY_SYSTEM_UNAVAILABLE: revocation check failed (cache outage)');
    }

    if (isBlacklisted !== null) {
      throw new Error('TOKEN_REVOKED: this token has been explicitly revoked or logged out');
    }

    return decoded;
  }
}
```

## Defensive Hardening Checklist

1. **Enforce `jti` generation.** Every issued access token must carry a globally unique `jti` (a UUIDv4 is sufficient) — without one, there's nothing to key the blocklist on.
2. **Fail-closed on cache outage.** Don't silently allow requests through if Redis is unreachable; that turns a Redis outage into an authentication bypass. Return `503 Service Unavailable` and treat revocation-store unreachability as an active-compromise-adjacent event worth alerting on, not a routine degradation.
3. **Run Redis with replication/Sentinel or Cluster.** A single-node blocklist is a single point of failure — and asynchronous replication lag can let a revoked token still validate against a stale regional replica for a short window; size your consistency requirements accordingly.
4. **Terminate long-lived connections on revocation.** For WebSockets or SSE, hook the revocation event to actively close the connection rather than waiting for the client's next reconnect/poll cycle.
