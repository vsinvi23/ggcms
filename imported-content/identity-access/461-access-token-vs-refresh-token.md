# Mitigating Token Theft: Access Token vs. Refresh Token Lifespans and Rotation

## The Problem: The Latency vs. Security Trade-Off
In stateless distributed architectures, securing APIs with tokens creates a fundamental tension:
1. **If access tokens are long-lived** (e.g., 24 hours), we eliminate database lookups or identity provider (IdP) round-trips. However, if a token is exfiltrated (via XSS, man-in-the-middle, or log exposure), an attacker gains unrestricted access for the remainder of its lifespan. Revocation is nearly impossible without introducing centralized state, defeating the purpose of stateless tokens.
2. **If access tokens are short-lived** (e.g., 5 minutes), the window of vulnerability is narrow. However, requiring users to re-authenticate every 5 minutes destroys the user experience and hammers the authentication server.

To solve this, modern identity frameworks implement a dual-token strategy: **short-lived Access Tokens** paired with **longer-lived Refresh Tokens**, secured by **Refresh Token Rotation (RTR)**.

---

## Technical Architecture and Token Lifecycle
Access tokens and refresh tokens serve fundamentally different purposes:

*   **Access Token (AT):** A bearer token used directly to access protected resources. It is short-lived, self-contained (typically a JWT), and presented in the `Authorization: Bearer <token>` header. It is designed to be shared with multiple resource servers (microservices).
*   **Refresh Token (RT):** A high-privilege credentials-equivalent token used *only* to request new access tokens from the Authorization Server. It is long-lived, never sent to resource servers, and must be stored in highly secure storage (e.g., `HttpOnly`, `Secure`, `SameSite=Strict` cookies or secure mobile vaults).

### Refresh Token Rotation (RTR)
Under RTR, every time a client uses a Refresh Token to obtain a new Access Token, the Authorization Server **invalidates the used Refresh Token and returns a brand-new Refresh Token** along with the new Access Token. 

If an attacker steals a Refresh Token and attempts to reuse it, the Authorization Server detects that a revoked Refresh Token is being presented. This triggers an **automatic breach protocol**: the server invalidates the entire token family (the chain of tokens derived from that initial login), forcing the legitimate user to re-authenticate and rendering the stolen token useless.

---

## Token Exchange and Rotation Flow

```
+--------+             +----------------------+             +---------------------+
| Client |             | Authorization Server |             |   Resource Server   |
+--------+             +----------------------+             +---------------------+
    |                             |                                    |
    | 1. POST /token (credentials)|                                    |
    |---------------------------->|                                    |
    | 2. Resp: AT_1 + RT_1        |                                    |
    |<----------------------------|                                    |
    |                             |                                    |
    | 3. GET /data (Auth: AT_1)   |                                    |
    |----------------------------------------------------------------->|
    | 4. Resp: 200 OK             |                                    |
    |<-----------------------------------------------------------------|
    |                             |                                    |
    | [ AT_1 expires ]            |                                    |
    |                             |                                    |
    | 5. GET /data (Auth: AT_1)   |                                    |
    |----------------------------------------------------------------->|
    | 6. Resp: 401 Unauthorized   |                                    |
    |<-----------------------------------------------------------------|
    |                             |                                    |
    | 7. POST /refresh (RT_1)     |                                    |
    |---------------------------->| (Validates RT_1, revokes RT_1,     |
    |                             |  generates RT_2 & AT_2)            |
    | 8. Resp: AT_2 + RT_2        |                                    |
    |<----------------------------|                                    |
    |                             |                                    |
    | 9. GET /data (Auth: AT_2)   |                                    |
    |----------------------------------------------------------------->|
    | 10. Resp: 200 OK            |                                    |
    |<-----------------------------------------------------------------|
```

---

## Implementation: Refresh Token Rotation & Replay Detection
Below is a production-grade Node.js/TypeScript implementation demonstrating how the Authorization Server must handle token rotation and protect against replay attacks.

```typescript
import crypto from 'crypto';

interface RefreshTokenFamily {
  familyId: string;
  parentTokenId: string | null;
  tokenId: string;
  hashedToken: string;
  userId: string;
  expiresAt: Date;
  isRevoked: boolean;
}

// In-memory data store simulated for demonstration (use Redis or PostgreSQL in production)
const tokenDatabase: Map<string, RefreshTokenFamily> = new Map();
const revokedFamilies: Set<string> = new Set();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validates a refresh token, performs rotation, and implements reuse detection.
 * @returns Object containing the new access token and fresh refresh token.
 */
export async function rotateRefreshToken(
  presentedToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashToken(presentedToken);
  
  // Find the token record
  const tokenRecord = Array.from(tokenDatabase.values()).find(
    (record) => record.hashedToken === tokenHash
  );

  if (!tokenRecord) {
    throw new Error('Invalid refresh token.');
  }

  // Breach Detection: If the token family is already blacklisted OR this specific token is already marked revoked
  if (revokedFamilies.has(tokenRecord.familyId) || tokenRecord.isRevoked) {
    // REUSE DETECTED! Revoke the entire family immediately.
    revokedFamilies.add(tokenRecord.familyId);
    await revokeFamily(tokenRecord.familyId);
    throw new Error('Security Breach Detected: Refresh token reuse. Access revoked for all sessions.');
  }

  // Check expiration
  if (tokenRecord.expiresAt < new Date()) {
    throw new Error('Refresh token has expired.');
  }

  // Mark the used token as revoked
  tokenRecord.isRevoked = true;
  tokenDatabase.set(tokenRecord.tokenId, tokenRecord);

  // Generate new Access and Refresh tokens
  const newAccessToken = crypto.randomBytes(32).toString('hex'); // Represented simply for this demo
  const newRawRefreshToken = crypto.randomBytes(64).toString('hex');
  const newRefreshTokenId = crypto.randomUUID();

  // Create the rotated refresh token entry in the same family chain
  const rotatedRecord: RefreshTokenFamily = {
    familyId: tokenRecord.familyId,
    parentTokenId: tokenRecord.tokenId,
    tokenId: newRefreshTokenId,
    hashedToken: hashToken(newRawRefreshToken),
    userId: tokenRecord.userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    isRevoked: false,
  };

  tokenDatabase.set(newRefreshTokenId, rotatedRecord);

  return {
    accessToken: newAccessToken,
    refreshToken: newRawRefreshToken,
  };
}

async function revokeFamily(familyId: string): Promise<void> {
  for (const [id, record] of tokenDatabase.entries()) {
    if (record.familyId === familyId) {
      record.isRevoked = true;
      tokenDatabase.set(id, record);
    }
  }
}
```

### Key Considerations for Production Deployment
1. **Database Atomicity:** The validation, revocation, and creation of new tokens must run inside an isolated database transaction (e.g., PostgreSQL `SERIALIZABLE` transaction or Redis `MULTI/EXEC` block) to prevent race conditions during concurrent requests.
2. **Grace Periods:** Network instability can cause clients to send a refresh request but fail to receive the response. Implement a brief grace period (e.g., 5–10 seconds) during which a recently used refresh token is tolerated if the client retries due to network failure.
3. **Storage Security:** Always serve refresh tokens from `/oauth/token` endpoints with cookies flagged as `HttpOnly`, `Secure`, `SameSite=Strict`, and restricted to `/oauth` path scope to keep them inaccessible to client-side JavaScript.
