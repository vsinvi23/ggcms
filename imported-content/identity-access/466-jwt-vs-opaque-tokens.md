# JWT vs. Opaque Tokens: Solving the Stateless Revocation Dilemma

## The Problem: The Scalability vs. Control Paradox
When designing API authentication, developers face a critical architectural choice between two token formats: **JWTs (Self-Contained/Stateless)** or **Opaque Tokens (Reference/Stateful)**.

*   **The JWT (Stateless) Problem:** JWTs carry user data and permissions in their payload. A Resource Server verifies them entirely offline using a public key. This scales beautifully because it eliminates database round-trips. However, this decoupling creates a massive security gap: **once issued, a JWT is completely valid until its expiration time (`exp`).** If a user is banned, changes their password, or loses their device, you cannot easily revoke that token without introducing centralized state, which defeats the stateless design.
*   **The Opaque Token (Stateful) Problem:** An opaque token is simply a high-entropy random string (e.g., `db82f71...`). To validate it, the Resource Server must perform a database lookup or call an authorization server's `/introspect` endpoint on *every single incoming API request*. While this gives you **instant revocation control**, it hammers your database or Identity Provider (IdP), drastically increasing API response latency and creating a single point of failure.

To resolve this, modern secure architectures deploy a **Hybrid Token Pattern**: using stateless JWTs for general request routing, backed by an ultra-high-speed memory cache (Redis) acting as a token revocation blacklist.

---

## Technical Architectures: Dueling Validation Patterns

### Pattern A: Stateful Opaque Token (Database Bottleneck)
Every service must request state from the central session store.

```
Client ----[ API Request: Opaque Token ]----> API Gateway
                                                   |
                                                   v (Sync Database Query)
                                            [ Session Database ]
```

### Pattern B: Pure Stateless JWT (Zero Control)
API Gateway validates the token entirely offline. If the token was stolen or the user was deleted, the system remains completely blind to it until `exp` runs out.

```
Client ----[ API Request: JWT ]-------------> API Gateway
                                                   |
                                                   v (Offline Cryptographic Check)
                                             Valid/Invalid? (Matches Signature)
```

### Pattern C: Hybrid Architecture (Near-Instant Revocation & Scalable)
Offline cryptographic validation handles 99% of verification. A lightning-fast, asynchronous Redis lookup checks if the token's unique ID (`jti`) is blacklisted.

```
Client ----[ API Request: JWT ]-------------> API Gateway
                                                   |
                                                   +---> 1. Validate RS256 Signature (Offline)
                                                   |
                                                   +---> 2. Query Redis for 'jti' Blacklist
                                                               |
                                                               v (O(1) Redis Check)
                                                         [ Redis Cache ]
```

---

## Token Type Breakdown

| Attribute | Opaque (Reference) Token | JWT (Value) Token | Hybrid Pattern |
| :--- | :--- | :--- | :--- |
| **Validation Overhead** | High (Network lookup on every request) | None (Offline cryptography) | Low (Fast Redis lookup) |
| **Revocation Propagation** | Instant (Real-time) | Delayed (Depends on token `exp` lifespan) | Near-Instant (< 1 second) |
| **Network Dependency** | Synchronous dependency on session store | Fully independent | Light dependency on memory store |
| **Data Size** | Small (Random 32-character string) | Large (Header, payload, and signature) | Large |
| **Confidentiality** | High (No data exposed on client) | Low (Data visible unless JWE is used) | Low (No secrets in payload) |

---

## Implementation: TypeScript Hybrid Middleware
Below is a highly optimized TypeScript middleware for an API Gateway or Resource Server. It validates the cryptographic signature of an incoming JWT and then executes a high-speed Redis check against a blacklist of revoked token identifiers (`jti`).

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

// Initialize high-speed Redis client for blacklist lookup
const redisClient = createClient({ url: 'redis://localhost:6379' });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis (should run during server startup)
(async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
})();

interface TokenPayload extends jwt.JwtPayload {
  jti: string; // Unique Token ID claim (mandatory for hybrid pattern)
  sub: string; // User identity
}

const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || 'your-asymmetric-public-key-here';

/**
 * Hybrid Validation Middleware
 */
export async function authenticateHybridToken(
  req: Request & { user?: TokenPayload },
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Cryptographic Validation (Offline, no network roundtrip to auth server)
    const decoded = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: 'https://auth.company.com',
      audience: 'https://api.company.com'
    }) as TokenPayload;

    // Reject tokens that do not possess a unique Token ID (jti)
    if (!decoded.jti) {
      return res.status(401).json({ error: 'Malformed token: Missing claim "jti"' });
    }

    // 2. Blacklist Check (Near-Instant, O(1) Redis memory query)
    const isBlacklisted = await redisClient.get(`blacklist:${decoded.jti}`);
    if (isBlacklisted !== null) {
      return res.status(401).json({ error: 'Token has been explicitly revoked.' });
    }

    // Attaching decoded user structure to request
    req.user = decoded;
    next();
  } catch (err: any) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

/**
 * Authorization Server Helper: Blacklists a token on logout or password reset
 * Sets TTL equal to the remaining lifetime of the JWT so Redis self-cleans.
 */
export async function revokeToken(jti: string, expirationTimeUnixSec: number): Promise<void> {
  const currentTimeUnixSec = Math.floor(Date.now() / 1000);
  const remainingLifeSec = expirationTimeUnixSec - currentTimeUnixSec;

  if (remainingLifeSec > 0) {
    // Save to Redis and configure key auto-expiration to free memory
    await redisClient.set(`blacklist:${jti}`, 'revoked', {
      EX: remainingLifeSec
    });
  }
}
```

## Architectural Design Guidance
1.  **Always enforce `jti` (JWT ID):** If using JWTs, your Identity Provider must inject a unique cryptographic UUID into the `jti` claim of every access token it issues. This identifier acts as the tracking ID for blacklisting.
2.  **Short Exp Times Are Mandatory:** The hybrid blacklist model should be treated as a secondary defense. Keep Access Token lifespans incredibly short (e.g., 10 to 15 minutes). This limits the memory pressure on Redis, as blacklisted tokens only need to stay in Redis until their original `exp` time is reached.
3.  **Graceful Fail-Open vs. Fail-Closed on Cache Outages:** Decide your security posture in case Redis goes offline. A **fail-closed** setup blocks validation if Redis is unreachable (highly secure, but risks service disruption). A **fail-open** setup logs the Redis outage and falls back to pure cryptographic validation (high availability, but allows revoked tokens during the outage).
