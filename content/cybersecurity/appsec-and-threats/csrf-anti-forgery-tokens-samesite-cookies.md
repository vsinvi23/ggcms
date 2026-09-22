---
title: "CSRF: Forging State-Changing Requests and Anti-CSRF Token Architectures"
description: "How Cross-Site Request Forgery exploits ambient browser credentials to forge authenticated requests, and how to stop it with the Synchronizer Token and Double-Submit Cookie patterns plus SameSite cookies."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "csrf"
  - "cross-site-request-forgery"
  - "samesite"
  - "double-submit-cookie"
  - "synchronizer-token"
---

# CSRF: Forging State-Changing Requests and Anti-CSRF Token Architectures

Cross-Site Request Forgery (CSRF) is an attack that forces an end user to execute unwanted actions on a web application in which they are currently authenticated. It exploits a fundamental design property of web browsers: **ambient credential transmission**. When a user authenticates against an application, the server issues a session cookie. For all subsequent HTTP requests to that domain, the browser automatically appends this cookie — regardless of which page initiated the request.

If an authenticated user visits a malicious external website while their session is active, that site can programmatically trigger silent, cross-site HTTP requests (hidden HTML forms, `fetch` calls) to the vulnerable application. Because the browser automatically attaches the user's valid session cookie, the server processes the malicious request as authenticated and executes the state-changing operation — updating an email address, changing a password, or authorizing a funds transfer.

---

## Architectural View: The CSRF Attack Flow

```text
+------------------+                   +--------------------+
|  Authenticated   |                   |  Vulnerable App    |
|   User Browser   |                   |  (bank.com)         |
+------------------+                   +--------------------+
         |                                       ^
         |  1. Authenticates & gets Session Cookie|
         +---------------------------------------+
         |
         |  2. Visits malicious-site.com
         v
+------------------+
|  Malicious Site  |
|  (evil.com)      |
+------------------+
         |
         |  3. Sends POST request to bank.com/api/transfer
         |     (Browser AUTOMATICALLY appends bank.com Cookie!)
         v
+------------------+
|  Authenticated   | ------------------------------------> [Executes Transfer]
|   User Browser   |
+------------------+
```

### The Attack Scenario in Detail

Assume `bank.com` uses a simple `POST` request to transfer money:

```http
POST /api/transfer HTTP/1.1
Host: bank.com
Cookie: session_id=valid_user_session

amount=1000&to_account=hacker_account
```

The attacker creates `evil.com` and tricks the victim into visiting it (e.g., via a phishing email). The page contains a hidden, auto-submitting form:

```html
<!-- Hosted on evil.com -->
<html>
  <body>
    <h1>You won a prize!</h1>
    <form action="https://bank.com/api/transfer" method="POST" id="csrf_form">
      <input type="hidden" name="amount" value="1000" />
      <input type="hidden" name="to_account" value="hacker_account" />
    </form>
    <script>
      document.getElementById('csrf_form').submit();
    </script>
  </body>
</html>
```

1. Victim logs into `bank.com`.
2. Victim visits `evil.com`.
3. `evil.com` automatically submits the POST request to `bank.com`.
4. The victim's browser dutifully attaches the `session_id` cookie for `bank.com`.
5. The bank processes the transfer as if the victim had initiated it.

---

## Defense 1: Anti-CSRF Tokens

Modern anti-CSRF patterns require including a cryptographically strong, unpredictable value in the payload body or headers of every state-changing request. Since a malicious site cannot read cross-origin responses under the Same-Origin Policy, it cannot discover this token to forge into its request.

Two architectural patterns implement this:

1. **Synchronizer Token Pattern** — the server maintains a mapping of session-to-token on the backend, and validates the submitted token against that session's stored value.
2. **Double-Submit Cookie Pattern** — the token is sent in both a cookie and an HTTP header/body field. The backend validates that the two match. This works statelessly (no server-side token store needed) precisely because a cross-origin attacker can trigger a cookie to be sent, but cannot *read* that cookie's value to also set the matching header.

### Robust Double-Submit Cookie Implementation (Node.js/Express)

```javascript
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('appsec-secure-cookie-key'));

const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

// Middleware: Injects a Double-Submit CSRF cookie and provides the token to the template
const injectCsrfTokens = (req, res, next) => {
    let csrfToken = req.cookies['__Host-XSRF-TOKEN'];
    if (!csrfToken) {
        csrfToken = generateCsrfToken();

        // Host-prefixed, Secure, Lax to bind the token cookie directly to the domain boundary
        res.cookie('__Host-XSRF-TOKEN', csrfToken, {
            httpOnly: false, // Must be readable by JS so it can be echoed back in a header/form field
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
    const tokenFromPayload = req.body._csrf || req.headers['x-xsrf-token'];
    const tokenFromCookie = req.cookies['__Host-XSRF-TOKEN'];

    if (!tokenFromCookie || !tokenFromPayload) {
        return res.status(403).json({ error: 'CSRF validation failed: Missing token' });
    }

    // Constant-time comparison protects against timing side-channels
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
    res.status(200).json({ status: 'success', message: `Email updated to ${newEmail}` });
});
```

---

## Defense 2: The `SameSite` Cookie Attribute

Modern browsers support the `SameSite` attribute on cookies, which tells the browser whether to send the cookie along with cross-site requests at all — attacking the vulnerability at its root (ambient credential attachment) rather than only detecting forged requests after the fact.

```http
Set-Cookie: session_id=valid_user_session; SameSite=Lax; Secure; HttpOnly
```

| `SameSite` Value | Browser Sending Behavior | Use Case Suitability |
| :--- | :--- | :--- |
| **Strict** | Cookie is sent **only** in first-party contexts; withheld on all cross-site navigations (e.g., clicking a link from an email). | High-security internal applications, bank portals. |
| **Lax** | Cookie is withheld on cross-site sub-requests (images, frames, POST forms), but sent on **top-level GET navigation** (safe links). | Standard web applications — the practical default. |
| **None** | Cookie is sent in all contexts, including cross-site sub-requests. Requires the `Secure` attribute. | Cross-site tracking widgets, embedded third-party APIs — avoid for session cookies. |

Using `SameSite=Lax` or `Strict` neutralizes the classic form-based CSRF attack shown above for all modern browsers, because the attacker's cross-site POST from `evil.com` never carries the session cookie in the first place.

---

## Defensive Countermeasures Checklist

1. **Mandate `SameSite=Lax`/`Strict`:** Never allow session cookies to default to `SameSite=None` for same-organization applications.
2. **Layer anti-CSRF tokens on top:** `SameSite` alone doesn't cover every legacy browser or every edge case (e.g., some GET-based state changes); pair it with a Synchronizer Token or Double-Submit Cookie check on all state-changing endpoints.
3. **Prefer custom headers for SPA auth:** If your front end uses a single-page application, authenticate via a custom header (`Authorization: Bearer <JWT>`) instead of relying purely on browser-managed cookies. Browsers do not attach custom headers to cross-origin requests automatically, which eliminates the classic CSRF vector entirely for that request path.
4. **Constant-time token comparison:** Always validate CSRF tokens using a timing-safe comparison function to avoid leaking the correct value byte-by-byte through response timing.
