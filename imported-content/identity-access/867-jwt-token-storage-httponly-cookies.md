# Secure Token Storage in SPAs: Comparing HttpOnly Cookies vs In-Memory Refresh Rotation

## The Problem: Mitigating XSS and CSRF Attack Vectors in Frontend Storage

Single-Page Applications (SPAs) must persist identity tokens across page reloads and browser closures. Traditionally, developers stored JWT access and refresh tokens inside browser `localStorage` or `sessionStorage` due to ease of implementation. 

However, any data written to web storage is fully accessible to any JavaScript running on the page. In the event of a **Cross-Site Scripting (XSS)** vulnerability (e.g., via compromised third-party npm packages, tracking scripts, or unescaped user inputs), an attacker can execute `localStorage.getItem("access_token")` and silently exfiltrate the user's active credentials.

To eliminate XSS-based token theft, architects often transition to storing tokens inside **HttpOnly Cookies**. While this successfully blocks XSS from reading the cookie, it introduces vulnerability to **Cross-Site Request Forgery (CSRF)**. If a user visits a malicious site, the browser will automatically append the cookie to cross-site requests targeting your backend.

---

## Technical Architecture

The following diagram compares the attack vectors and communication flows of the pure HttpOnly Cookie approach against the hybrid **In-Memory Access Token + HttpOnly Refresh Token with Rotation (RTR)** architecture:

```
+---------------------------------------------------------------------------------+
|                       Token Storage Architecture Patterns                       |
+---------------------------------------------------------------------------------+

  [ Option A: pure HttpOnly Cookies ]
  Client App                         Backend Server
      |                                    |
      |--------- Request with Cookie ------|  (HttpOnly, Secure, SameSite=Strict)
      |<-------- Response (Set-Cookie) ----|  (Vulnerable to CSRF if SameSite 
                                               is misconfigured or bypassed)

  -----------------------------------------------------------------------------

  [ Option B: Hybrid In-Memory + RTR (Recommended) ]
  Client App                         Backend Server
      | (JS Memory Context)                |
      |                                    |
      |-- 1. POST /login ----------------->|
      |<- 2. AccessToken (JSON body) ------|  (AccessToken is stored purely in 
      |      Set-Cookie: RefreshToken -----|   memory; RefreshToken is HttpOnly)
      |                                    |
      |-- 3. Run APIs with Bearer Header ->|  (XSS cannot read RefreshToken;
      |      (uses in-memory AccessToken)  |   SameSite blocks CSRF on refresh)
      |                                    |
      |-- 4. Silent Refresh (At Exp) ------>|
      |<- 5. New AccessToken + New Cookie -|  (Rotates RefreshToken to prevent replay)
```

---

## Technical Deep Dive: Refresh Token Rotation (RTR)

The hybrid pattern (Option B) combines the strengths of both methodologies:
1. **Access Token:** Stored as an in-memory variable inside the application's state. It is secure from XSS extraction and is naturally wiped out if the user closes or refreshes the tab.
2. **Refresh Token:** Stored in a strict, path-restricted, `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
3. **Silent Refresh:** When the in-memory access token expires, or if the user refreshes the page, the SPA sends a silent POST request to `/token/refresh`. The browser appends the HttpOnly refresh cookie, and the server returns a fresh in-memory access token and a **new rotated refresh token**.

If an attacker steals a rotated refresh token, they will trigger a **Token Reuse Detection** exception on the server when they attempt to use it. The server instantly voids the entire token family, logging out both the legitimate user and the attacker.

---

## Code Implementation: TypeScript & Node.js (Express)

The following backend controller demonstrates the implementation of the hybrid dual-token architecture with integrated Refresh Token Rotation and family reuse detection.

```typescript
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use(cookieParser());

const ACCESS_SECRET = "super_secret_access_key";
const REFRESH_SECRET = "super_secret_refresh_key";

// Simple in-memory tracker of active refresh token families (use Redis in prod!)
const activeRefreshTokens = new Set<string>();

interface TokenPayload {
  userId: string;
  familyId: string; // Tracks the token ancestry to detect reuse
}

/**
 * Issues a paired set of tokens and sets the Refresh Token in a secure HttpOnly cookie.
 */
function issueTokens(res: Response, userId: string, familyId: string) {
  const accessToken = jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: '15m' });
  
  // Issue a new unique Refresh Token representing this step in the family chain
  const refreshTokenId = Math.random().toString(36).substring(2, 15);
  const refreshToken = jwt.sign({ userId, familyId, tokenId: refreshTokenId } as TokenPayload, REFRESH_SECRET, { expiresIn: '7d' });
  
  // Track active token ID
  activeRefreshTokens.add(refreshTokenId);

  // Set-Cookie header with strict security attributes
  res.cookie('jid', refreshToken, {
    httpOnly: true, // Prevents XSS/JS read access
    secure: true,   // Enforces SSL transmission only
    sameSite: 'strict', // Blocks CSRF by preventing cross-site transmission
    path: '/auth/refresh', // Restricts cookie routing boundary to minimize exposure
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days matching token life
  });

  return accessToken;
}

app.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  // (Validate credentials here...)
  
  const userId = "usr_999";
  const familyId = Math.random().toString(36).substring(2, 15); // Initialize family ID

  const accessToken = issueTokens(res, userId, familyId);
  
  // Return the short-lived access token strictly in the JSON payload (stored in SPA memory)
  res.json({ accessToken });
});

app.post('/auth/refresh', (req: Request, res: Response) => {
  const incomingCookie = req.cookies.jid;
  if (!incomingCookie) {
    return res.status(401).json({ error: "Refresh token is missing" });
  }

  try {
    const payload = jwt.verify(incomingCookie, REFRESH_SECRET) as TokenPayload & { tokenId: string };
    
    // Check if this specific Refresh Token has already been consumed or invalidated
    if (!activeRefreshTokens.has(payload.tokenId)) {
      // SECURITY EXCEPTION: Breach/Replay detected!
      // Revoke all tokens belonging to this family instantly to stop the breach
      activeRefreshTokens.clear(); // Wipe store (or query and drop family from Redis)
      res.clearCookie('jid', { path: '/auth/refresh' });
      return res.status(403).json({ error: "Security Violation: Token reuse detected! Family revoked." });
    }

    // Rotate key: Consumed token is removed from storage
    activeRefreshTokens.delete(payload.tokenId);

    // Issue a brand new pair in the same token family
    const newAccessToken = issueTokens(res, payload.userId, payload.familyId);
    
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token session" });
  }
});
```

---

## Operational Verification

To verify token safety in production:
- Open browser developer tools; verify that the `jid` cookie is marked as `HttpOnly` and `Secure`, confirming that `document.cookie` queries inside the console return blank strings.
- Trigger a mock reuse scenario by intercepting an old refresh token cookie and submitting it twice; verify that the server detects the duplication, voids the entire token family, and forces the user session to terminate.
