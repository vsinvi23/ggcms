# JWT Revocation Strategies: Fast Token Blacklisting using Redis

## The Problem: The Instant Revocation Dilemma of Stateless JWTs
One of the most significant trade-offs of using stateless JSON Web Tokens (JWTs) for authentication is the lack of immediate revocation capability. Because a Resource Server (RS) validates a JWT autonomously by checking its signature and expiration (`exp`) claim, the server has no native way of knowing if a token has been revoked before its natural expiration. 

This architectural characteristic creates critical security vulnerabilities. If a user logs out, changes their password, or has their account suspended, any previously issued JWT remains fully valid. An attacker who has stolen a JWT (e.g., from a client-side device or intercepting an HTTP request) can continue to access protected APIs until the token reaches its `exp` deadline. While using short lifetimes (e.g., 5-15 minutes) reduces the exposure window, it does not meet the strict security compliance requirements of immediate, real-time access termination (such as deauthenticating a stolen device).

## The Mental Model: Hybrid Validation with Redis Blocklisting
To achieve instant revocation without sacrificing all the scalability benefits of stateless JWTs, we can implement a **hybrid validation model** using an in-memory, distributed database like Redis as a real-time blocklist. 

When a user initiates a logout or an administrator deactivates an account, the active JWT's unique identifier (`jti`) is written to Redis. The resource server then validates tokens in two sequential phases:
1. **Stateless Signature Check:** The RS verifies the JWT's signature, algorithm, and lifetime. If the token is cryptographically invalid or naturally expired, the request is instantly rejected, completely shielding the database from malicious spam traffic.
2. **Stateful Blocklist Check:** If the signature is valid, the RS performs a sub-millisecond check against Redis to ensure the token's `jti` is not in the blocklist.

```
 Client                                 Resource Server                       Redis Cache
   |                                           |                                   |
   |--- 1. Send API Request + JWT(jti) ------->|                                   |
   |                                           | [Verify Signature & Exp (PASS)]   |
   |                                           |                                   |
   |                                           |--- 2. GET blacklist:{jti} ------->|
   |                                           |<-- 3. Key NOT Found (NOT Blocked)-|
   |                                           |                                   |
   |<-- 4. Successful Response (HTTP 200) -----|                                   |
   |                                           |                                   |
   |--- 5. User Logs Out (Send JWT to /logout)->|                                   |
   |                                           |--- 6. SETEX blacklist:{jti} TTL ->|
   |                                           |                                   |
   |                                           |                                   |
   |--- 7. Replay Same JWT(jti) -------------->|                                   |
   |                                           | [Verify Signature & Exp (PASS)]   |
   |                                           |                                   |
   |                                           |--- 8. GET blacklist:{jti} ------->|
   |                                           |<-- 9. Key Found (BLOCKED!) -------|
   |                                           |                                   |
   |<-- 10. HTTP 401 Unauthorized -------------|                                   |
```

Crucially, blacklisted keys are stored in Redis with a Time-To-Live (TTL) configured to match the remaining lifespan of the JWT (`token_exp - current_time`). Once the token reaches its original expiration, it is rejected by the stateless signature check, allowing Redis to automatically purge the blocklist entry, keeping the memory footprint minimal.

## Node.js Implementation of Token Revocation and Validation
Below is an Express middleware implementation using Redis to handle JWT revocation:

```javascript
const redis = require('redis');
const jwt = require('jsonwebtoken');

const redisClient = redis.createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// 1. Middleware to validate tokens against the blacklist
async function requireValidToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Step A: Stateless Validation (Verify signature and expiration first)
        const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
        const { jti, exp } = decoded;

        if (!jti) {
            return res.status(400).json({ error: 'Tokens must contain a unique JTI claim' });
        }

        // Step B: Stateful Verification (Check Redis Blocklist)
        const isBlacklisted = await redisClient.get(`blacklist:${jti}`);
        if (isBlacklisted) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// 2. Endpoint to handle active logout and token blacklisting
async function handleLogout(req, res) {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.decode(token); // Extract claims without verifying signature again
    const { jti, exp } = decoded;

    const currentTime = Math.floor(Date.now() / 1000);
    const remainingTTL = exp - currentTime;

    if (remainingTTL > 0) {
        // Store the JTI in Redis with a TTL matching the token's remaining lifetime
        await redisClient.set(`blacklist:${jti}`, 'revoked', {
            EX: remainingTTL
        });
    }

    return res.status(200).json({ message: 'Logged out successfully' });
}
```

## Security Hardening Best Practices
1. **Fallback on Redis Connection Failures:** In a high-availability environment, decide if a Redis connection failure should fail-open (prioritize availability) or fail-closed (prioritize security). For security-critical applications, fail-closed is recommended.
2. **Cluster and Replication:** Run Redis in a clustered configuration with read-replicas to prevent a single-point-of-failure (SPOF) and minimize lookup latency across geographic regions.

By integrating structured JTI token claims with an atomic, TTL-driven memory store like Redis, developers can easily solve the revocation limits of stateless authorization without sacrificing core system responsiveness.
