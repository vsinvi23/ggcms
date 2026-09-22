# HTTP Request Smuggling: Exploiting Frontend/Backend Desync Vulnerabilities

## The Problem: Ambiguous Request Framing

In high-performance web environments, user requests pass through a tiered routing architecture. An edge proxy (such as a load balancer, reverse proxy, or Web Application Firewall) intercepts internet-facing traffic and forwards requests to internal backend microservices over persistent, pooled TCP connections (keep-alive). 

HTTP Request Smuggling (HRS) occurs when the edge proxy and the backend application server parse request boundaries differently. Because HTTP/1.1 permits multiple requests to flow over a single TCP stream sequentially, any disagreement over where one request ends and the next begins enables an attacker to inject a partial or complete "smuggled" request into the backend connection buffer. The backend then interprets this smuggled request as the prefix of the subsequent user request arriving on that shared TCP channel, resulting in credential hijacking, security rule bypass, or cache poisoning.

## Architectural Flaw: Parsing Divergence

The root cause of Request Smuggling is a fundamental ambiguity in HTTP/1.1 stream framing. The standard defines two mechanisms to specify request body length:
1.  **Content-Length (CL):** Indicates the payload size in bytes as an integer.
2.  **Transfer-Encoding (TE):** Uses `chunked` framing, where the payload is sent in hexadecimal-sized chunks ending with a terminating zero-length chunk (`0\r\n\r\n`).

If an attacker transmits a request containing *both* headers, RFC 7230 specifies that `Transfer-Encoding` must take precedence over `Content-Length`. However, some proxy and application implementations fail to prioritize correctly, or they fail to reject malformed requests with duplicate headers. When an edge proxy prioritizes one header and the backend server prioritizes the other, they fall out of sync.

```text
[ Attacker Request (CL.TE) ] ----> [ Edge Proxy (Uses CL) ]
                                            |
                                            | (Forwards entire stream)
                                            v
                                   [ Shared TCP Connection ]
                                            |
                                            v
                                  [ Backend Server (Uses TE) ]
                                            |
                                            | (Parses chunked body, stops at '0')
                                            v
                                   [ Smuggled Bytes Remain in Buffer ]
                                            |
[ Victim Request ] ------------------------>+ (Prepended with Smuggled Bytes)
                                            |
                                            v
                                   [ Backend Interprets As: ]
                                   Smuggled_Request + Victim_Request
```

## Exploit Mechanics: CL.TE and TE.CL Incompatibilities

### 1. The CL.TE Vulnerability
Here, the edge proxy uses the `Content-Length` header while the backend uses `Transfer-Encoding`.

An attacker structures a payload where the `Content-Length` includes the entire content, but a chunked terminator (`0`) is inserted early:

```http
POST / HTTP/1.1
Host: secure.serenya.io
Content-Length: 49
Transfer-Encoding: chunked

0

POST /admin/roles/grant HTTP/1.1
Foo: x
```

*   **Edge Proxy:** Sees `Content-Length: 49`, reads all 49 bytes (including the smuggled `/admin` request), and forwards it.
*   **Backend Server:** Sees `Transfer-Encoding: chunked`. It parses the body up to the `0` chunk, considers the request complete, and processes it. The remaining bytes (`POST /admin/roles/grant...`) are left unparsed in the backend socket buffer.
*   **Victim Request:** When a regular user sends a request over the same persistent connection, the backend appends the victim's request to the smuggled buffer, creating a single mutated request:

```http
POST /admin/roles/grant HTTP/1.1
Foo: xGET /profile HTTP/1.1
Host: secure.serenya.io
Cookie: session=victim_token
```

The admin API executes under the security context of the victim's session.

### 2. The TE.CL Vulnerability
Here, the edge proxy uses `Transfer-Encoding` and the backend uses `Content-Length`.

```http
POST / HTTP/1.1
Host: secure.serenya.io
Content-Length: 4
Transfer-Encoding: chunked

1a
POST /admin/roles/grant HTTP/1.1
0

```

*   **Edge Proxy:** Parses the chunked body (length `1a`, then the sub-request, then `0`), forwarding the stream.
*   **Backend Server:** Reads only 4 bytes (the `1a\r\n`), considers the request complete, and leaves the `/admin` request in the buffer for the next client.

## Hardening and Mitigation Strategies

Modern application security engineering requires dismantling the transport layer's ambiguity using a multi-layered defense.

### 1. Enforcing HTTP/2 End-to-End
HTTP/2 eliminates boundary parsing issues by utilizing a binary framing layer. Requests are split into distinct, length-prefixed frames, rendering `Content-Length` and `Transfer-Encoding` obsolete for streaming boundaries.

**Critical Architectural Constraint:** Avoid "HTTP/2 Downgrading" where HTTP/2 is terminated at the load balancer and translated to HTTP/1.1 for the backend. If downgrading is unavoidable, the edge proxy must strictly validate or strip conflicting CL and TE headers before translating.

### 2. Edge Proxy Request Normalization
Configure the front-end proxy to sanitize and normalize request headers strictly. If a request contains both CL and TE headers, the proxy should either:
*   Reject the request with `400 Bad Request`.
*   Buffer the chunked request, rewrite it to a standard stream, strip `Transfer-Encoding`, and forward it to the backend with an accurate `Content-Length` header.

**Nginx Security Directives:**
Modern Nginx configurations defend against smuggling by enabling strict header parsing.

```nginx
http {
    # Reject request headers containing invalid characters or whitespace obfuscation
    ignore_invalid_headers on;
    
    # Enforce strict parsing of URI and headers
    merge_slashes on;
    
    # Minimize connection reuse risk for highly sensitive paths (Optional)
    location /admin {
        proxy_set_header Connection "close";
    }
}
```

### 3. Disabling Backend Keep-Alive (High-Isolation Defense)
If patching the parsing discrepancies across a disparate fleet of legacy microservices is mathematically impossible, you can eliminate the shared-connection vector by disabling TCP connection pooling between the proxy and backend.

**HAProxy Configuration:**
```haproxy
backend legacy_api
    mode http
    # Closes backend TCP connection immediately after each request
    option httpclose
    server app_node_01 10.190.1.5:8080 check
```

*Note:* This mitigates smuggling entirely but introduces high latency and CPU overhead on backend systems due to constant TCP handshake and TLS session setup.

## Conclusion

HTTP Request Smuggling leverages the discrepancies in how different proxy tiers measure stream boundaries. By desynchronizing frontend and backend socket state, attackers can forge requests inside subsequent clients' execution streams. Hardening the routing architecture requires upgrading to HTTP/2 end-to-end, enforcing strict validation of conflicting content-length headers, and sanitizing incoming client streams at the edge.
