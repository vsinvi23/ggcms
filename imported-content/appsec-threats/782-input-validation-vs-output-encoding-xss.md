# Input Validation vs Output Encoding: Context-Aware Escaping to Defeat XSS

## The Problem

Cross-Site Scripting (XSS) remains a persistent threat because developers frequently treat input validation and output encoding as interchangeable concepts. They are not.

**Input Validation** is the practice of inspecting data *entering* the application boundary (e.g., verifying that an email matches a specific regex, or checking that an age is a positive integer). While crucial for data integrity, input validation cannot prevent XSS for free-text fields (such as comments, addresses, or bio details) where characters like `<` or `>` must be legally allowed.

**Output Encoding** is the practice of safely translating raw data *leaving* the application before it is rendered into a specific browser context. Browsers interpret HTML, JavaScript, CSS, and URLs using completely different parsers. If a developer validates input successfully, but inserts it raw into a `<script>` block, the HTML parser will execute the payload. Conversely, encoding JavaScript variables using HTML-entity encoding is useless because JavaScript engines do not decode `&lt;` into `<` at runtime.

To completely eradicate XSS, data must be encoded dynamically at the exact point of rendering, tailored strictly to the destination rendering context.

---

## Architectural Data Flow & Rendering Sinks

Data moves from untrusted inputs, sits safely in storage, and only presents an XSS risk when it hits a rendering engine. The defense is applied right at the destination sink.

### The Rendering Pipeline & Context Sinks
```
[ Untrusted User Input ] ──► [ Input Validation ] ──► [ Database (Raw Data) ]
                                                            │
                                                            ▼
                                                    [ Dynamic Rendering ]
                                                            │
            ┌──────────────────┬────────────────────┼───────────────────┐
            ▼                  ▼                    ▼                   ▼
     [ HTML Body ]     [ HTML Attribute ]    [ Script Block ]     [ URI Context ]
     - Encoding:       - Encoding:           - Encoding:          - Encoding:
       Entity Escape     Attribute Escape      JS Escape            URL Escape
```

---

## Robust Context-Aware Encoding Utility

Below is a production-ready TypeScript utility class implementing five distinct contexts of cryptographic-grade escaping according to OWASP standards.

```typescript
/**
 * ContextAwareEncoder provides robust, precise escaping mechanisms
 * for different browser parsing contexts to prevent Cross-Site Scripting (XSS).
 */
export class ContextAwareEncoder {

    /**
     * Context 1: HTML Body Encoding
     * Use when inserting untrusted data between standard HTML tags (e.g., <div>untrusted</div>).
     */
    public static encodeForHTML(input: string): string {
        if (!input) return '';
        return input.replace(/[&<>"']/g, (char) => {
            switch (char) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#x27;';
                default: return char;
            }
        });
    }

    /**
     * Context 2: HTML Attribute Encoding
     * Use when placing untrusted data inside HTML attributes (e.g., <input value="untrusted">).
     * Strictly escapes all alphanumeric characters to safeguard against unquoted attributes.
     */
    public static encodeForHTMLAttribute(input: string): string {
        if (!input) return '';
        // Safe characters list: alphanumeric, safe hyphens, periods
        return input.replace(/[^a-zA-Z0-9.\-_]/g, (char) => {
            const code = char.charCodeAt(0);
            return `&#x${code.toString(16).toUpperCase()};`;
        });
    }

    /**
     * Context 3: JavaScript Variable Encoding
     * Use when placing untrusted data inside an inline script variable (e.g., const user = 'untrusted';).
     */
    public static encodeForJavaScript(input: string): string {
        if (!input) return '';
        return input.replace(/[^a-zA-Z0-9]/g, (char) => {
            const code = char.charCodeAt(0);
            if (code < 256) {
                // Return hexadecimal unicode escape sequence
                const hex = code.toString(16).padStart(2, '0');
                return `\\x${hex.toUpperCase()}`;
            } else {
                // Return full unicode escape sequence
                const hex = code.toString(16).padStart(4, '0');
                return `\\u${hex.toUpperCase()}`;
            }
        });
    }

    /**
     * Context 4: CSS Context Encoding
     * Use when placing untrusted data in CSS styles (e.g., <div style="color: untrusted">).
     */
    public static encodeForCSS(input: string): string {
        if (!input) return '';
        return input.replace(/[^a-zA-Z0-9]/g, (char) => {
            const code = char.charCodeAt(0);
            const hex = code.toString(16);
            // CSS escape format is backslash followed by hex code and a space/delimiter
            return `\\${hex} `;
        });
    }

    /**
     * Context 5: URL/URI Parameter Encoding
     * Use when inserting untrusted data into query strings or paths (e.g., <a href="/search?q=untrusted">).
     */
    public static encodeForURL(input: string): string {
        if (!input) return '';
        return encodeURIComponent(input);
    }
}
```

---

## Architectural Rules for Frameworks

While utilities are useful, modern UI frameworks (React, Angular) automate HTML Body encoding. However, vulnerabilities occur when developers bypass these built-ins:

1. **Avoid Bypassing Framework Defenses**: Never use `dangerouslySetInnerHTML` in React or `ElementRef.nativeElements` / `bypassSecurityTrustHtml` in Angular unless absolutely mandatory. If you must, run the output through a specialized sanitizer library like **DOMPurify** first.
2. **Set a Strong Content Security Policy (CSP)**: Implement a strict CSP to act as a secondary defense layer. Restrict script sources to trusted origins and reject inline scripts (`unsafe-inline`):
   `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-random123'; object-src 'none';`
