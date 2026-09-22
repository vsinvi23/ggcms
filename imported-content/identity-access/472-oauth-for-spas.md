# OAuth for SPAs: The BFF Pattern vs. Local Storage

## The Problem
Single Page Applications (SPAs) run entirely in the browser, an inherently untrusted environment. Historically, SPAs relied on the OAuth 2.0 Implicit Flow, returning access tokens directly in the URL fragment. With the Implicit flow deprecated, SPAs shifted to the Authorization Code Flow with PKCE. However, a structural vulnerability remains: storing access tokens in `localStorage` or `sessionStorage` exposes them directly to Cross-Site Scripting (XSS) attacks.

## The Flawed Architecture: Tokens in the Browser
When tokens live in JavaScript memory or `localStorage`, any injected script can exfiltrate them.

```text
[ Browser (SPA) ]                                      [ API Server ]
        |                                                    |
        | 1. Token stored in localStorage                    |
        |    (Vulnerable to XSS)                             |
        |                                                    |
        | 2. fetch('/data', { Authorization: 'Bearer...' })  |
        |--------------------------------------------------->|
```

## The Solution: Backend-For-Frontend (BFF)
The Backend-For-Frontend (BFF) pattern removes token handling from the browser entirely. A lightweight backend server acts as a proxy between the SPA and the upstream identity/resource servers. The BFF conducts the OAuth flow, stores the tokens securely in a backend session or cache, and issues a strictly scoped, `HttpOnly`, `Secure` cookie to the SPA.

### Architecture of the BFF Pattern

```text
[ Browser (SPA) ]              [ BFF (Node/Go/Java) ]              [ OAuth OP / APIs ]
        |                                |                                  |
        | 1. Clicks Login                |                                  |
        |------------------------------->|                                  |
        |                                | 2. Initiates Auth Code + PKCE    |
        |                                |--------------------------------->|
        |                                | 3. Returns Tokens                |
        |                                |<---------------------------------|
        | 4. Sets HttpOnly, Secure Cookie| (Stores Tokens internally)       |
        |<-------------------------------|                                  |
        |                                |                                  |
        | 5. GET /api/data (Cookie sent) |                                  |
        |------------------------------->| 6. Proxies req with Bearer Token |
        |                                |--------------------------------->|
        |                                | 7. Returns Data                  |
        |<-------------------------------|<---------------------------------|
```

### Advantages of the BFF Pattern
1. **Zero XSS Token Theft**: JavaScript cannot read `HttpOnly` cookies. An XSS attacker can forge requests but cannot steal the token for offline use.
2. **Simplified SPA Logic**: The frontend delegates auth state complexity to the backend.
3. **Secure Client Credentials**: The BFF, being a confidential client, can securely hold a `client_secret`, avoiding the risks associated with public clients.

## Implementation: Building a Basic Node.js BFF
Here is a robust implementation using Express and `http-proxy-middleware`.

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const session = require('express-session');

const app = express();

// 1. Configure Secure Sessions (This replaces localStorage)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Must be true on HTTPS
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
    }
}));

// 2. OAuth Callback Endpoint (Simplified)
app.get('/oauth/callback', async (req, res) => {
    const code = req.query.code;
    // ... exchange code for token via Identity Provider ...
    const tokenData = await exchangeCodeForToken(code);
    
    // Store token securely in the BFF session, NOT sent to the browser
    req.session.accessToken = tokenData.access_token;
    res.redirect('/');
});

// 3. API Proxy: Inject Bearer Token for Upstream Services
app.use('/api', createProxyMiddleware({
    target: 'https://api.upstream-service.internal',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Retrieve token from secure session
        const token = req.session.accessToken;
        if (token) {
            // Inject token into header for upstream API
            proxyReq.setHeader('Authorization', `Bearer ${token}`);
        }
    }
}));

app.listen(3000, () => console.log('BFF running on port 3000'));
```

## Anti-CSRF Considerations
Because the BFF relies on cookies, it introduces a CSRF risk. To mitigate this:
1. Ensure cookies use `SameSite=Strict` or `Lax`.
2. Implement a Double-Submit Cookie pattern or custom header check (e.g., forcing the SPA to send a custom `X-Requested-With` header which the BFF validates).

By adopting the BFF pattern, you fundamentally shift the attack surface, eliminating token exfiltration vectors and enabling enterprise-grade security for browser-based applications.