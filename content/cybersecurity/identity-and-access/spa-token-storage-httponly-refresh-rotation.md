---
title: "SPA Token Storage: In-Memory Access Tokens with HttpOnly Refresh Rotation"
description: "Why localStorage tokens fall to XSS and plain cookies fall to CSRF, and how the industry-standard hybrid pattern -- in-memory access tokens plus HttpOnly refresh-token rotation with reuse detection -- closes both gaps."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "jwt"
  - "spa"
  - "httponly-cookies"
  - "refresh-token-rotation"
  - "xss"
  - "csrf"
---

# SPA Token Storage: In-Memory Access Tokens with HttpOnly Refresh Rotation

## The Problem: The XSS vs. CSRF Storage Dilemma

Single-page applications run entirely in the browser, which makes token storage a genuine dilemma rather than a checkbox.

- **`localStorage`/`sessionStorage`**: simple, but any XSS vulnerability anywhere in the app — including a compromised third-party npm dependency — lets injected JavaScript call `localStorage.getItem('access_token')` and exfiltrate it instantly. There is no browser-level protection against this; storage APIs are fully readable by any script running on the page.
- **Plain cookies**: `HttpOnly` cookies solve the XSS-readability problem (JavaScript can't read them), but the browser auto-attaches cookies to every matching-origin request — including ones triggered by a malicious third-party page. That reintroduces Cross-Site Request Forgery: an attacker's page can make the victim's browser fire an authenticated request the victim never intended.

```
[Paradigm 1: localStorage]           -- vulnerable to XSS
Injected script --> reads localStorage --> exfiltrates tokens

[Paradigm 2: plain cookies]          -- vulnerable to CSRF
Evil-origin page --> triggers request --> browser auto-attaches cookie

[Paradigm 3: hybrid, in-memory + HttpOnly + rotation]   -- the accepted pattern
```

The modern consensus resolves this by splitting responsibilities: keep the short-lived access token purely in JavaScript runtime memory (never in any browser storage API), and keep the longer-lived refresh token in a strict `HttpOnly`, `Secure`, `SameSite=Strict` cookie scoped to the refresh endpoint only.

## Architectural Blueprint: Refresh Token Rotation (RTR)

Every time the refresh token is used to mint a new access token, the server invalidates that refresh token and issues a brand-new one in its place — a rotating chain rather than a single long-lived reusable credential.

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
      |                           |                             | 3. Validate & check reuse  |
      |                           |                             |---------------------------->|
      |                           |                             | <---------------------------|
      |                           |                             |    Result: Active (OK)      |
      |                           |                             |                             |
      |                           |                             | 4. Mint new Access Token &  |
      |                           |                             |    new Refresh Token        |
      |                           | 5. JSON (Access) +          |                             |
      |                           |    Set-Cookie (new Refresh) |                             |
      |                           | <----------------------------|                             |
      | 6. Access token held      |                             |                             |
      |    in memory; cookie set  |                             |                             |
      |<--------------------------|                             |                             |
```

The critical property is **reuse detection**: if a previously rotated-out refresh token is ever presented again, that's a strong signal it was stolen and both the legitimate client and an attacker now hold copies. The correct response is not to quietly reject the stale token — it's to revoke the *entire family* of tokens descended from that login, forcing everyone (attacker included) back to re-authentication.

## Technical Implementation (Node.js / TypeScript, Express)

```typescript
import { Request, Response } from 'express';
import crypto from 'crypto';

interface RefreshSession {
  tokenFamilyId: string; // groups every token descended from one login
  currentTokenHash: string;
  userId: string;
  expiresAt: Date;
  isUsed: boolean;
}

// In production, back this with Redis or a SQL table, not an in-process Map.
const sessionStore = new Map<string, RefreshSession>();

export async function handleRefreshTokenRotation(req: Request, res: Response) {
  const incomingRefreshToken = req.cookies?.refreshToken;
  if (!incomingRefreshToken) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing refresh token cookie' });
  }

  const incomingHash = crypto.createHash('sha256').update(incomingRefreshToken).digest('hex');
  const session = sessionStore.get(incomingHash);
  if (!session) {
    return res.status(401).json({ error: 'invalid_grant', message: 'Invalid session token' });
  }

  const { tokenFamilyId, userId, isUsed, expiresAt } = session;

  // Reuse detection: this exact refresh token was already consumed once.
  if (isUsed) {
    revokeTokenFamily(tokenFamilyId);
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'strict' });
    return res.status(401).json({
      error: 'security_alert',
      message: 'Compromised session detected. All tokens in this family have been revoked.',
    });
  }

  if (new Date() > expiresAt) {
    sessionStore.delete(incomingHash);
    return res.status(401).json({ error: 'invalid_grant', message: 'Refresh token has expired' });
  }

  // Mark this token consumed before issuing the next one in the chain.
  session.isUsed = true;
  sessionStore.set(incomingHash, session);

  const newAccessToken = generateAccessToken(userId);
  const newRefreshToken = crypto.randomBytes(40).toString('hex');
  const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

  sessionStore.set(newHash, {
    tokenFamilyId,
    currentTokenHash: newHash,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isUsed: false,
  });

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,        // unreadable by JavaScript — mitigates XSS exfiltration
    secure: true,          // HTTPS only
    sameSite: 'strict',    // blocked on cross-site requests — mitigates CSRF
    path: '/auth/refresh', // scoped so the browser never sends it to other endpoints
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return res.json({
    accessToken: newAccessToken,
    expiresIn: 900, // 15 minutes — held in-memory by the SPA, never in storage
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
  // Simplified for clarity — in practice, sign a real short-lived JWT here.
  return `access_token_for_${userId}_${Date.now()}`;
}
```

## Defensive Hardening Checklist

1. **Scope the cookie path tightly.** `path: '/auth/refresh'` (or equivalent) means the browser only attaches the refresh cookie on the one endpoint that needs it — it's never sent alongside ordinary API calls, shrinking the CSRF attack surface even further.
2. **`SameSite=Strict` (or at minimum `Lax`).** This is the primary browser-level CSRF defense for the cookie itself.
3. **Never persist the raw access token anywhere.** Keep it in application memory (a JS variable, React state) only — it should not survive a page refresh, which is an accepted trade-off for eliminating persistent-storage exfiltration risk.
4. **Alert on every reuse-detected event.** A hit on the reuse-detection branch is a strong signal of active token theft, not routine noise — treat it as a security incident to investigate, not just a session to silently reset.
5. **Consider a double-submit or custom-header check as defense-in-depth** against CSRF beyond `SameSite`, especially if you need to support older browsers that don't enforce `SameSite` defaults.
