# Secure Token Storage in SPAs: HttpOnly Cookies vs In-Memory Refresh Rotation

## The Problem
Single-Page Applications (SPAs) are executed entirely in the user's browser, making secure token storage exceptionally difficult. If an SPA stores Access Tokens and Refresh Tokens in `localStorage` or `sessionStorage`, any Cross-Site Scripting (XSS) vulnerability inside the application (or its third-party npm packages) will allow an attacker to read and exfiltrate these tokens instantly.

To combat XSS-based theft, many developers migrate to storing tokens in `HttpOnly` cookies. While `HttpOnly` cookies are inaccessible to client-side scripts, they automatically expose the application to Cross-Site Request Forgery (CSRF) attacks. An attacker can trick the user's browser into sending authenticated requests to your API because the browser automatically attaches cookies to matching cross-site origins. To build a resilient architecture, developers must balance XSS and CSRF risks by combining in-memory access tokens with HttpOnly-cookie-backed Refresh Token Rotation (RTR).

## The Mental Model
We can evaluate browser token storage across three paradigms:

```
[Paradigm 1: LocalStorage]  --- (Vulnerable to XSS)
Browser Script ---> reads LocalStorage ---> Exfiltrates Access/Refresh Tokens.

[Paradigm 2: Pure Cookies]  --- (Vulnerable to CSRF)
Evil Origin App ---> makes requests to Api ---> Browser automatically attaches Cookie.

[Paradigm 3: Hybrid In-Memory + HttpOnly Cookie with RTR] --- (Highly Secure)
+-----------------------+              Fetch Access Token             +---------------+
| SPA (In-Memory Access)| <------------------------------------------ | Auth Server   |
|                       |                                             | (AS / API)    |
|   HttpOnly Cookie     | ------------ POST /token/refresh ---------> |               |
|   (Refresh Token)     |              (New Refresh Token Returned)   |   Enforces    |
|                       | <------------------------------------------ | Token Rotation|
+-----------------------+                                             +---------------+
```

By keeping the ephemeral Access Token strictly in-memory (inside javascript variables) and placing the Refresh Token in an `HttpOnly`, `SameSite=Strict`, `Secure` cookie, we isolate our credentials. To protect against Refresh Token theft, we implement Refresh Token Rotation: every time a refresh token is used, it is invalidated and replaced by a brand-new token pair.

## Attack Vectors
1. **XSS-Based Token Exfiltration**: An attacker injects malicious JS into your application via an unescaped text input. The script loops over `localStorage` keys, finds your `access_token` and `refresh_token`, and POSTs them to their external harvesting server.
2. **CSRF State-Modification Actions**: If your application uses cookies without strict `SameSite` policies or anti-CSRF headers, an attacker can host an external malicious page. When your authenticated user visits that page, an embedded script executes background requests to your transaction endpoints, carrying the browser's session cookies.
3. **Refresh Token Replay**: If a rogue actor steals a rotating refresh token, they will attempt to use it to generate new access tokens. If your auth server does not keep a record of used tokens, the attacker will maintain persistent access.

## Defensive Architecture
Implementing Hybrid In-Memory storage requires robust backend cookie configurations and a stateful Refresh Token validation table to detect token reuse immediately.

### 1. Secure Cookie Configuration (Express.js)
When issuing the refresh token, configure cookie attributes to block both XSS and CSRF.

```javascript
res.cookie('refresh_token', newRefreshToken, {
  httpOnly: true, // Prevents access via document.cookie (Mitigates XSS)
  secure: true,   // Forces transmission only over encrypted HTTPS connections
  sameSite: 'strict', // Blocks cookie attachment on cross-site requests (Mitigates CSRF)
  path: '/api/v1/auth/refresh', // Scopes cookie transmission to the refresh endpoint only
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### 2. Implementing Refresh Token Rotation & Reuse Detection
The database must track refresh token lineages. If a previously invalidated refresh token is ever presented, the auth server must immediately revoke the entire family of tokens associated with that user to stop active replay attacks.

```javascript
const express = require('express');
const router = express.Router();
const db = require('./db'); // Mock database reference

router.post('/api/v1/auth/refresh', async (req, res) => {
  const tokenFromCookie = req.cookies.refresh_token;
  if (!tokenFromCookie) {
    return res.status(401).json({ error: 'Refresh token missing' });
  }

  // Look up token in the database
  const tokenRecord = await db.findRefreshToken(tokenFromCookie);
  if (!tokenRecord) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // REUSE DETECTION: If the token has already been marked as used, compromise has occurred!
  if (tokenRecord.used === true) {
    // Invalidate the entire token lineage for this user
    await db.revokeAllUserTokens(tokenRecord.userId);
    res.clearCookie('refresh_token');
    return res.status(403).json({ 
      error: 'Security alert: Refresh token reuse detected. All sessions revoked!' 
    });
  }

  // Mark the old token as used
  await db.markTokenAsUsed(tokenFromCookie);

  // Generate new Access and Refresh tokens
  const newAccessToken = generateAccessToken(tokenRecord.userId);
  const newRefreshToken = generateSecureRandomString();

  // Save the new token to database, linking it to the same lineage (parent token)
  await db.saveRefreshToken({
    token: newRefreshToken,
    userId: tokenRecord.userId,
    used: false,
    parent: tokenFromCookie
  });

  // Issue the new rotating refresh token in a secure cookie
  res.cookie('refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  // Return the short-lived access token in the JSON body (in-memory)
  res.json({ accessToken: newAccessToken });
});
```

## Best Practices
- **Short-lived Access Tokens**: Set access token lifespans to between 5 and 15 minutes to limit exposure if they are stolen from client memory.
- **Implement Reuse Alarms**: Log and alert security teams on any refresh token reuse, as it indicates an active session hijacking attempt.
- **Scope Cookies Strictly**: Always use the `path` attribute to restrict the browser from sending the refresh cookie on non-authentication API requests.
