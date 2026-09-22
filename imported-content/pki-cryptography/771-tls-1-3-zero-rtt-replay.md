# TLS 1.3 0-RTT: The Dangers of Early Data Replay Attacks and Non-Idempotent APIs

## The Problem: The Latency vs. Security Trade-off

In TLS 1.2, establishing a secure connection requires two full round trips (2-RTT) before any application data can be sent. For geographically distant clients, this handshake latency is highly noticeable. 

TLS 1.3 drastically improved this by introducing a 1-RTT handshake by default. However, for clients that have previously connected to a server, TLS 1.3 introduced an optional feature called **0-RTT (Zero Round Trip Time) Resumption** or "Early Data." 0-RTT allows a client to send encrypted application data in its very first flight, effectively eliminating handshake latency.

The fatal flaw of 0-RTT is that it lacks forward secrecy for the early data, and more importantly, it offers **no inherent defense against replay attacks**. If an attacker intercepts a 0-RTT packet (e.g., a `POST /transfer_funds` request), they can simply resend that exact packet to the server multiple times. Because the server has not yet established fresh random nonces to guarantee uniqueness, it will decrypt and process every replayed packet.

## Technical Architecture: How 0-RTT Works

When a client first connects to a server (1-RTT), the server can issue a Pre-Shared Key (PSK) or Session Ticket. When the client reconnects, it uses this PSK to derive the encryption keys immediately and attaches the "Early Data" to the `ClientHello`.

```text
    Client                                               Server
    ------                                               ------
    [1-RTT Initial Connection]
    ClientHello                -------->
                                                    ServerHello
                               <--------               Finished
    (Application Data)         <------->     (Application Data)
    ... Server sends NewSessionTicket (PSK) ...

    [0-RTT Resumption]
    ClientHello + PSK
    (Early Data: POST /buy)    -------->
                                                    ServerHello
                               <--------               Finished
                                             (Processes /buy) !
                                             (Replay possible) !
```

Because the attacker isn't modifying the ciphertext (which they can't, due to authenticated encryption), but merely replaying it, the server's TLS stack considers the cryptogram perfectly valid.

## Defending Against Replay Attacks

The TLS 1.3 specification explicitly states that 0-RTT must only be used for **idempotent** requests. An idempotent operation produces the same result no matter how many times it is executed (e.g., `GET /user/profile`). Non-idempotent operations (e.g., `POST`, `PUT`, `DELETE`) change state and must never be processed via 0-RTT.

Mitigation strategies fall into three layers:
1. **Network/TLS Layer**: Single-use tickets or strike registers (recording seen ClientHello randoms). These are computationally expensive and hard to scale across distributed load balancers.
2. **Proxy/Reverse Proxy Layer**: Configuring the proxy (e.g., Nginx, HAProxy) to reject early data for state-changing HTTP methods.
3. **Application Layer**: Inspecting specific HTTP headers injected by the proxy to determine if the request arrived via early data.

### Implementation: Nginx Proxy Configuration

Nginx supports TLS 1.3 0-RTT via the `ssl_early_data on;` directive. When enabled, Nginx will set the `$ssl_early_data` variable. If a request is replayed or arrives as early data, you must ensure it is safe.

A robust Nginx configuration forwards this state to the application layer via an HTTP header:

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_protocols TLSv1.3;
    ssl_early_data on; # Enable 0-RTT

    location / {
        # Pass the Early-Data status to the backend
        proxy_set_header Early-Data $ssl_early_data;
        
        # Alternatively, strictly reject POST/PUT/DELETE in 0-RTT at the proxy
        if ($ssl_early_data = "1") {
            set $is_unsafe_method 0;
            if ($request_method = POST) { set $is_unsafe_method 1; }
            if ($request_method = PUT) { set $is_unsafe_method 1; }
            if ($request_method = DELETE) { set $is_unsafe_method 1; }
            
            # Return 425 Too Early - prompts client to retry with 1-RTT
            if ($is_unsafe_method) {
                return 425; 
            }
        }

        proxy_pass http://backend;
    }
}
```

### Implementation: Application Layer Verification (Node.js/Express)

If the proxy forwards the `Early-Data` header, the application must enforce idempotency. If an unsafe request is detected as early data, the standard response is HTTP Status `425 Too Early`. Modern browsers and TLS clients will automatically intercept the `425` and retry the request over a fully established 1-RTT connection.

```javascript
const express = require('express');
const app = express();

// Middleware to protect against 0-RTT Replay
app.use((req, res, next) => {
    const isEarlyData = req.headers['early-data'] === '1';
    
    // Define non-idempotent HTTP methods
    const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    if (isEarlyData && unsafeMethods.includes(req.method)) {
        console.warn(`[SECURITY] Blocked 0-RTT replay attempt on ${req.method} ${req.path}`);
        // 425 Too Early instructs the client to retry after full TLS handshake
        return res.status(425).send('Too Early: Replay protection triggered.');
    }
    
    next();
});

app.post('/transfer_funds', (req, res) => {
    // This endpoint is now safe from 0-RTT replay attacks
    res.send('Funds transferred successfully.');
});

app.listen(3000, () => console.log('API running with 0-RTT protection.'));
```

## Summary

Enabling TLS 1.3 0-RTT provides significant performance benefits, particularly for mobile networks. However, it shifts the responsibility of replay protection from the TLS stack to the application architecture. Developers must strictly enforce that early data is only permitted for idempotent HTTP methods, utilizing the HTTP `425 Too Early` status code to gracefully manage state-changing requests.
