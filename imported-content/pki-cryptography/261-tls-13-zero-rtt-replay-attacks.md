# TLS 1.3 0-RTT: The Dangers of Early Data Replay Attacks and Non-Idempotent APIs

TLS 1.3 brought sweeping improvements to internet cryptography, drastically reducing latency by streamlining the handshake process. For returning clients, TLS 1.3 introduced Zero Round Trip Time (0-RTT) resumption, allowing clients to send encrypted application data in their very first flight of packets. While 0-RTT provides significant performance gains, especially for high-latency mobile networks, it introduces a severe cryptographic caveat: early data is inherently vulnerable to replay attacks.

## The Problem: The Lack of Forward Secrecy in Early Data

In a standard TLS 1.3 handshake (1-RTT), the client and server exchange random nonces and ephemeral Diffie-Hellman keys to establish a fresh, unique session key. This ensures Forward Secrecy (FS) and guarantees that the session cannot be replayed.

In 0-RTT, the client encrypts the "Early Data" using a Pre-Shared Key (PSK) derived from a previous, completed session. Because the client sends this data alongside its `ClientHello`—before the server has provided a fresh nonce or DH share—the encryption lacks input from the server's current state. 

An attacker observing the network can capture the `ClientHello` and the encrypted early data. Even without knowing the decryption key, the attacker can re-transmit (replay) those exact packets to the server. The server, holding the matching PSK from the previous session, will successfully decrypt and process the replayed data.

## Mental Model: The Mailed Check

Imagine writing a signed check for $100 and mailing it to a vendor to pay a bill. You seal it in an envelope (encryption). A thief intercepts the mail truck, makes photocopies of your sealed envelope, and mails the copies to the vendor repeatedly. The vendor opens every envelope, sees your valid signature, and cashes the $100 check 10 times. Because the check lacked a unique, vendor-provided sequence number for that specific interaction, the action was replayed.

## Visualizing the 0-RTT Replay Attack

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
In this scenario, the user accidentally purchases the laptop twice because the POST request was replayed by the attacker.

## Idempotency is the Ultimate Defense

Because the cryptographic layer cannot entirely prevent 0-RTT replays without complex and stateful anti-replay caches, the defense must shift to the application layer. The golden rule of 0-RTT is: **Never send non-idempotent requests as Early Data.**

An HTTP request is idempotent if executing it once has the same effect as executing it multiple times.
*   **Idempotent:** `GET /user/profile`, `PUT /user/settings` (overwriting the exact same data).
*   **Non-Idempotent:** `POST /transfer/funds`, `POST /checkout`, `DELETE /user/account`.

If an attacker replays a `GET` request, the server simply sends the same data back multiple times. The attacker gains nothing, and the application state remains intact. If they replay a `POST` to transfer funds, the consequences are catastrophic.

## Infrastructure Mitigation: Nginx and Anti-Replay

Modern web servers and reverse proxies provide mechanisms to handle 0-RTT safely. Nginx allows you to enable `ssl_early_data`, but it explicitly flags early data to the upstream application via headers.

```nginx
server {
    listen 443 ssl;
    ssl_protocols TLSv1.3;
    ssl_early_data on; # Enable 0-RTT

    location / {
        # Pass early data status to the application
        proxy_set_header Early-Data $ssl_early_data;
        proxy_pass http://backend;
    }
}
```

The `$ssl_early_data` variable evaluates to `1` if the request was sent as early data, and is empty otherwise.

### The Application Layer Check

The backend application must rigorously enforce idempotency based on this header. Here is a Python/Flask example of blocking non-idempotent early data:

```python
from flask import Flask, request, abort

app = Flask(__name__)

@app.before_request
def reject_unsafe_early_data():
    is_early_data = request.headers.get('Early-Data') == '1'
    
    # HTTP spec dictates GET, HEAD, OPTIONS, TRACE, PUT, DELETE should be idempotent.
    # However, many APIs poorly implement DELETE/PUT. Be extremely strict.
    safe_methods = ['GET', 'HEAD', 'OPTIONS']
    
    if is_early_data and request.method not in safe_methods:
        # 425 Too Early instructs the client to retry the request 
        # after the TLS handshake completes (1-RTT)
        abort(425, description="Non-idempotent request rejected in 0-RTT")
```

Returning HTTP status code `425 (Too Early)` is critical. It informs the browser or client library to hold the request and automatically retry it once the full TLS 1-RTT handshake is securely established, preserving forward secrecy.

## Balancing Speed and Security

TLS 1.3 0-RTT is a powerful tool for accelerating web performance, but it breaks the abstraction that the transport layer handles all security guarantees. By tightly coupling infrastructure configuration with application-layer idempotency checks, engineers can safely harness 0-RTT without opening the door to devastating replay attacks.
