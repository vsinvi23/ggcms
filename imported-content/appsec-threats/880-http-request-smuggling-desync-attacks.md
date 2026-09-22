# HTTP Request Smuggling: Exploiting Frontend/Backend Desync Vulnerabilities

## The Problem: Architectural Desynchronization

HTTP Request Smuggling (HRS) occurs when a frontend server (like a load balancer, reverse proxy, or WAF) and a backend server disagree on where a single HTTP request ends and the next one begins. This ambiguity allows an attacker to "smuggle" a hidden request within a legitimate one. 

The root cause lies in how HTTP/1.1 dictates the length of a message body. The protocol provides two mutually exclusive headers for this:
1. `Content-Length` (CL): Specifies the body size in bytes.
2. `Transfer-Encoding` (TE): Specifies that the body uses chunked encoding.

When both headers are present, RFC 7230 states that the `Transfer-Encoding` header overrides `Content-Length`. However, varying implementations in proxies and web servers lead to parsing failures, creating TE.CL, CL.TE, or TE.TE desync conditions.

## The Mechanics: CL.TE and TE.CL Exploits

If the frontend prioritizes `Content-Length` (CL) but the backend prioritizes `Transfer-Encoding` (TE), you have a **CL.TE vulnerability**. Conversely, if the frontend uses TE and the backend uses CL, you have a **TE.CL vulnerability**.

### ASCII Architecture: A CL.TE Desync

```text
[ Attacker ] ---> [ Frontend Proxy (Uses CL) ] ---> [ Backend Server (Uses TE) ]

--- Attacker's Malicious Payload ---
POST / HTTP/1.1
Host: serenya.local
Content-Length: 44
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
Host: serenya.local
```

**What happens:**
1. The **Frontend Proxy** looks at `Content-Length: 44`. It determines the entire payload (including the `GET /admin`) is part of the first request and forwards the whole block to the backend.
2. The **Backend Server** ignores CL and looks at `Transfer-Encoding: chunked`. It reads the `0\r\n\r\n` and assumes the first request has finished.
3. The remaining bytes (`GET /admin HTTP/1.1...`) are left sitting in the backend's TCP buffer, effectively poisoning the socket.
4. When the *next legitimate user* sends a request over that same keep-alive TCP connection, their request is appended to the smuggled `GET /admin`, executing an administrative action under the victim's session.

## The Exploit Impact

Request smuggling isn't just about bypassing WAFs. It allows for:
- **Session Hijacking:** Stealing the next user's cookies by smuggling a request to an endpoint that reflects input.
- **Cache Poisoning:** Smuggling a request that caches a malicious response for a legitimate URI.
- **Access Control Bypass:** Forcing the backend to process internal administrative routes that the frontend normally blocks.

## The Solution: Protocol Modernization and Strict Parsing

### 1. HTTP/2 End-to-End
HTTP/2 eliminates the ambiguity of HTTP/1.1's text-based framing by using an explicit binary framing layer. If you use HTTP/2 from the client to the proxy, *and* from the proxy to the backend, request smuggling becomes practically impossible. (Note: downgrading HTTP/2 to HTTP/1.1 at the proxy reintroduces the risk).

### 2. Disabling TCP Connection Reuse
Disabling `keep-alive` on backend connections prevents request queue poisoning, as the TCP socket is closed after every request. However, this incurs a massive performance penalty due to constant TLS handshakes.

### 3. Strict Header Parsing (Robust Configuration)

If you must use HTTP/1.1, ensure your load balancers and proxies aggressively reject ambiguous requests. 

**HAProxy Configuration Snippet:**
Reject requests containing both `Content-Length` and `Transfer-Encoding`.

```haproxy
frontend https-in
    bind *:443 ssl crt /etc/ssl/certs/serenya.pem
    
    # Block requests with both CL and TE headers
    http-request deny if { req.hdr(transfer-encoding) -m found } { req.hdr(content-length) -m found }
    
    # Block obfuscated TE headers (e.g., Transfer-Encoding: xchunked)
    http-request deny if { req.hdr(transfer-encoding) -m found } !{ req.hdr(transfer-encoding) -m str chunked }
    
    default_backend app-cluster
```

**Nginx Configuration:**
Nginx generally handles ambiguous headers safely in newer versions by rejecting them outright, but ensure `proxy_pass` isn't inadvertently normalizing malformed TE headers in a way the backend misinterprets.

```nginx
server {
    listen 443 ssl;
    server_name serenya.local;

    # Drop requests with ambiguous framing
    if ($http_transfer_encoding ~* (?!^chunked$)) {
        return 400;
    }
    
    location / {
        proxy_pass http://backend_servers;
        proxy_http_version 1.1;
    }
}
```

## Conclusion

HTTP Request Smuggling exploits the seams between infrastructure components. Securing the perimeter requires standardizing the parsing logic across the entire request pipeline and ultimately migrating to the binary framing mechanisms of HTTP/2.
