# CSRF Security: Forging State-Changing Requests and Anti-CSRF Token Architectures

## The Problem: Ambient Credentials and Automated Trust
Cross-Site Request Forgery (CSRF) exploits a fundamental design property of web browsers: ambient credential transmission. When a user authenticates against an application, the server issues a session cookie. For all subsequent HTTP requests to that domain, the browser automatically appends this cookie. 

If an authenticated user visits a malicious external website while their session is active, that malicious site can programmatically trigger silent, cross-site HTTP requests (e.g., using hidden HTML forms or `fetch` calls) to the vulnerable application. Because the browser automatically attaches the user's valid session cookie, the server-side application processes the malicious request as authenticated and executes the state-changing operation (such as updating email addresses, modifying passwords, or authorizing transactions).

---

## Architectural View: The CSRF Attack Flow
CSRF relies entirely on the browser treating all requests from any origin as equally trusted if they target the authenticated domain.

```
+------------------+                   +--------------------+
|  Authenticated   |                   |  Vulnerable App    |
|   User Browser   |                   |  (server.com)      |
+------------------+                   +--------------------+
         |                                       ^
         |  1. Authenticates & gets Session Cookie|
         +---------------------------------------+
         |
         |  2. Visits malicious-site.com
         v
+------------------+
|  Malicious Site  |
|  (attacker.com)  |
+------------------+
         |
         |  3. Sends POST request to server.com/api/update-email
         |     (Browser AUTOMATICALLY appends server.com Cookie!)
         v
+------------------+
|  Authenticated   | ------------------------------------> [Executes Action]
|   User Browser   |
+------------------+
```

---

## Technical Deep Dive: Anti-CSRF Architectures

Modern anti-CSRF patterns require the inclusion of a cryptographically secure, random value within the payload body or headers of state-changing requests. Since a malicious site cannot read cross-origin responses or payloads under the Same-Origin Policy, it cannot forge this token value.

Two primary architectural patterns protect APIs:
1. **Synchronizer Token Pattern:** The server maintains a mapping of session-to-token on the backend.
2. **Double-Submit Cookie Pattern:** The token is sent in both a cookie and an HTTP header. The backend validates that they match.

### 1. Robust Double-Submit Cookie Pattern (Node.js/Express)
Below is a highly secure implementation of the Double-Submit Cookie validation pattern, integrated with robust SameSite session cookie enforcement.

```javascript
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('appsec-secure-cookie-key'));

// Helper to generate secure tokens
const generateCsrfToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Middleware: Injects a Double-Submit CSRF cookie and provides the token to the template
const injectCsrfTokens = (req, res, next) => {
    // Generate token if not already present
    let csrfToken = req.cookies['__Host-XSRF-TOKEN'];
    if (!csrfToken) {
        csrfToken = generateCsrfToken();
        
        // Host-prefixed, Secure, HttpOnly, and Lax/Strict to bind directly to the domain boundary
        res.cookie('__Host-XSRF-TOKEN', csrfToken, {
            httpOnly: false, // Must be accessible via JS to read and inject in headers/forms
            secure: true,
            sameSite: 'Lax',
            path: '/'
        });
    }
    
    req.csrfToken = csrfToken;
    next();
};

// Middleware: Validates that the submitted token matches the cookie value
const validateDoubleSubmitCsrf = (req, res, next) => {
    // Read token from both custom header or body
    const tokenFromPayload = req.body._csrf || req.headers['x-xsrf-token'];
    const tokenFromCookie = req.cookies['__Host-XSRF-TOKEN'];

    if (!tokenFromCookie || !tokenFromPayload) {
        return res.status(403).json({ error: 'CSRF validation failed: Missing token' });
    }

    // Protect against timing attacks using constant-time comparison
    const cookieBuffer = Buffer.from(tokenFromCookie);
    const payloadBuffer = Buffer.from(tokenFromPayload);

    if (cookieBuffer.length !== payloadBuffer.length || !crypto.timingSafeEqual(cookieBuffer, payloadBuffer)) {
        console.warn(`[SECURITY ALERT] CSRF validation failure detected from IP ${req.ip}`);
        return res.status(403).json({ error: 'CSRF validation failed: Token mismatch' });
    }

    next();
};

// --- Form Rendering Route ---
app.get('/profile', injectCsrfTokens, (req, res) => {
    res.send(`
        <form action="/profile/update" method="POST">
            <!-- Inject the token into a hidden form parameter -->
            <input type="hidden" name="_csrf" value="${req.csrfToken}">
            <label>New Email:</label>
            <input type="email" name="email" required>
            <button type="submit">Update Profile</button>
        </form>
    `);
});

// --- State-Changing Endpoint (CSRF Validation Mandatory) ---
app.post('/profile/update', validateDoubleSubmitCsrf, (req, res) => {
    const newEmail = req.body.email;
    // Execute state-changing logic safely
    res.status(200).json({ status: 'success', message: `Email updated to ${newEmail}` });
});
```

---

## Defensive Countermeasures: SameSite Cookie Attributes
Anti-CSRF tokens remain the primary cryptographic barrier, but modern browsers provide a strong defense-in-depth utility via `SameSite` cookie flags:

| SameSite Value | Browser Sending Behavior | Use Case Suitability |
| :--- | :--- | :--- |
| **Strict** | Cookie is sent **only** in first-party contexts. It is withheld on all cross-site navigations (e.g., clicking a link from an email). | High-security internal applications, bank portals. |
| **Lax** | Cookie is withheld on cross-site subrequests (images, frames, POST forms), but sent on **top-level GET navigation** (safe links). | Standard web applications (balance of usability and safety). |
| **None** | Cookie is sent in all contexts, including cross-site subrequests. Requires the `Secure` attribute. | Cross-site tracking widgets, embedded third-party APIs. |

1. **Mandate SameSite=Lax/Strict:** Never allow session cookies to default to `SameSite=None`.
2. **Standardize on Modern API Headers:** If your front-end uses a single-page application (SPA), use standard custom HTTP headers (e.g., `Authorization: Bearer <JWT>` or custom `X-XSRF-TOKEN` headers) instead of pure browser-managed cookies for auth verification. Since browsers do not attach custom headers to cross-origin requests automatically, this completely eliminates standard CSRF risk.
