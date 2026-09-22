# TLS 1.2 vs TLS 1.3: Analyzing the 2-RTT to 1-RTT Handshake Reduction

**Problem:** In globally distributed systems, latency is dictated by the speed of light. TLS 1.2 imposes a mandatory 2 Round-Trip Time (RTT) penalty before application data can flow, heavily penalizing high-latency mobile and transcontinental connections.

### The Inefficiency of the TLS 1.2 Handshake

The TLS 1.2 handshake is a state machine requiring two full round trips to establish cryptographic parameters, authenticate the server, and derive session keys.

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

**RTT 1:** The client and server agree on a cipher suite.
**RTT 2:** The client receives the server's key parameters (e.g., ECDHE public share), generates its own, computes the premaster secret, and finalizes the handshake.

This serialization means the client cannot send encrypted data until it has received the server's public key share.

### The TLS 1.3 Breakthrough: 1-RTT Handshake

TLS 1.3 fundamentally restructures the handshake by moving away from "negotiation" to "optimistic prediction." By dramatically restricting the allowed cipher suites to a handful of highly secure AEAD algorithms and standardized Elliptic Curve groups (e.g., X25519), the client can confidently *guess* the server's preferences.

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

#### Optimistic Key Shares (`key_share` extension)
In the TLS 1.3 `ClientHello`, the client doesn't just say "I support X25519." It actively generates an ephemeral X25519 keypair and includes its public key share immediately in the initial message.

Because the server receives the client's public key share in the very first message, the server can immediately compute the shared secret, generate the session keys, and send its own public key share along with its encrypted certificate and `Finished` message. 

Once the client receives the `ServerHello`, it has everything it needs to compute the same shared secret, verify the server, and begin sending application data.

### Hello Retry Request (HRR): The Fallback

What if the client guesses wrong? If the client provides a key share for an elliptic curve the server doesn't support or prefer (e.g., client sends P-256, but server mandates P-384), the server issues a `HelloRetryRequest`.

```text
Client                                               Server
------                                               ------
ClientHello (+ P-256 share)  -------->
                             <--------   HelloRetryRequest (Requires P-384)
ClientHello (+ P-384 share)  -------->
                             <--------   ServerHello (+ P-384 share) ...
```
This fallback results in a 2-RTT handshake, matching TLS 1.2 performance. However, because modern TLS configurations overwhelmingly default to X25519, HRRs are statistically rare in practice.

### 0-RTT: Resumption with Pre-Shared Keys (PSK)

TLS 1.3 further optimizes latency for returning clients via 0-RTT. During a previous connection, the server provides a Session Ticket (a PSK). 

On subsequent connections, the client includes the PSK identity and immediately sends encrypted application data appended to the `ClientHello` (Early Data).

```c
// Concept of 1-RTT Key Derivation
hkdf_extract(salt, early_secret, &handshake_secret);
hkdf_expand_label(handshake_secret, "c hs traffic", client_hello_hash, &client_handshake_key);
hkdf_expand_label(handshake_secret, "s hs traffic", server_hello_hash, &server_handshake_key);
```

By embracing optimistic key generation and aggressively pruning legacy cipher negotiation, TLS 1.3 achieves the theoretical minimum latency for a mutually authenticated, forward-secret handshake.