---
title: "TLS 1.2 vs TLS 1.3 Performance: The 2-RTT to 1-RTT Handshake Reduction"
description: "A side-by-side look at why the TLS 1.2 handshake costs two round trips, how TLS 1.3's optimistic key_share collapses it to one, and what happens on a Hello Retry Request."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "tls-1-2"
  - "tls-1-3"
  - "handshake-performance"
  - "key-share"
  - "hello-retry-request"
  - "0-rtt"
---

# TLS 1.2 vs TLS 1.3 Performance: The 2-RTT to 1-RTT Handshake Reduction

In globally distributed systems, latency is bounded by the speed of light, not by CPU power. TLS 1.2 imposes a mandatory 2 round-trip-time (RTT) penalty before application data can flow — a fixed tax that hits every connection regardless of server capacity, and disproportionately penalizes high-latency mobile and transcontinental connections. TLS 1.3 cuts that to a single round trip for the overwhelming majority of connections. This article looks at exactly where each round trip goes, and how TLS 1.3 gets away with removing one.

## The Inefficiency of the TLS 1.2 Handshake

TLS 1.2's handshake is a strict state machine requiring two full round trips to negotiate cryptographic parameters, authenticate the server, and derive session keys:

```text
Client                                               Server
------                                               ------
ClientHello                  -------->
                             <--------   ServerHello, Certificate,
                                         ServerKeyExchange, ServerHelloDone
ClientKeyExchange,
ChangeCipherSpec, Finished   -------->
                             <--------   ChangeCipherSpec, Finished

[ Application Data ]         <------->   [ Application Data ]
```

**RTT 1:** client and server negotiate which cipher suite to use.
**RTT 2:** the client receives the server's key exchange parameters (its ECDHE public share), generates its own, computes the pre-master secret, and finalizes the handshake.

The serialization is the problem: the client cannot compute a shared secret — and therefore cannot send anything encrypted — until it has received the server's key share in message 2 of round trip 1. Everything is strictly sequential.

## The TLS 1.3 Breakthrough: 1-RTT by Optimistic Prediction

TLS 1.3 restructures the handshake from "negotiate, then exchange keys" to "send a key share optimistically, and let the server correct you if you guessed wrong." By radically narrowing the allowed cipher suites down to a handful of AEAD algorithms and standardized elliptic curve groups (chiefly X25519), the client can confidently predict what the server will accept:

```text
Client                                               Server
------                                               ------
ClientHello
 + Key Share (e.g., X25519)  -------->
                             <--------   ServerHello
                                          + Key Share
                                         {EncryptedExtensions,
                                          Certificate, Verify, Finished}

[ Application Data ]         <------->   [ Application Data ]
```

### The `key_share` Extension

In the `ClientHello`, the client doesn't just declare "I support X25519" — it *actively generates* an ephemeral X25519 keypair and includes the public key share directly in the first message. Because the server receives this key share immediately, it can compute the shared secret, derive session keys, and respond with its own key share, encrypted certificate, and `Finished` message — all in a single reply. Once the client receives that `ServerHello`, it has everything needed to compute the same shared secret, verify the server, and start sending application data. One round trip, start to finish.

## Hello Retry Request (HRR): The Fallback Path

What happens if the client guesses wrong — for example, it offers a P-256 key share, but the server only accepts P-384? The server issues a `HelloRetryRequest`, asking the client to try again with a supported group:

```text
Client                                               Server
------                                               ------
ClientHello (+ P-256 share)  -------->
                             <--------   HelloRetryRequest (Requires P-384)
ClientHello (+ P-384 share)  -------->
                             <--------   ServerHello (+ P-384 share) ...
```

This fallback costs an extra round trip, matching TLS 1.2's 2-RTT performance exactly — TLS 1.3 never performs *worse* than TLS 1.2, it just occasionally fails to improve on it. Because virtually all modern TLS configurations default to X25519 on both client and server, HRR is statistically rare in practice; it mainly shows up when a client and server have mismatched or unusually restrictive supported-group configurations.

## 0-RTT: Resumption with Pre-Shared Keys

For a client that has connected before, TLS 1.3 offers a further optimization: **0-RTT**. During a prior connection, the server issues a Session Ticket containing a Pre-Shared Key (PSK). On the next connection, the client attaches the PSK identity plus encrypted "early data" directly to the `ClientHello`, sending application data before any round trip completes at all.

```c
// Concept of 1-RTT / resumption key derivation via HKDF
hkdf_extract(salt, early_secret, &handshake_secret);
hkdf_expand_label(handshake_secret, "c hs traffic", client_hello_hash, &client_handshake_key);
hkdf_expand_label(handshake_secret, "s hs traffic", server_hello_hash, &server_handshake_key);
```

0-RTT is the fastest possible path but comes at a real cost: early data lacks replay protection, since the server hasn't yet contributed any fresh randomness to the exchange. Production deployments restrict 0-RTT strictly to idempotent requests for this reason (see the dedicated article on TLS 1.3 0-RTT replay attacks for the full mitigation strategy).

## Performance Summary

| Scenario | Round trips before app data | Notes |
| :--- | :--- | :--- |
| TLS 1.2, full handshake | 2 RTT | Fixed cost, every connection |
| TLS 1.3, full handshake, correct group guess | 1 RTT | The common case (>99% with X25519 default) |
| TLS 1.3, Hello Retry Request | 2 RTT | Matches TLS 1.2, never worse |
| TLS 1.3, 0-RTT resumption | 0 RTT | Early data only; no replay protection |

## Key Takeaways

- TLS 1.2's 2-RTT cost comes from strict serialization: the client cannot compute a shared secret until it has received the server's key share in the second message of the first round trip.
- TLS 1.3 collapses this by having the client send an ephemeral key share optimistically inside the `ClientHello`, betting on a small, standardized set of curves (X25519 above all).
- A wrong guess triggers a Hello Retry Request, which costs one extra round trip — TLS 1.3's worst case equals TLS 1.2's best case, never worse.
- 0-RTT resumption pushes latency to zero round trips but sacrifices replay protection for the early data payload; this is a deliberate, opt-in trade-off, not a flaw in the base protocol.
