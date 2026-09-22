# Cross-Site Scripting (XSS): Reflected, Stored, and DOM-based Injection Controls

## The Problem: Script Execution in the Client Trust Boundary
Cross-Site Scripting (XSS) is a severe vulnerability where an application takes untrusted, unvalidated input and outputs it back to a browser context without proper encoding or sanitization. This allows attackers to inject malicious HTML or JavaScript code into the victim's browser session. 

Once executed, this script bypasses the Same-Origin Policy (SOP), granting the attacker unrestricted access to the browser session, session tokens (`document.cookie` if not set to HttpOnly), keystrokes, and the ability to execute API calls on behalf of the authenticated user. To secure modern client-side architectures, developers must master the specific data flows of Reflected, Stored, and DOM-based XSS and deploy rigorous containment policies.

---

## Architectural View: The Data Flow of Stored, Reflected, and DOM-based XSS
XSS manifests in distinct ways based on where the payload is parsed and how it traverses the system.

```
[ Reflected XSS ]
Attacker Payload --> HTTP Request (URL/Param) --> Server Echoes Directly --> Browser Execution

[ Stored XSS ]
Attacker Payload --> HTTP Request --> Persisted in Database --> User Reads Page --> Rendered to Victim's Browser

[ DOM-based XSS ]
Attacker Payload --> Fragment Identifier/hash (#payload) --> Client JS Reads Source --> Sink (`innerHTML`) --> Browser Execution
```

- **Reflected XSS:** The malicious payload is part of the request sent to the server and is immediately reflected in the response page (e.g., search queries or error messages).
- **Stored XSS:** The payload is stored permanently (e.g., in a database, forum post, or comment field) and is executed when a user requests the stored resource.
- **DOM-based XSS:** The vulnerability exists entirely in the client-side JavaScript. The source (e.g., `location.search` or `document.referrer`) flows into a vulnerable sink (e.g., `innerHTML` or `document.write`) without ever touching the server backend.

---

## Technical Deep Dive: Exploit Sinks and Sanitization

### 1. Vulnerable and Secure DOM-based Rendering (Vanilla JavaScript)
Below is a clear representation of an unsafe DOM manipulation script, followed immediately by its secure, sanitized counterpart utilizing the enterprise-grade DOMPurify library and the W3C Trusted Types API.

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
        // Extracting input from location hash: e.g. index.html#<img src=x onerror=alert(1)>
        const untrustedInput = decodeURIComponent(window.location.hash.substring(1));

        // --- VULNERABLE APPROACH ---
        // Sinks like innerHTML directly execute any script or event handler passed into them
        // document.getElementById('output-unsafe').innerHTML = untrustedInput; // DO NOT DO THIS

        // --- SECURE APPROACH 1: Strict Context-Aware Sanitization ---
        const cleanHTML = DOMPurify.sanitize(untrustedInput, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
            ALLOWED_ATTR: ['href', 'title']
        });
        document.getElementById('output-secure').innerHTML = cleanHTML;

        // --- SECURE APPROACH 2: Enforcing Trusted Types (Modern Browsers) ---
        // Prevents write-access to dangerous sinks unless wrapping object is a vetted Trusted Type
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            const escapeHTMLPolicy = window.trustedTypes.createPolicy('myEscapePolicy', {
                createHTML: (string) => {
                    return DOMPurify.sanitize(string);
                }
            });
            
            // This sink accepts escapeHTMLPolicy safely, throwing an error if generic string is passed
            document.getElementById('output-secure').innerHTML = escapeHTMLPolicy.createHTML(untrustedInput);
        }
    </script>
</body>
</html>
```

---

## The Ultimate Containment: Strict Content Security Policy (CSP)
Even with strict sanitization, a multi-layered defense requires containing XSS through a non-permissive Content Security Policy (CSP). A modern, strict CSP relies on cryptographic nonces (number used once) rather than dynamic domain white-lists which can be bypassed via JSONP or open redirects.

Below is an example of an Express/Node.js response setting a highly defensive Content Security Policy:

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

app.get('/dashboard', (req, res) => {
    // Generate a cryptographically secure, high-entropy unique nonce per request
    const nonce = crypto.randomBytes(16).toString('base64');

    // Enforce Content-Security-Policy HTTP Header
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

    // Render the layout inserting the matching nonce into script elements
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Secure Console</title>
        </head>
        <body>
            <h1>Administrative Console</h1>
            <!-- Inline and external scripts MUST carry the matching cryptographic nonce -->
            <script nonce="${nonce}">
                console.log("Safe script execution under CSP enforcement.");
            </script>
        </body>
        </html>
    `);
});
```

---

## Defensive Countermeasures Checklist
1. **Never Trust Sinks:** Avoid writing direct strings to `innerHTML`, `document.write`, or `eval()`. Use safe primitives like `textContent` or `element.setAttribute`.
2. **Context-Aware Encoding:** If data must be rendered in HTML, attributes, or JS variables, apply specific encoding (HTML Entity Encoding, JavaScript String Encoding).
3. **Set Cookie HttpOnly:** Always mark session cookies with the `HttpOnly` flag to prevent access via JavaScript `document.cookie` if an XSS bypass is discovered.
