# Token Leakage: Why Passing JWTs in URL Query Parameters is a Critical Vulnerability

## The Problem: The Temptation of URL-Based Authentication

JSON Web Tokens (JWTs) are the standard mechanism for maintaining stateless authentication in modern web applications. The secure and accepted standard for transmitting a JWT from a client to a server is via the HTTP `Authorization` header using the `Bearer` schema.

```http
GET /api/v1/user/profile HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

However, developers sometimes face architectural challenges where setting HTTP headers is difficult. This often occurs when:
*   Initiating a WebSocket connection.
*   Forcing a browser to download a file via a direct `<a href="...">` link.
*   Displaying an image in an `<img>` tag that requires authentication.
*   Redirecting a user from one domain to another.

In these scenarios, developers often succumb to the temptation of passing the JWT directly in the URL query string:

```text
https://api.example.com/download/report.pdf?token=eyJhbGciOiJIUzI1NiIsInR...
```

While functional, this pattern introduces severe token leakage vulnerabilities, exposing the user's session to multiple attack vectors across the internet infrastructure.

## The Mental Model: The Postcard vs. The Envelope

Think of an HTTP Request as a letter sent through the mail.

*   **The HTTP Body (POST data) and Headers:** This is the content folded *inside* the envelope. The post office (routers, proxies, ISPs) knows where the envelope is going, but they cannot see the contents without opening it (which TLS/HTTPS prevents).
*   **The URL (including Query Parameters):** This is the address written on the *outside* of the envelope. It is treated like a postcard. Everyone who handles the message must read the URL to route it correctly.

By placing a JWT in the query string, you are writing the user's secure access credentials on the outside of a postcard. Even if the transmission is encrypted via HTTPS, the URL itself is logged and cached by numerous systems before, during, and after the request.

```mermaid
graph LR
    A[User Browser] -->|URL: ?token=eyJ...| B(Browser History)
    A -->|URL: ?token=eyJ...| C(Corporate Proxy)
    A -->|URL: ?token=eyJ...| D(Load Balancer / WAF)
    D -->|URL: ?token=eyJ...| E(API Server Access Logs)
    
    style B fill:#f9a8d4,stroke:#333,stroke-width:2px
    style C fill:#f9a8d4,stroke:#333,stroke-width:2px
    style D fill:#f9a8d4,stroke:#333,stroke-width:2px
    style E fill:#f9a8d4,stroke:#333,stroke-width:2px
    
    Note right of E: Token is leaked to <br/>every system in pink!
```

## Deep Dive: The Vectors of Leakage

When a JWT exists in a URL, it is exposed in four primary locations:

### 1. Browser History and Bookmarks
Browsers store the exact URLs visited by the user. If an attacker gains physical access to an unlocked machine, or if malware extracts the `places.sqlite` file (Firefox) or `History` file (Chrome), they obtain the fully functional JWT. Furthermore, if a user naively bookmarks the page or shares the link with a colleague, they are unknowingly handing over their active session.

### 2. The `Referer` Header
If the authenticated page (e.g., `https://example.com/dashboard?token=...`) contains links to external sites, clicking those links causes the browser to send the `Referer` header to the external site.

```http
GET / HTTP/1.1
Host: external-analytics.com
Referer: https://example.com/dashboard?token=eyJhbGciOiJIUzI1NiIsInR...
```

The third-party site (and their server logs) now possesses your user's valid JWT. While the modern `Referrer-Policy: strict-origin-when-cross-origin` mitigates some cross-domain leakage, it does not protect against same-origin leakage or older browser behaviors.

### 3. Server-Side Access Logs
Web servers (Nginx, Apache), Load Balancers (AWS ALB), and Application Performance Monitoring (APM) tools invariably log the HTTP request line, which includes the query string. 

```text
# Nginx Access Log Example
192.168.1.10 - - [10/Oct/2023:13:55:36 +0000] "GET /api/download?token=eyJhbG... HTTP/1.1" 200 1024
```

Access logs are routinely shipped to centralized logging platforms (Splunk, Elastic, Datadog). A JWT in the URL means you are writing highly sensitive, active credentials in plain text to your monitoring infrastructure, violating compliance standards (SOC2, PCI-DSS) and vastly expanding your blast radius if your logs are breached.

### 4. Corporate Proxies and TLS Interception
In enterprise environments, IT departments often deploy Forward Proxies that perform TLS termination (decrypting and re-encrypting outbound traffic). These proxies aggressively log requested URLs for auditing. A JWT in the query string is captured and stored indefinitely by the enterprise IT department.

## Secure Architectural Alternatives

Never pass bearer tokens in the URL. If you cannot use the `Authorization` header, rely on these secure alternatives:

1.  **Secure, HttpOnly Cookies:** For file downloads or direct navigation, use a short-lived session cookie. Cookies are automatically attached to the request by the browser and are never logged in URLs.
2.  **Short-Lived, Single-Use Exchange Tokens:** If you must use a URL (e.g., an email verification link), generate a highly restricted, single-use, cryptographically random string (a nonce) in your database with a 60-second expiration. Pass *this* nonce in the URL. The client exchanges the nonce via a `POST` request for the actual JWT. If the nonce leaks in a log, it is already expired and useless.