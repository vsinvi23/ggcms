# Cookie Security: HttpOnly, Secure, SameSite, and the `__Host-` Cookie Prefix

## The Problem: Subdomain Hijacking and Ambient Storage Exposure
Session cookies are the standard storage medium for keeping user sessions alive. However, standard cookie setups leave several major security vectors unmitigated. If an attacker identifies a Cross-Site Scripting (XSS) vulnerability on any page, they can immediately execute `document.cookie` in JavaScript to extract the session token and hijack the user account. 

Furthermore, if the connection is made over unencrypted HTTP (or during a temporary HTTPS downgrade), cookies without the `Secure` flag are transmitted in the clear, allowing passive network eavesdroppers to sniff the session token. 

Importantly, standard cookies are also vulnerable to **Subdomain Cookie Injection**. If an organization hosts a vulnerable or untrusted application on a subdomain (e.g., `vulnerable.company.com`), an attacker compromising that subdomain can write or force-inject cookies targeting the parent domain (`company.com`). The parent application may then implicitly trust and use this injected cookie, leading to session fixation attacks.

---

## Architectural View: The Subdomain Cookie Poisoning Attack
When domains do not restrict write access, a compromised sibling subdomain can inject cookies to hijack sessions on high-security parent domains.

```
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

## Technical Deep Dive: The Locked Cookie Configuration
To eliminate these vulnerability vectors, modern browsers support **Cookie Name Prefixes**: `__Host-` and `__Secure-`. These prefixes are interpreted as functional commands by the browser. If a cookie name begins with these exact prefixes, the browser strictly validates and rejects the cookie unless it meets precise security criteria:

1. **`__Secure-` Prefix Requirements:**
   - Must be set with the `Secure` attribute (transmitted only over HTTPS).

2. **`__Host-` Prefix Requirements (The Absolute Lock):**
   - Must be set with the `Secure` attribute.
   - Must **not** define a `Domain` attribute (domain-locked: limits the cookie scope *exclusively* to the exact host that set it, completely blocking subdomain cookie injection).
   - Must set `Path=/`.

Below is a complete, production-grade Express/Node.js implementation demonstrating the configuration of these secure-by-default, locked session cookies.

```javascript
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const app = express();

// --- SECURE COOKIE PROVISIONING CONFIGURATION ---

// Set up secure backend store (Redis) to decouple session states
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Ensure your reverse proxy (e.g., Nginx, ALB, Cloudflare) is trusted
// This is critical because express-session checks 'x-forwarded-proto' to confirm HTTPS
app.set('trust proxy', 1);

app.use(session({
    store: new RedisStore({ client: redisClient }),
    // Cryptographically sign the session cookie to prevent client tampering
    secret: process.env.SESSION_SIGNING_SECRET || 'high-entropy-signature-key-32-bytes!',
    resave: false,
    saveUninitialized: false,
    
    // --- HOIST SECURE FLAGS ---
    name: '__Host-SESSION', // Command the browser to lock this cookie directly to the host domain
    cookie: {
        // 1. Prevent access via client-side JavaScript document.cookie (Defeats XSS-based hijacking)
        httpOnly: true,
        
        // 2. Transmit cookie ONLY over cryptographically validated TLS/HTTPS connections
        secure: true,
        
        // 3. Prevent cookie transmission on cross-site requests (Defeats CSRF attacks)
        sameSite: 'Lax', 
        
        // 4. Mandate root directory scope (Required for the __Host- prefix validation)
        path: '/',
        
        // 5. Explicitly omit the 'domain' attribute.
        // If domain is omitted, __Host- forces the browser to NOT share this cookie with subdomains!
        domain: undefined,
        
        // 6. Define absolute expiration time (e.g., 2 hours) to avoid persistent storage risks
        maxAge: 1000 * 60 * 60 * 2
    }
}));

// --- Mock Handler Authenticating a User ---
app.post('/api/v1/auth/login', (req, res) => {
    // Authenticate credentials...
    
    // Initialize secure session state on the backend
    req.session.userId = 'usr-104958';
    req.session.role = 'AUTHORIZED_ADMIN';
    
    res.status(200).json({ status: 'success', message: 'Logged in successfully. Session locked via __Host- prefix.' });
});

module.exports = app;
```

---

## Defensive Countermeasures Checklist
1. **Never Omit Prefixes:** Always use the `__Host-` prefix on primary authentication session cookies to enforce domain locking.
2. **Standardize on SameSite=Lax/Strict:** Ensure cookies are never configured as `SameSite=None` unless specifically required for cross-domain federation.
3. **Use the `Secure` Attribute Everywhere:** Never serve non-secure HTTP sessions. Enforce Strict-Transport-Security (HSTS) headers globally to guarantee that clients only contact your servers over HTTPS.
