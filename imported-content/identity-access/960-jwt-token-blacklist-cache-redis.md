# JWT Revocation Strategies: Implementing Real-Time Token Blacklisting via Redis Caching

## The Problem
JSON Web Tokens (JWTs) are stateless by design. Once issued, a JWT is valid until it expires. This statelessness is great for scalability but introduces a massive security flaw: if a user logs out, resets their password, or is banned, their existing JWT remains active. Without a revocation strategy, malicious actors or disgruntled employees retain access until the `exp` claim is met.

## Architectural Approach: Redis Blacklist
To revoke stateless tokens instantly without introducing a massive database bottleneck, we introduce a fast, in-memory cache (Redis) as a token blacklist. Instead of validating every token against a database, the API gateway or microservice checks if the token's unique identifier (`jti`) exists in the Redis blacklist.

```text
+--------+       +-------------+       +---------------+
| Client |------>| API Gateway |------>| Microservices |
+--------+ JWT   +-------------+       +---------------+
                       | 
                       | 1. Extract JTI
                       | 2. Check EXISTS
                       v
                 +-------------+
                 | Redis Cache | (Token Blacklist)
                 +-------------+
```

## Mechanism
1. **Assign a `jti`**: Every issued JWT must include a `jti` (JWT ID) claim—a secure random UUID.
2. **Revocation Event**: Upon logout or security event, the `jti` is extracted from the token and written to Redis.
3. **TTL Matching**: The Redis key's Time-To-Live (TTL) is set to match the remaining lifespan of the JWT. Once the JWT naturally expires, it drops out of Redis automatically, preventing memory bloat.

## Implementation (Node.js & Redis)

### 1. Issuing the Token with a JTI
```typescript
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

function generateAccessToken(userId: string) {
  const payload = { sub: userId };
  const options = {
    expiresIn: '15m', // Short lived
    jwtid: uuidv4(),  // Unique identifier for the token
  };
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}
```

### 2. Revoking the Token
When a user logs out, the server decodes the token, calculates the remaining time to live, and stores the `jti` in Redis.

```typescript
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

const redis = new Redis(process.env.REDIS_URL);

async function revokeToken(token: string) {
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  if (!decoded || !decoded.jti || !decoded.exp) return;

  const now = Math.floor(Date.now() / 1000);
  const remainingTTL = decoded.exp - now;

  if (remainingTTL > 0) {
    // Store the JTI in Redis with an expiration matching the token's exp
    await redis.set(`blacklist:${decoded.jti}`, 'revoked', 'EX', remainingTTL);
  }
}
```

### 3. Middleware Validation
Every protected route must pass through middleware that validates the JWT signature and checks the Redis blacklist.

```typescript
import { Request, Response, NextFunction } from 'express';

async function verifyTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('Unauthorized');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
    
    // Check Redis Blacklist
    const isBlacklisted = await redis.exists(`blacklist:${decoded.jti}`);
    if (isBlacklisted) {
      return res.status(401).send('Token revoked');
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send('Invalid token');
  }
}
```

## Scaling Considerations
- **Bloom Filters**: For massive scale where checking Redis on every request introduces latency, deploy a Bloom Filter at the edge. A Bloom Filter can tell you definitively if a token is *not* blacklisted with zero network calls.
- **Microservice Distribution**: Instead of a central Redis cluster, utilize a publish-subscribe (Pub/Sub) model to broadcast revocation events to local caches running alongside each microservice.
