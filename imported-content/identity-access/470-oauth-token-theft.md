# OAuth Token Theft: Defending Single-Page Applications Against XSS and Referrer Leakage

## The Problem: Storage Exposure in Client-Side JavaScript
Single-Page Applications (SPAs) are inherently hostile execution environments. Because SPAs run entirely within the user's browser, they are highly vulnerable to **Cross-Site Scripting (XSS)**. 

A common architectural antipattern is **storing Access Tokens and Refresh Tokens in `localStorage` or `sessionStorage`**. 

```javascript
// THE ULTIMATE DEVELOPER SIN
localStorage.setItem('access_token', token);
```

If an attacker successfully exploits an XSS vulnerability—whether through a compromised npm dependency, an unescaped user input, or a third-party script injection (e.g., ads, analytics)—they can compromise the session. The injected script can execute `localStorage.getItem()` for your token key and exfiltrate it in a single, asynchronous HTTP request. 

Furthermore, if your application appends tokens to URL query strings during navigation, or if you fail to configure a strict `Referrer-Policy`, clicking an outbound link or loading an external asset leaks those tokens directly to third parties via the standard browser **`Referer` HTTP header**.

To build a secure SPA, developers must stop handling raw tokens in JavaScript and adopt the **Backend-for-Frontend (BFF) Pattern**.

---

## Technical Architectures: Vulnerable vs. Secure (BFF)

### Vulnerable: LocalStorage Token Storage (High XSS Risk)
JavaScript has full access to the credentials. An XSS breach is a game-over event.

```
 Browser Window (Client-Side JS)                        Resource Server (API)
+------------------------------------------+           +----------------------+
|  localStorage: { "token": "ey123..." }   |           |                      |
|                                          |           |                      |
|  * [Malicious Injected Script Runs]     |           |                      |
|  * Reads localStorage                    |           |                      |
|  * Sends token to attacker.com           +---------->| Attacker uses token  |
|                                          |           | directly to steal data|
+------------------------------------------+           +----------------------+
```

### Secure: Backend-for-Frontend (BFF) Pattern
The browser only handles a **secure, encrypted, `HttpOnly` session cookie**. Client-side JavaScript has no access to the actual OAuth tokens; they are locked away on the backend server.

```
 Browser                           BFF Service (Proxy)           Resource Server (API)
+---------------+                 +--------------------+        +--------------------+
|               |                 |                    |        |                    |
| Session       |--[Secure Cookie]|  1. Validates      |        |                    |
| Cookie        |---------------->|     Cookie         |        |                    |
|               |                 |  2. Fetches AT     |        |                    |
|               |                 |     from State     |        |                    |
| (JS cannot    |                 |  3. Attaches AT to |--[AT]-->| Processes Request  |
|  read cookie) |                 |     Header         |        |                    |
+---------------+                 +--------------------+        +--------------------+
```

---

## Technical Exfiltration Comparison

| Leakage Vector | LocalStorage Architecture | BFF (Backend-for-Frontend) Architecture |
| :--- | :--- | :--- |
| **XSS Exfiltration** | **HIGH.** Simple read of storage keys retrieves raw tokens immediately. | **BLOCKED.** Tokens are stored server-side. Session cookies are flagged `HttpOnly`, blocking JavaScript access. |
| **Referrer Header Leak** | **MEDIUM.** If the token is passed in query parameters, external links exfiltrate it. | **BLOCKED.** Token never enters the browser address space or query structures. |
| **CSRF Exposure** | **LOW.** Browser does not auto-send local storage values with requests. | **MEDIUM.** Cookies are auto-sent. Requires strict **SameSite=Strict** and Anti-CSRF headers. |
| **Log Exposure** | **HIGH.** Client-side libraries often output localStorage contents in browser debug logs. | **LOW.** Tokens exist only in secure back-channel network layers. |

---

## Implementation: TypeScript BFF Proxy Middleware
Below is a clean, production-grade TypeScript implementation of a Backend-for-Frontend (BFF) API proxy. It decrypts the incoming secure session cookie, reads the encrypted OAuth access token, injects it into the downstream request's `Authorization: Bearer` header, and forwards the payload safely to the Resource Server.

```typescript
import { Request, Response, NextFunction } from 'express';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

interface SessionContext {
  userId: string;
  accessToken: string; // High-privilege access token, invisible to front-end JS
  expiresAt: number;
}

// In-memory session database (use Redis in multi-instance production environments)
const sessionStore: Map<string, SessionContext> = new Map();

/**
 * BFF Proxy Controller
 * Intercepts requests meant for the Resource Server (API)
 */
export async function bffApiProxy(req: Request, res: Response, next: NextFunction) {
  // 1. Extract the secure session ID from the cookie
  const sessionId = req.cookies?.bff_session_id;

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized: Missing session cookie' });
  }

  // 2. Retrieve session context from the secure server-side store
  const session = sessionStore.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  // Check token expiration
  const currentTimeSec = Math.floor(Date.now() / 1000);
  if (session.expiresAt < currentTimeSec) {
    return res.status(401).json({ error: 'Unauthorized: Session expired' });
  }

  // 3. Inject the secret Access Token into the downstream Authorization header
  req.headers['authorization'] = `Bearer ${session.accessToken}`;

  // Strip client cookies before forwarding to prevent backend header bloat
  delete req.headers['cookie'];

  // 4. Proxy the request to the secure, isolated downstream Resource Server (API)
  proxy.web(req, res, {
    target: 'https://internal-api.securecorp.internal/v1',
    changeOrigin: true
  }, (err) => {
    console.error('Downstream API Proxy Error:', err);
    res.status(502).json({ error: 'Bad Gateway: Microservice communication failure' });
  });
}
```

## Defensive Guidelines for BFF Implementations
1.  **Strict Cookie Flags:** When writing the session cookie (`bff_session_id`), always configure these flags:
    *   `HttpOnly`: Prevents client-side JS from reading the cookie.
    *   `Secure`: Enforces transmission over HTTPS only.
    *   `SameSite=Strict` or `SameSite=Lax`: Blocks cross-site request forgery attacks by controlling when cookies are attached to cross-origin requests.
    *   `Path=/api`: Restricts cookie transmission to designated API endpoints, keeping it out of static asset routes.
2.  **Referrer Header Protection:** Enforce a strict referrer policy across all application HTML responses by deploying this HTTP response header:
    ```http
    Referrer-Policy: no-referrer
    ```
    This completely blocks the browser from attaching the original URL (and any accidental query parameters) to downstream link navigations or script loads.
3.  **Deploy CSP Headers:** Establish a strong Content Security Policy (CSP) to restrict JavaScript script loading sources and block unauthorized external data exfiltration tunnels.
    ```http
    Content-Security-Policy: default-src 'self'; script-src 'self' https://trusted-cdn.com; connect-src 'self' https://api.mycompany.com;
    ```
