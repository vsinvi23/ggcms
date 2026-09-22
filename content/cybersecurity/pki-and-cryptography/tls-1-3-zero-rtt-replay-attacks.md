---
title: "TLS 1.3 0-RTT Replay Attacks: Defending Non-Idempotent APIs"
description: "Why TLS 1.3 0-RTT early data has no replay protection, how an attacker exploits it against non-idempotent endpoints, and how to defend with Nginx early-data detection plus 425 Too Early at the application layer."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "tls-1-3"
  - "0-rtt"
  - "replay-attack"
  - "idempotency"
  - "425-too-early"
  - "session-tickets"
---

# TLS 1.3 0-RTT Replay Attacks: Defending Non-Idempotent APIs

In TLS 1.2, establishing a secure connection requires two full round trips before any application data can be sent. TLS 1.3 cut that to one round trip by default, and for returning clients it offers an even more aggressive optimization: **0-RTT (Zero Round Trip Time) Resumption**, also called Early Data. A client that has previously connected can send encrypted application data in its very first flight of packets — before the server has replied at all.

The fatal trade-off: 0-RTT early data has no forward-secrecy input from the server and, more importantly, **no inherent replay protection**. If an attacker intercepts a 0-RTT packet — say, a `POST /transfer_funds` request — they can simply resend the exact same packet to the server as many times as they like, and the server will decrypt and process every single copy.

## How 0-RTT Works

On a client's first connection (a normal 1-RTT handshake), the server can issue a Pre-Shared Key (PSK) wrapped in a Session Ticket. On a later reconnection, the client uses that PSK to derive encryption keys immediately and attaches "Early Data" straight onto the `ClientHello`:

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

## The Replay Attack in Detail

Because the attacker isn't modifying the ciphertext — which authenticated encryption prevents them from doing undetected — but merely *replaying* it verbatim, the server's TLS stack considers the cryptogram perfectly valid every single time:

```text
[Client]                                 [Attacker]                               [Server]
   | --- ClientHello + 0-RTT Data ---------> |                                       |
   | (e.g., POST /buy?item=laptop)           | --- ClientHello + 0-RTT Data -------> |
   |                                         |                                       |
   |                                         | <--- ServerHello + Finished --------- |
   |                                         |                                       |
   |                                         | --- (Replay) ClientHello + Data ----> |
   |                                         |                                       |
   |                                         | <--- ServerHello + Finished --------- |
```

The victim ends up purchasing the laptop twice — or a hundred times — because the underlying `POST` request was replayed at the network layer, entirely below the application's awareness.

## The Only Real Defense: Idempotency

The TLS 1.3 specification (RFC 8446) is explicit: 0-RTT must only be used for **idempotent** requests — operations that produce the same result no matter how many times they execute.

- **Idempotent:** `GET /user/profile`, `PUT /user/settings` (overwriting with the same value repeatedly is harmless).
- **Non-idempotent:** `POST /transfer/funds`, `POST /checkout`, `DELETE /user/account`.

If an attacker replays a `GET`, the server just returns the same data again — no harm done. If they replay a `POST /transfer/funds`, the consequences are financial and irreversible.

Defenses fall into three layers:

1. **Network/TLS layer** — single-use session tickets or strike registers that record seen `ClientHello` randoms. Effective but computationally expensive and hard to scale across a fleet of load balancers that don't share state.
2. **Proxy/reverse-proxy layer** — configure the TLS terminator (Nginx, HAProxy, Envoy) to flag or reject early data for state-changing HTTP methods.
3. **Application layer** — inspect a header the proxy injects to determine whether the current request arrived as early data, and reject unsafe methods explicitly.

## Implementation: Nginx Early-Data Detection

Nginx supports 0-RTT via `ssl_early_data on;`, exposing an `$ssl_early_data` variable that is `"1"` when the current request was decrypted from early data and empty otherwise.

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_protocols TLSv1.3;
    ssl_early_data on;  # Enable 0-RTT

    location / {
        # Forward the early-data status to the backend for enforcement
        proxy_set_header Early-Data $ssl_early_data;

        # Optionally, reject unsafe methods directly at the proxy
        if ($ssl_early_data = "1") {
            set $is_unsafe_method 0;
            if ($request_method = POST)   { set $is_unsafe_method 1; }
            if ($request_method = PUT)    { set $is_unsafe_method 1; }
            if ($request_method = DELETE) { set $is_unsafe_method 1; }

            # 425 Too Early asks the client to retry over a full 1-RTT connection
            if ($is_unsafe_method) {
                return 425;
            }
        }

        proxy_pass http://backend;
    }
}
```

## Implementation: Application-Layer Enforcement

Even with proxy-level filtering, defense in depth means the application should never trust that the proxy caught everything. Here it is in Node.js/Express:

```javascript
const express = require('express');
const app = express();

// Middleware to reject non-idempotent 0-RTT requests
app.use((req, res, next) => {
    const isEarlyData = req.headers['early-data'] === '1';
    const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    if (isEarlyData && unsafeMethods.includes(req.method)) {
        console.warn(`[SECURITY] Blocked 0-RTT replay attempt: ${req.method} ${req.path}`);
        // 425 Too Early tells the client to retry once the full handshake completes
        return res.status(425).send('Too Early: replay protection triggered.');
    }

    next();
});

app.post('/transfer_funds', (req, res) => {
    // Now safe — this handler is unreachable via 0-RTT early data
    res.send('Funds transferred successfully.');
});

app.listen(3000, () => console.log('API running with 0-RTT replay protection.'));
```

And the same defense in Python/Flask, deliberately restricting "safe" to a smaller set than the strict HTTP spec, because in practice many APIs implement `PUT`/`DELETE` non-idempotently despite what the spec says they should do:

```python
from flask import Flask, request, abort

app = Flask(__name__)

@app.before_request
def reject_unsafe_early_data():
    is_early_data = request.headers.get('Early-Data') == '1'

    # Be conservative: only GET/HEAD/OPTIONS are trusted to be side-effect free
    safe_methods = ['GET', 'HEAD', 'OPTIONS']

    if is_early_data and request.method not in safe_methods:
        # 425 Too Early instructs the client to retry after the full
        # 1-RTT handshake completes, restoring forward secrecy for this request.
        abort(425, description="Non-idempotent request rejected in 0-RTT")
```

Returning `425 Too Early` is the critical piece: modern browsers and TLS client libraries recognize this status code and automatically retry the request transparently over a fully-established 1-RTT connection, so the user experience degrades gracefully rather than failing outright.

## Key Takeaways

- 0-RTT early data is encrypted with a PSK from a prior session, but lacks any fresh, server-contributed randomness — so a captured packet can be replayed verbatim and will decrypt successfully every time.
- The cryptographic layer cannot fix this without expensive stateful anti-replay caches shared across every server in a fleet; the practical fix is architectural, not cryptographic.
- Restrict 0-RTT strictly to idempotent HTTP methods (`GET`/`HEAD`/`OPTIONS`), enforced at both the TLS-terminating proxy and the application layer.
- Use HTTP `425 Too Early` to signal clients to retry over the full handshake — this is standardized behavior, not a custom workaround.
