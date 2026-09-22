# Secure Token Storage in SPAs: Comparing HttpOnly Cookies vs In-Memory Refresh Rotation

## The Problem
Single Page Applications (SPAs) built with React, Vue, or Angular face a critical security dilemma when handling OAuth2/OIDC tokens: **Where do we store the tokens?**
If you store a JWT in `localStorage` or `sessionStorage`, it is completely exposed to Cross-Site Scripting (XSS). Any malicious JavaScript on the page can steal the token and drain the user's account.

## Option 1: The `HttpOnly` Cookie Architecture (BFF Pattern)
The most secure approach is the Backend-For-Frontend (BFF) pattern. The SPA never sees the tokens. Instead, a dedicated backend handles the OAuth flow and issues encrypted, `HttpOnly`, `Secure`, `SameSite=Strict` cookies to the browser.

```text
+-------+                    +--------------------+                 +------------+
|       | 1. Login req       | Backend-For-Front  | 2. OAuth Flow   |            |
|       |===================>| (BFF / Node.js)    |================>| IdP / Auth |
| SPA   | 3. Set-Cookie      |                    |                 |            |
|       |<===================| Creates HttpOnly   |                 |            |
|       |                    | Session Cookie     |                 +------------+
|       | 4. API req + Cookie|                    |                 
|       |===================>| 5. Proxy with JWT  |                 +------------+
+-------+                    |=====================================>| Microserv. |
                             +--------------------+                 +------------+
```

### Cookie Implementation (Express.js BFF)
```typescript
import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
app.use(cookieParser());

app.post('/api/auth/callback', async (req, res) => {
    // ... complete OAuth code exchange ...
    const { access_token, refresh_token } = tokenResponse;

    // Store tokens in an encrypted HttpOnly cookie
    res.cookie('app_session', encryptTokens(access_token, refresh_token), {
        httpOnly: true,  // Hidden from JavaScript (Mitigates XSS)
        secure: true,    // HTTPS only
        sameSite: 'strict', // Mitigates CSRF
        maxAge: 3600000  // 1 hour
    });

    res.status(200).send('Logged In');
});
```
**Pros**: XSS attackers cannot read the tokens.
**Cons**: Requires managing a backend server. Introduces Cross-Site Request Forgery (CSRF) vectors (mitigated via `SameSite` and anti-CSRF tokens).

## Option 2: In-Memory Storage with Refresh Token Rotation
If a BFF is architecturally impossible (e.g., a purely static SPA relying on third-party APIs), you must use the Token Rotation pattern defined in OAuth 2.1.

1. **Storage**: The Access Token is stored strictly in memory (a JavaScript variable in a closure or React State). It is *never* written to `localStorage`.
2. **Persistence**: Since in-memory state is lost on page refresh, a short-lived Refresh Token is stored in a highly restricted `HttpOnly` cookie, OR handled via a hidden iframe using Web Workers.
3. **Rotation**: Every time the Refresh Token is used to get a new Access Token, the IdP issues a *new* Refresh Token and invalidates the old one.

### In-Memory Implementation (React Concept)
```javascript
// AuthProvider.jsx
let inMemoryAccessToken = null;

export const setToken = (token) => {
    inMemoryAccessToken = token;
};

export const getAuthClient = () => {
    return axios.create({
        baseURL: 'https://api.example.com',
        // Injects from memory on every request
        headers: { Authorization: `Bearer ${inMemoryAccessToken}` } 
    });
};

// On application load, trigger silent refresh via cookie to populate memory
async function initializeApp() {
    try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        setToken(res.data.accessToken);
    } catch (e) {
        // Not logged in
    }
}
```

### The Rotation Security Guarantee
If an XSS attacker executes a script, they can make API calls while the user is active, but they *cannot extract the refresh token* to maintain persistent access. If the attacker manages to trigger the refresh flow and steals the newly issued refresh token, Token Rotation acts as an alarm system. When the legitimate SPA attempts to use its previous refresh token, the IdP detects the reuse, assumes a breach, and instantly revokes *all* tokens associated with that session.

## Verdict
- **Enterprise / High Security**: Always use the BFF Pattern with `HttpOnly` cookies. Never let JWTs touch the browser environment.
- **Stateless SPAs**: Use In-Memory Storage combined with Refresh Token Rotation. Strictly avoid `localStorage`.
