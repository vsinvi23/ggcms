# HTTP Request Smuggling: Exploiting Frontend/Backend Desync Vulnerabilities

## The Problem: Ambiguous HTTP Boundaries

Modern web architecture rarely exposes application servers directly to the internet. Instead, reverse proxies, load balancers, or Web Application Firewalls (WAFs) sit at the edge, forwarding requests to backend servers over persistent TCP connections (keep-alive). 

HTTP Request Smuggling (HRS) occurs when the frontend proxy and the backend server disagree on where a single HTTP request ends and the next begins. This desynchronization allows an attacker to prepend a hidden "smuggled" request to the next legitimate user's request on the same persistent connection. The consequences range from cache poisoning and session hijacking to bypassing WAF security controls.

## Architectural Flaw: Content-Length vs. Transfer-Encoding

The root cause lies in how HTTP/1.1 determines the length of a request body. The specification provides two mutually exclusive headers:
1.  `Content-Length (CL)`: Specifies the exact size of the body in bytes.
2.  `Transfer-Encoding (TE)`: When set to `chunked`, the body is parsed in hexadecimal chunks, ending with a `0` length chunk.

If an attacker sends a request containing *both* headers, the HTTP/1.1 specification (RFC 7230) dictates that the `Transfer-Encoding` header overrides `Content-Length`. However, many servers fail to enforce this strictly, especially when the headers are obfuscated (e.g., `Transfer-Encoding: chunked\r`, `Transfer-Encoding : chunked`).

When the frontend and backend servers prioritize these headers differently, desynchronization occurs. 

### The CL.TE Vulnerability

In a CL.TE scenario, the frontend proxy uses `Content-Length`, and the backend server uses `Transfer-Encoding`.

```text
[ Attacker Request ]
POST / HTTP/1.1
Host: api.serenya.com
Content-Length: 44
Transfer-Encoding: chunked

0

POST /admin/delete_user HTTP/1.1
Host: api.serenya.com
```

**Frontend Processing:**
The frontend reads `Content-Length: 44`. It forwards the entire payload, including the smuggled `POST /admin/delete_user` request, to the backend over the persistent connection.

**Backend Processing:**
The backend reads `Transfer-Encoding: chunked`. It parses the first chunk (`0`), assuming the request is complete. It leaves the remaining bytes (`POST /admin/delete_user...`) sitting in the connection buffer.

**The Desync:**
When the next innocent user sends a request over that same persistent TCP connection, the backend prepends the buffered attacker payload to the victim's request.

```text
[ Victim Request Arrives ]
GET /profile HTTP/1.1
Host: api.serenya.com
Cookie: session=victims_token

[ Backend Interprets ]
POST /admin/delete_user HTTP/1.1
Host: api.serenya.comGET /profile HTTP/1.1
Host: api.serenya.com
Cookie: session=victims_token
```

The victim unwittingly executes the `/admin/delete_user` action, potentially utilizing their own authenticated session cookies that are appended to the smuggled request.

## The TE.CL Vulnerability

Conversely, TE.CL occurs when the frontend prioritizes `Transfer-Encoding` and the backend relies on `Content-Length`.

```text
POST / HTTP/1.1
Host: api.serenya.com
Content-Length: 4
Transfer-Encoding: chunked

24
POST /admin/delete_user HTTP/1.1
0

```

The frontend parses the chunks and forwards the whole payload. The backend reads `Content-Length: 4`, stops reading after the "24\r\n", and leaves the `POST /admin/delete_user` request waiting in the buffer for the next connection.

## Defenses and Mitigation Strategies

Addressing HTTP Request Smuggling requires eliminating the ambiguity in HTTP request boundaries across the entire infrastructure stack.

### 1. Upgrade to HTTP/2 End-to-End

HTTP/2 utilizes a binary framing mechanism rather than text-based boundary markers like CL and TE. The length of a frame is explicitly defined in the binary protocol, making boundary ambiguity impossible.

**Crucial Note:** Many architectures terminate HTTP/2 at the frontend load balancer and communicate with backends via HTTP/1.1. This "HTTP/2 downgrading" re-introduces the vulnerability. To mitigate HRS entirely, HTTP/2 must be used end-to-end, from the client to the proxy, and from the proxy to the backend application server.

### 2. Strict Header Normalization and Rejection

If HTTP/1.1 must be maintained, intermediate proxies must ruthlessly enforce RFC 7230. 

*   **Reject Dual Headers:** If a request contains both `Content-Length` and `Transfer-Encoding`, the proxy must reject it with a `400 Bad Request`.
*   **Reject Obfuscation:** Reject any request with malformed header names (e.g., trailing spaces, vertical tabs).
*   **Normalize Requests:** The frontend proxy should normalize requests before forwarding. For example, it can buffer chunked requests, strip the `Transfer-Encoding` header, and forward the request to the backend with a calculated, precise `Content-Length`.

**Nginx Configuration Example (Normalization):**
Ensure `chunked_transfer_encoding` is properly handled. While Nginx generally handles this safely by default, disabling keep-alive to backends in high-risk environments removes the shared connection pool entirely.

### 3. Disable Backend Connection Reuse (The Nuclear Option)

If patching the parsing discrepancies between the frontend and backend is unfeasible, disabling persistent connections (keep-alives) between the proxy and backend server will prevent smuggled requests from bleeding into subsequent users' sessions.

**HAProxy Example:**
```nginx
backend app_servers
    # Forces a new TCP connection for every request
    option httpclose 
    server app1 10.0.0.10:8080
```
*Warning:* This incurs a massive performance penalty due to constant TCP handshakes and TLS negotiation overhead.

## Conclusion

HTTP Request Smuggling exploits the complex, multi-tiered nature of modern HTTP routing. By weaponizing parsing discrepancies, attackers shatter the fundamental isolation between user requests. Hardening your infrastructure requires moving to binary protocols like HTTP/2 end-to-end or enforcing mercilessly strict validation of HTTP/1.1 boundary headers at the edge.
