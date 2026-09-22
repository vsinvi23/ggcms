# TLS 1.3 Session Resumption: PSK and Session Tickets

## The Core Problem: Handshake Latency and CPU Overhead
Establishing a secure connection over Transport Layer Security (TLS) is not cheap. In legacy TLS 1.2, every new connection requires two full network round-trips (2-RTT) just to perform the handshake before a single byte of application data is sent. Worse, the handshake mandates expensive asymmetric cryptographic operations: validating large certificate chains (RSA/ECDSA) and performing heavy Diffie-Hellman key exchanges. 

If a client briefly disconnects and reconnects (e.g., a mobile device switching from Wi-Fi to cellular), forcing a full handshake from scratch wastes bandwidth, drains battery, and noticeably degrades application latency. The industry needed a way to securely "remember" previous connections and bypass the heavy cryptography upon reconnection. The answer in TLS 1.3 is **Pre-Shared Key (PSK) Session Resumption via Session Tickets.**

## The Mental Model: The VIP Club Stamp
Think of an exclusive nightclub. The first time you visit, you must wait in a long line, show your ID, let the bouncer verify your background, and pay an entry fee (the full TLS handshake). However, once you are inside, the bouncer gives you a cryptographic, unforgeable hand-stamp. 

If you step outside to take a phone call and return 10 minutes later, you don’t have to wait in the long line or show your ID again. You simply show your hand-stamp (the Session Ticket), and you are instantly let back in. The bouncer saves time, and you save time.

## Architecture Deep Dive: How TLS 1.3 Handles Tickets
TLS 1.3 dramatically simplified session resumption. Unlike TLS 1.2, which had two competing resumption standards (Session IDs vs. Tickets), TLS 1.3 unifies resumption entirely around **Pre-Shared Keys (PSKs)**.

When a client performs a full, successful TLS 1.3 handshake, the server generates a resumption secret. After the handshake is finished, the server securely encrypts this secret (using a local key only known to the server, called the Session Ticket Encryption Key or STEK) and sends it to the client inside a `NewSessionTicket` message.

**The Resumption Flow:**
1. **ClientHello:** The client reconnects. It includes the `pre_shared_key` extension, containing the Session Ticket the server gave it earlier. 
2. **ServerHello:** The server receives the ticket, decrypts it using its STEK, and extracts the original resumption secret. If the ticket is valid and hasn't expired, the server bypasses the certificate payload.
3. **Key Derivation:** Both parties use the resumed secret to derive fresh symmetric encryption keys.
4. **Finished:** The connection is secure after a lightning-fast 1-RTT, without touching RSA or ECDSA.

```text
Client                                               Server
|                                                         |
| [ClientHello] + {PSK Ticket}                            |
| ------------------------------------------------------> |
|                                                         |
|                                           [ServerHello] |
|                                   [EncryptedExtensions] |
|                                              [Finished] |
| <------------------------------------------------------ |
|                                                         |
| [Finished]                                              |
| [Application Data]                                      |
| ------------------------------------------------------> |
```

## The 0-RTT Magic and Replay Attacks
TLS 1.3 introduces an even more aggressive optimization: **0-RTT (Early Data)**. Using the Session Ticket, the client can derive a working encryption key *immediately* and attach HTTP Application Data directly into the very first `ClientHello` packet. 

However, 0-RTT is inherently vulnerable to **Replay Attacks**. Because the client is sending encrypted data before the server has responded with a fresh random challenge, an adversary could intercept the `ClientHello + EarlyData` packet and replay it to the server multiple times. If the early data is a banking request like `POST /transfer?amount=100`, a replay attack could execute the transfer multiple times. 
Therefore, applications must strictly enforce that 0-RTT is **only** used for idempotent requests (e.g., HTTP `GET` requests that do not alter state).

## Code Example: NGINX Configuration
Managing TLS 1.3 session tickets is primarily an infrastructure routing concern. In web servers like NGINX, tickets are encrypted using a rotating key file.

```nginx
server {
    listen 443 ssl;
    server_name api.serenya.com;

    # Enable TLS 1.3
    ssl_protocols TLSv1.3;

    # Enable Session Tickets
    ssl_session_tickets on;
    
    # Define a timeout for how long tickets remain valid
    ssl_session_timeout 1h;
    
    # Use a secure, rotating key for encrypting the tickets (STEK)
    # This file should be rotated regularly across your server fleet
    ssl_session_ticket_key /etc/nginx/ssl/ticket_key.bin;
}
```

## Nuance: Forward Secrecy and STEK Rotation
Session resumption comes with a dark side: it threatens Perfect Forward Secrecy (PFS). In a normal TLS 1.3 handshake, Ephemeral Diffie-Hellman ensures that if the server's private key is compromised, past traffic cannot be decrypted. 

However, if an attacker compromises the server's Session Ticket Encryption Key (STEK), they can decrypt intercepted session tickets, recover the resumption secrets, and decrypt past resumed sessions. To mitigate this, distributed architectures (like a fleet of load balancers) must securely synchronize and rapidly rotate the STEK—typically every 12 to 24 hours.

## Conclusion
TLS 1.3 Session Resumption via PSK transforms a heavy, cryptographic burden into a lightweight, instant connection re-establishment. By leveraging encrypted tickets, servers can remain completely stateless while clients enjoy 1-RTT or even 0-RTT performance. However, architects must heavily prioritize STEK rotation and restrict early data to idempotent operations to avoid catastrophic replay vulnerabilities.
