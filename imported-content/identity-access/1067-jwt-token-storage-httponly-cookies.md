# Secure Token Storage in SPAs: Comparing HttpOnly Cookies vs In-Memory Refresh Rotation

Single Page Applications (SPAs) built with modern frameworks (React, Vue, Angular) must store Access and Refresh Tokens securely on the client. Storing tokens incorrectly exposes the application to two high-severity web vulnerabilities: **Cross-Site Scripting (XSS)** and **Cross-Site Request Forgery (CSRF)**.

---

## The Problem: The XSS vs. CSRF Storage Deadlock

Developers are caught in a classic security trade-off:

1. **The LocalStorage / SessionStorage Flaw (Vulnerable to XSS):** Storing tokens in Web Storage is highly convenient. However, any JavaScript code running on the page (including compromised third-party npm packages, analytics scripts, or injected CDNs) can execute `localStorage.getItem('access_token')` and instantly exfiltrate the credentials.
2. **The Classic Cookie Flaw (Vulnerable to CSRF):** Storing tokens in standard cookies makes them inaccessible to client-side JS (using the `HttpOnly` flag), successfully mitigating XSS extraction. However, because browsers automatically attach cookies to *every* outbound request targeting that domain, an attacker can launch a CSRF attack—tricking a logged-in user into executing authorized actions on the target site via malicious third-party links.

---

## Technical Architecture: The Hybrid In-Memory + SameSite Cookie Pattern

The industry-standard architectural solution to this deadlock is the **Hybrid Token Storage Pattern** utilizing **Refresh Token Rotation (RTR)**.

- **Access Token (In-Memory):** The short-lived Access Token is returned strictly in the JSON response payload of the login/refresh endpoint. The SPA holds it in memory (e.g., in a plain JS variable or state store). It is safe from XSS exfiltration across page reloads (since reloading wipes memory) and is immune to CSRF because it is not handled automatically by the browser.
- **Refresh Token (HttpOnly Cookie):** The long-lived Refresh Token is stored in a cookie configured with `HttpOnly`, `Secure`, `SameSite=Strict`, and path-restricted to `/api/auth/refresh`. This protects it from XSS extraction. The `SameSite=Strict` attribute and the path restriction protect the endpoint from CSRF exploitation.

```
+--------+                  +-------------------------+                  +-----------------------+
|  SPA   |                  |  Express API Gateway    |                  |  Authorization        |
| (React)|                  |  (Auth Endpoint)        |                  |  Server               |
+--------+                  +-------------------------+                  +-----------------------+
    |                                    |                                           |
    | 1. POST /api/auth/login            |                                           |
    |----------------------------------->|                                           |
    |                                    | 2. Forward login credentials              |
    |                                    |------------------------------------------>|
    |                                    | 3. Return Access (short) & Refresh (long) |
    |                                    |<------------------------------------------|
    |                                    |                                           |
    | 4. Write Refresh to HTTP Cookie    |                                           |
    |    (HttpOnly, SameSite=Strict)     |                                           |
    | 5. Return Access in JSON payload   |                                           |
    |<-----------------------------------|                                           |
    |                                    |                                           |
    | [Access Token expires in 15 mins]  |                                           |
    |                                    |                                           |
    | 6. POST /api/auth/refresh          |                                           |
    |    (Cookie attached automatically) |                                           |
    |----------------------------------->|                                           |
    |                                    | 7. Validate & Rotate Refresh Token        |
    |                                    |    - Delete old cookie                    |
    |                                    |    - Issue brand new Cookie & JSON access |
    |                                    |-----------------+                         |
    |                                    |                 | Internal check          |
    |                                    |<----------------+                         |
    | 8. Return rotated credentials       |                                           |
    |<-----------------------------------|                                           |
```

---

## Production-Grade Code: Secure Token Handshake Server

Below is an Express and TypeScript backend router. It issues short-lived Access Tokens via JSON response bodies, configures secure `__Host-` prefixed cookies for Refresh Tokens, and implements absolute protection against Refresh Token replay attacks (Refresh Token Rotation).

```typescript
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const router = Router();
router.use(cookieParser());

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret-key-999';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-777';

// Memory store tracking active refresh tokens to detect reuse / replay attacks
const activeRefreshTokens = new Set<string>();

/**
 * Endpoint: User Authentication
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  
  // (Perform credential validation here)
  const userId = 'user_987654';

  const accessToken = jwt.sign({ sub: userId, role: 'user' }, ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: '7d' });

  // Record active token in database/cache
  activeRefreshTokens.add(refreshToken);

  // Set secure, sender-constrained cookie
  // Using '__Host-' prefix forces the cookie to require HTTPS and strictly bind to the domain
  res.cookie('__Host-refresh-token', refreshToken, {
    httpOnly: true,
    secure: true, // Requires HTTPS
    sameSite: 'strict', // Blocks CSRF by disabling cross-site attachment
    path: '/api/auth/refresh', // Restrict cookie transit path
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Return the access token inside JSON payload (SPA keeps it strictly in RAM)
  res.status(200).json({
    accessToken,
    expiresIn: 900 // 15 minutes
  });
});

/**
 * Endpoint: Refresh Token Rotation (RTR)
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const incomingRefreshToken = req.cookies['__Host-refresh-token'];

  if (!incomingRefreshToken) {
    res.status(401).json({ error: 'Refresh token missing. Access denied.' });
    return;
  }

  // REPLAY ATTACK DETECTION (Automatic Revocation cascade)
  // If the incoming refresh token is NOT in our active registry, it might have been stolen and reused.
  if (!activeRefreshTokens.has(incomingRefreshToken)) {
    // Revoke ALL active sessions for safety
    activeRefreshTokens.clear(); // In production, target specific user's sessions in DB
    res.clearCookie('__Host-refresh-token', { path: '/api/auth/refresh' });
    res.status(403).json({ error: 'Critical Security Warning: Replay attempt detected. Revoking sessions.' });
    return;
  }

  try {
    const decoded = jwt.verify(incomingRefreshToken, REFRESH_SECRET) as jwt.JwtPayload;

    // Remove the used refresh token from active list (Single-use policy)
    activeRefreshTokens.delete(incomingRefreshToken);

    // Generate rotated credentials
    const newAccessToken = jwt.sign({ sub: decoded.sub, role: 'user' }, ACCESS_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ sub: decoded.sub }, REFRESH_SECRET, { expiresIn: '7d' });

    // Store the new token in active register
    activeRefreshTokens.add(newRefreshToken);

    // Overwrite the cookie with the rotated token
    res.cookie('__Host-refresh-token', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      accessToken: newAccessToken,
      expiresIn: 900
    });
  } catch (err) {
    activeRefreshTokens.delete(incomingRefreshToken);
    res.clearCookie('__Host-refresh-token', { path: '/api/auth/refresh' });
    res.status(401).json({ error: 'Session expired or invalid refresh credentials.' });
  }
});

export { router as AuthRouter };
```

---

## Hardening Cookie Prefixes: The `__Host-` Guard

To ensure cookies cannot be overwritten by subdomain hijacking (e.g., an attacker exploiting `dev.yourcompany.com` to manipulate cookies on `yourcompany.com`), always use the **`__Host-` prefix** for critical authentication cookies.

This prefix guarantees the cookie:
1. Is set with the `Secure` flag (HTTPS only).
2. Does **not** include a `Domain` attribute, restricting its storage and transmission strictly to the exact originating host (preventing subdomain inheritance).
3. Explicitly specifies `Path=/`.
