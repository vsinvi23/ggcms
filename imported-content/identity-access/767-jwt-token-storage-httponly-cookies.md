# Secure Token Storage in SPAs: HttpOnly Cookies vs. In-Memory Refresh Rotation

## The Problem: The XSS vs. CSRF Storage Dilemma

Single Page Applications (SPAs) must manage access and refresh tokens to persist sessions. However, developers are often trapped in a classic security dilemma: **how to store tokens without exposing the application to Cross-Site Scripting (XSS) or Cross-Site Request Forgery (CSRF)**.

Historically, developers stored access tokens in `localStorage`. This approach is simple, but it is highly insecure. If an attacker injects malicious JavaScript via a third-party package or an input vulnerability (XSS), they can execute `localStorage.getItem('access_token')` and immediately exfiltrate the token to their server.

To prevent XSS from reading tokens, developers moved tokens to **HttpOnly Cookies**. Because the browser prevents JavaScript from reading `HttpOnly` cookies, XSS scripts cannot exfiltrate them. However, cookies are automatically attached by the browser to every outgoing request. This reintroduces **CSRF vulnerability**, where an attacker can trick a user into clicking a link that triggers an unauthorized state-changing request on your domain.

The modern industry consensus is a hybrid architecture: **In-Memory Access Tokens combined with Secure, HttpOnly Cookies implementing Refresh Token Rotation (RTR)**.

---

## Architectural Blueprint: Refresh Token Rotation (RTR) Flow

In this model, the short-lived Access Token is kept purely in the application's runtime JavaScript memory (e.g., inside a React state). Since it's in-memory, it is completely safe from persistent disk exfiltration. 

The longer-lived Refresh Token is stored in a strict, `HttpOnly`, `SameSite=Strict`, `Secure` cookie. When the in-memory access token expires, the client calls a `/refresh` endpoint, which rotates the refresh token (issuing a brand new one and invalidating the old one) to mitigate token-theft reuse.

```
+------------+             +-------------+             +-----------------+             +-------------+
| Client SPA |             | API Gateway |             |   Auth Server   |             | Token Store |
+------------+             +-------------+             +-----------------+             +-------------+
      |                           |                             |                             |
      | 1. POST /refresh          |                             |                             |
      |    (Cookie: refresh_token)|                             |                             |
      |-------------------------->|                             |                             |
      |                           | 2. Forward to Auth Server   |                             |
      |                           |---------------------------->|                             |
      |                           |                             | 3. Validate Token & check   |
      |                           |                             |    if already used (REUSE)  |
      |                           |                             |---------------------------->|
      |                           |                             | <---------------------------|
      |                           |                             |    Result: Active (OK)      |
      |                           |                             |                             |
      |                           |                             | 4. Create new Access Token  |
      |                           |                             |    & new Refresh Token      |
      |                           |                             |                             |
      |                           | 5. Return JSON (Access) &   |                             |
      |                           |    Set-Cookie (New Refresh) |                             |
      |                           | <---------------------------|                             |
      | 6. Receive Access Token   |                             |                             |
      |    in-memory & Cookie set |                             |                             |
      |<--------------------------|                             |                             |
```

---

## Technical Implementation

Below is a robust Node.js/TypeScript Express controller handling Refresh Token Rotation with built-in **Reuse Detection**. If a malicious actor steals a refresh token and attempts to replay it, the server detects the double-use, invalidates the entire session family, and forces all sessions to re-authenticate.

```typescript
import { Request, Response } from 'express';
import crypto from 'crypto';

interface RefreshSession {
  tokenFamilyId: string; // Groups all tokens generated from the same initial login
  currentTokenHash: string;
  userId: string;
  expiresAt: Date;
  isUsed: boolean;
}

// Memory-backed session store (In production, implement with Redis/SQL)
const sessionStore = new Map<string, RefreshSession>();

export async function handleRefreshTokenRotation(req: Request, res: Response) {
  // 1. Extract the refresh token from the secure cookie
  const incomingRefreshToken = req.cookies?.refreshToken;
  if (!incomingRefreshToken) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing refresh token cookie' });
  }

  const incomingHash = crypto.createHash('sha256').update(incomingRefreshToken).digest('hex');
  
  // 2. Locate the token in the database
  const session = sessionStore.get(incomingHash);
  if (!session) {
    return res.status(401).json({ error: 'invalid_grant', message: 'Invalid session token' });
  }

  const { tokenFamilyId, userId, isUsed, expiresAt } = session;

  // 3. Cryptographic Reuse Detection (Mitigates Token Theft)
  if (isUsed) {
    // SECURITY ALARM: Someone is replaying a previously used refresh token. 
    // This implies that either the client or the database has been compromised.
    // Mitigation: Forcefully revoke the entire token family immediately.
    revokeTokenFamily(tokenFamilyId);
    
    // Clear client-side cookie
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'strict' });
    return res.status(401).json({
      error: 'security_alert',
      message: 'Compromised session detected. All active tokens in this family have been revoked.',
    });
  }

  // Check temporal validity
  if (new Date() > expiresAt) {
    sessionStore.delete(incomingHash);
    return res.status(401).json({ error: 'invalid_grant', message: 'Refresh token has expired' });
  }

  // 4. Invalidate the used token
  session.isUsed = true;
  sessionStore.set(incomingHash, session);

  // 5. Generate brand-new token pair
  const newAccessToken = generateAccessToken(userId);
  const newRefreshToken = crypto.randomBytes(40).toString('hex');
  const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

  // Store the new token under the same family ID
  sessionStore.set(newHash, {
    tokenFamilyId,
    currentTokenHash: newHash,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    isUsed: false,
  });

  // 6. Set the new Refresh Token in a secure, strict HttpOnly cookie
  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,          // Prevents XSS extraction
    secure: true,            // Forces HTTPS
    sameSite: 'strict',      // Mitigates CSRF
    path: '/auth/refresh',   // Scope cookie access only to the refresh route
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 7. Return the access token in the JSON body for in-memory client storage
  return res.json({
    accessToken: newAccessToken,
    expiresIn: 900, // 15 minutes
  });
}

function revokeTokenFamily(familyId: string) {
  for (const [hash, session] of sessionStore.entries()) {
    if (session.tokenFamilyId === familyId) {
      sessionStore.delete(hash);
    }
  }
}

function generateAccessToken(userId: string): string {
  // Simplified JWT token generation logic for structural clarity
  return `access_token_simulated_for_${userId}_at_${Date.now()}`;
}
```

---

## Defensive Hardening Checklist

1. **Restrict Cookie Scope**: Set the `path` attribute of the refresh cookie specifically to your refresh endpoint (e.g., `path=/api/v1/auth/refresh`). This prevents the browser from transmitting the cookie on normal API endpoints, reducing CSRF exposure.
2. **Implement SameSite=Strict**: Always declare `sameSite: 'strict'` or `sameSite: 'lax'` on the cookie configuration to ensure the browser blocks cookie transit on cross-site requests.
3. **Double-Submit Anti-CSRF**: For extra legacy browser protection, implement a dynamic double-submit cookie pattern or require a custom header (e.g., `X-Requested-With`) to ensure requests originate from your authentic JS environment.
