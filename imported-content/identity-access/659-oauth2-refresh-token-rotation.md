# Securing Client Sessions: Refresh Token Rotation (RTR) and Token Family Reuse Detection

## The Problem: The Infinite Lifespan of Stolen Refresh Tokens
In single-page applications (SPAs) and mobile clients, access tokens are kept short-lived (e.g., 15 minutes) to minimize the attack surface of exfiltration. To maintain seamless UX, refresh tokens are issued to obtain new access tokens without user interaction. However, if a refresh token is compromised (via XSS, malware, or local storage theft), an attacker gains a persistent backdoor. Unlike access tokens, refresh tokens historically lacked mechanisms for localized invalidation unless the user explicitly logged out or the administrator revoked all sessions.

## The Solution: Refresh Token Rotation (RTR)
Refresh Token Rotation (RTR) mitigates this by making refresh tokens one-time use. Every time a client exchanges a refresh token for a new access token, the authorization server (AS) issues a *new* refresh token alongside the new access token. The old refresh token is immediately invalidated.

Crucially, RTR implements **Token Family Reuse Detection**. If an attacker steals a refresh token and uses it, the AS issues them a new token. When the legitimate client attempts to use the originally issued (now invalidated) refresh token, the AS detects the reuse. The AS then recursively revokes the entire *token family* (all tokens descending from the original grant), instantly cutting off the attacker.

## Architectural Flow
```text
  [Legitimate Client]                           [Auth Server]                          [Attacker]
          |                                          |                                     |
          |--- 1. Use Refresh Token (RT1) ---------->|                                     |
          |                                          |                                     |
          |<-- 2. Issue Access Token + RT2 ----------|                                     |
          |                                          |                                     |
          |     (Attacker steals RT2 via XSS)        |====================================>|
          |                                          |<-- 3. Attacker uses stolen RT2 -----|
          |                                          |                                     |
          |                                          |--- 4. Issue Access Token + RT3 ---->|
          |                                          |       (RT2 marked invalid)          |
          |                                          |                                     |
          |--- 5. Legitimate Client uses RT2 ------->|                                     |
          |       (Client is unaware of theft)       |                                     |
          |                                          |                                     |
          |<-- 6. DETECT REUSE. Revoke RT Family! ---|                                     |
          |    (All tokens: RT1, RT2, RT3 die)       |                                     |
          |                                          |                                     |
          |    (Client must re-authenticate)         |                                     |
```

## Implementation: Token Family Tracking (Node.js & Redis)
To implement reuse detection at scale, we use a fast KV store like Redis to track token families. Each grant has a unique `family_id`.

```javascript
const crypto = require('crypto');
const redis = require('redis');
const client = redis.createClient();

// Generate a secure random token
const generateToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Exchanges an old refresh token for a new token pair.
 * Detects reuse and revokes families.
 */
async function rotateRefreshToken(providedRefreshToken) {
    // 1. Fetch token metadata from Redis
    const tokenData = await client.hGet('refresh_tokens', providedRefreshToken);
    
    if (!tokenData) {
        throw new Error('Invalid refresh token');
    }

    const { family_id, is_used, user_id } = JSON.parse(tokenData);

    // 2. REUSE DETECTION TRIGGERED
    if (is_used) {
        console.warn(`[SECURITY] Token reuse detected for family ${family_id}!`);
        await revokeTokenFamily(family_id);
        throw new Error('Token reuse detected. Session terminated.');
    }

    // 3. Mark the provided token as used
    await client.hSet('refresh_tokens', providedRefreshToken, JSON.stringify({
        family_id,
        is_used: true,
        user_id
    }));

    // 4. Generate new tokens
    const newAccessToken = generateToken(); // In reality, a signed JWT
    const newRefreshToken = generateToken();

    // 5. Store the new refresh token in the same family
    await client.hSet('refresh_tokens', newRefreshToken, JSON.stringify({
        family_id,
        is_used: false,
        user_id
    }));

    // 6. Track the new token in the family index for bulk revocation
    await client.sAdd(`family:${family_id}`, newRefreshToken);

    return { access_token: newAccessToken, refresh_token: newRefreshToken };
}

/**
 * Revokes all tokens associated with a family.
 */
async function revokeTokenFamily(familyId) {
    const tokensInFamily = await client.sMembers(`family:${familyId}`);
    
    const pipeline = client.multi();
    for (const token of tokensInFamily) {
        pipeline.hDel('refresh_tokens', token);
    }
    pipeline.del(`family:${familyId}`);
    
    await pipeline.exec();
    console.log(`[AUDIT] Family ${familyId} fully revoked.`);
}
```

## Engineering Considerations
1. **Concurrency and Race Conditions:** Network latency or client-side concurrency (e.g., multiple tabs refreshing simultaneously) can trigger false positives in reuse detection. Introduce a brief "grace period" (e.g., 10-30 seconds) where the old token remains valid *only* for returning the already-generated new token pair, without generating a third pair.
2. **Storage Pruning:** Ensure refresh token records have a TTL (Time-To-Live) matching their absolute expiration to prevent Redis bloat.
3. **Binding to Device:** For higher security environments (like financial tech), combine RTR with DPoP (Demonstrating Proof-of-Possession at the Application Layer) or mTLS to bind the refresh token to a specific client TLS certificate or asymmetric key pair.