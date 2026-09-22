---
title: "TLS 1.3 Handshake Internals: Key Schedule and HKDF Derivation"
description: "A byte-level walkthrough of the TLS 1.3 1-RTT handshake, the HKDF-based key schedule that derives every traffic secret, and the 0-RTT replay risk it introduces."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "tls-1-3"
  - "hkdf"
  - "key-schedule"
  - "ecdhe"
  - "handshake"
  - "0-rtt"
---

# TLS 1.3 Handshake Internals: Key Schedule and HKDF Derivation

Before TLS 1.3 was ratified as RFC 8446 in August 2018, secure internet communication relied on TLS 1.2 (RFC 5246). TLS 1.2 was a major improvement over SSL, but it carried two architectural flaws that modern systems could no longer tolerate: a mandatory 2 additional round-trip handshake tax on top of the TCP handshake, and a bloated menu of legacy cipher suites (static RSA key exchange, RC4, CBC-mode ciphers vulnerable to padding oracles) that were routinely abused in downgrade attacks.

TLS 1.3 fixes both problems at once: it collapses the handshake to a single round trip and it prunes the cipher suite space down to a handful of AEAD constructions with mandatory forward secrecy. This article works through exactly how that 1-RTT handshake is constructed, the cryptographic key schedule that powers it, and the one feature (0-RTT early data) that reintroduces a real security trade-off.

## The Problem: 2-RTT Was a Latency and Attack-Surface Tax

Under TLS 1.2, establishing an encrypted session required two full round trips before any application data could be sent, stacked on top of the TCP handshake itself:

```
Client                                      Server
  |                                           |
  |------------ 1. TCP SYN ------------------>|  ---\
  |<----------- 2. TCP SYN-ACK ---------------|     +-- TCP Handshake (1 RTT)
  |------------ 3. TCP ACK ------------------>|  ---/
  |                                           |
  |------------ 4. ClientHello -------------->|  ---\
  |<----------- 5. ServerHello ---------------|     |
  |             6. Certificate                |     +-- TLS 1.2 Round 1 (1 RTT)
  |             7. ServerKeyExchange          |     |
  |             8. ServerHelloDone            |  ---/
  |                                           |
  |------------ 9. ClientKeyExchange -------->|  ---\
  |            10. [ChangeCipherSpec]         |     |
  |            11. Finished                   |     +-- TLS 1.2 Round 2 (1 RTT)
  |<---------- 12. [ChangeCipherSpec] --------|     |
  |            13. Finished                   |  ---/
  |                                           |
  |============ 14. Application Data ========>|  (First real request)
```

For mobile networks, high-latency cloud paths, or globally distributed microservices, that handshake tax was a measurable performance bottleneck. Worse, TLS 1.2's permissive negotiation model let downgrade attacks (Logjam, FREAK) force clients onto weak cipher suites in the first place.

## Why It's Hard: You Can't Just Delete a Round Trip

Cutting the handshake to 1-RTT sounds simple — "send the key material in the first message" — but it raises real cryptographic questions:

* How can the client send key material before knowing which cipher suite the server actually supports? Guessing wrong should not cost *more* latency than the old handshake.
* How do you protect handshake messages (certificate, verification data) from eavesdropping if more of the negotiation has to happen before a shared key exists?
* How do you preserve forward secrecy so a future compromise of the server's long-term key can never expose past sessions?

TLS 1.3's answer: shrink the supported curve/cipher space down so far that the client can *predict* the server's choice correctly almost every time, and send an ephemeral key share optimistically in the very first message.

## The 1-RTT Handshake, Message by Message

```
Client                                                          Server
  |                                                                |
  | Generate ephemeral keypair (priv_C, pub_C)                    |
  |--- ClientHello (ciphers, groups, key_share=pub_C) ----------->|
  |                                                                | Select cipher & group
  |                                                                | Generate ephemeral (priv_S, pub_S)
  |                                                                | shared_secret = ECDHE(priv_S, pub_C)
  |                                                                | Derive Handshake Secret via HKDF
  |<--- ServerHello (selected cipher/group, key_share=pub_S) -----|
  |                       [ Everything below is ENCRYPTED ]       |
  |<--- EncryptedExtensions (ALPN, SNI ack) -----------------------|
  |<--- Certificate (X.509 chain) ---------------------------------|
  |<--- CertificateVerify (signature over full transcript) --------|
  |<--- Finished (HMAC over transcript) ----------------------------|
  | shared_secret = ECDHE(priv_C, pub_S)                          |
  | Derive Handshake Secret via HKDF                              |
  | Verify certificate, signature, and Finished                   |
  |--- Finished (HMAC over transcript) --------------------------->|
  |            Derive Application Traffic Secrets                 |
  |<==============  Application Data (bidirectional)  ============>|
```

Walking through the message types:

**ClientHello.** Backward-compatible on the wire (legacy version field `0x0303`, dummy session ID) so middleboxes don't drop it, but the real negotiation happens in extensions: `supported_versions` (declares TLS 1.3, `0x0304`), `supported_groups` (the curves it supports, e.g. `x25519`, `secp256r1`), and — the key innovation — `key_share`, which contains an actual ephemeral public key the client generated *speculatively*, before it knows if the server wants it.

**ServerHello.** The server picks a mutually supported cipher/group and echoes back its own ephemeral public key share. Both sides can now independently compute:

$$\text{shared\_secret} = \text{ECDHE}(\text{private\_key}, \text{peer\_public\_key})$$

Every message the server sends *after* this point — `EncryptedExtensions`, `Certificate`, `CertificateVerify`, `Finished` — is already encrypted with keys derived from that shared secret. TLS 1.2 sent the certificate in the clear; TLS 1.3 does not.

**CertificateVerify.** Rather than signing a random nonce (replayable to a different peer), the server signs a hash of the *entire handshake transcript so far*. That binds the signature to this one specific connection instance — an attacker cannot forward it to trick a different client.

**Finished.** An HMAC over the transcript on each side, proving both parties agree on every negotiated parameter with no tampering in between.

## The Cryptographic Engine: HKDF and the Secret Derivation Tree

TLS 1.3 does not derive keys with ad-hoc hashing. Every secret in the protocol comes out of **HKDF** (HMAC-based Extract-and-Expand Key Derivation Function, RFC 5869), used in two phases:

**Extract** — condense a (possibly low-entropy) input into a fixed-length pseudorandom key:

$$\text{PRK} = \text{HMAC-Hash}(\text{salt}, \text{InputKeyMaterial})$$

**Expand** — stretch that PRK into as much high-entropy output key material as needed:

$$\text{T}(1) = \text{HMAC-Hash}(\text{PRK}, \text{info} \mathbin\Vert \text{0x01}), \quad \text{T}(2) = \text{HMAC-Hash}(\text{PRK}, \text{T}(1) \mathbin\Vert \text{info} \mathbin\Vert \text{0x02}), \ \dots$$

The TLS 1.3 key schedule chains three Extract steps, each feeding the next stage of the connection:

```
                       PSK (or all-zero if no resumption)
                              |
                       [ HKDF-Extract ]  <- salt = 0
                              |
                              v
                         Early Secret ---> Client Early Traffic Secret (0-RTT)
                              |
                              v  (used as salt for the next Extract)
                       [ HKDF-Extract ]  <- IKM = ECDHE shared secret
                              |
                              v
                       Handshake Secret ---> Client Handshake Traffic Secret
                              |                Server Handshake Traffic Secret
                              v  (used as salt, IKM = 0)
                       [ HKDF-Extract ]
                              |
                              v
                        Master Secret ---> Client Application Traffic Secret
                                            Server Application Traffic Secret
                                            Resumption Master Secret
```

1. **Early Secret** is seeded from a PSK if resuming a prior session, or from a string of zeros on a cold handshake.
2. **Handshake Secret** takes the Early Secret as salt and the fresh ECDHE shared secret as input — this is the point where the connection actually becomes forward-secret, since the ECDHE keys are ephemeral and destroyed after use.
3. **Master Secret** is derived once the handshake completes and produces the actual application traffic keys plus a resumption secret for future 0-RTT connections.

## Wire Format: Why Every TLS 1.3 Record Looks the Same

```c
#include <stdint.h>

typedef enum {
    INVALID            = 0,
    CHANGE_CIPHER_SPEC = 20,
    ALERT              = 21,
    HANDSHAKE          = 22,
    APPLICATION_DATA   = 23,
    HEARTBEAT          = 24
} ContentType;

// Encrypted TLS 1.3 record on the wire
typedef struct {
    uint8_t  type;             // ALWAYS 23 (APPLICATION_DATA) once encrypted
    uint16_t legacy_version;   // Always 0x0303
    uint16_t length;           // Encrypted payload + auth tag + padding
    uint8_t  encrypted_record[16384 + 256];
} TLSCiphertext;
```

The real content type (handshake message vs. alert vs. application data) is appended to the plaintext *before* encryption and only recovered after decryption. A passive observer sees nothing but a stream of `APPLICATION_DATA` records — they cannot even tell where the handshake ends and real traffic begins.

## Code: Ephemeral X25519 Key Exchange in C (OpenSSL 3.x)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/evp.h>
#include <openssl/err.h>

void print_hex(const char *label, const unsigned char *buf, size_t len) {
    printf("%s: ", label);
    for (size_t i = 0; i < len; i++) printf("%02X", buf[i]);
    printf("\n");
}

EVP_PKEY *generate_x25519_key(void) {
    EVP_PKEY_CTX *pctx = EVP_PKEY_CTX_new_id(EVP_PKEY_X25519, NULL);
    if (!pctx) return NULL;
    EVP_PKEY *key = NULL;
    if (EVP_PKEY_keygen_init(pctx) <= 0 || EVP_PKEY_keygen(pctx, &key) <= 0) {
        EVP_PKEY_CTX_free(pctx);
        return NULL;
    }
    EVP_PKEY_CTX_free(pctx);
    return key;
}

unsigned char *compute_shared_secret(EVP_PKEY *my_priv, EVP_PKEY *peer_pub, size_t *out_len) {
    EVP_PKEY_CTX *ctx = EVP_PKEY_CTX_new(my_priv, NULL);
    if (!ctx) return NULL;
    if (EVP_PKEY_derive_init(ctx) <= 0 || EVP_PKEY_derive_set_peer(ctx, peer_pub) <= 0) {
        EVP_PKEY_CTX_free(ctx);
        return NULL;
    }
    if (EVP_PKEY_derive(ctx, NULL, out_len) <= 0) {
        EVP_PKEY_CTX_free(ctx);
        return NULL;
    }
    unsigned char *secret = malloc(*out_len);
    if (!secret || EVP_PKEY_derive(ctx, secret, out_len) <= 0) {
        free(secret);
        EVP_PKEY_CTX_free(ctx);
        return NULL;
    }
    EVP_PKEY_CTX_free(ctx);
    return secret;
}

int main(void) {
    EVP_PKEY *client_key = generate_x25519_key();
    EVP_PKEY *server_key = generate_x25519_key();
    if (!client_key || !server_key) { fprintf(stderr, "keygen failed\n"); return 1; }

    size_t client_pub_len = 0, server_pub_len = 0;
    EVP_PKEY_get_octet_string_param(client_key, "pub", NULL, 0, &client_pub_len);
    EVP_PKEY_get_octet_string_param(server_key, "pub", NULL, 0, &server_pub_len);
    unsigned char *client_pub = malloc(client_pub_len);
    unsigned char *server_pub = malloc(server_pub_len);
    EVP_PKEY_get_octet_string_param(client_key, "pub", client_pub, client_pub_len, &client_pub_len);
    EVP_PKEY_get_octet_string_param(server_key, "pub", server_pub, server_pub_len, &server_pub_len);

    print_hex("Client key_share (sent in ClientHello)", client_pub, client_pub_len);
    print_hex("Server key_share (sent in ServerHello)", server_pub, server_pub_len);

    size_t client_secret_len = 0, server_secret_len = 0;
    unsigned char *client_secret = compute_shared_secret(client_key, server_key, &client_secret_len);
    unsigned char *server_secret = compute_shared_secret(server_key, client_key, &server_secret_len);

    if (client_secret_len == server_secret_len &&
        memcmp(client_secret, server_secret, client_secret_len) == 0) {
        printf("[OK] Client and server derived an identical shared secret.\n");
    } else {
        printf("[FAIL] Shared secrets do not match.\n");
    }

    free(client_pub); free(server_pub);
    free(client_secret); free(server_secret);
    EVP_PKEY_free(client_key); EVP_PKEY_free(server_key);
    return 0;
}
```

```bash
gcc -o ecdh_simulation ecdh_simulation.c -lcrypto
./ecdh_simulation
```

## Security Trade-off: 0-RTT Early Data Has No Replay Protection

TLS 1.3 lets a *returning* client (one holding a PSK from a previous session) skip the round trip entirely and attach encrypted application data directly to its `ClientHello`:

```
Client                                      Server
  |                                           |
  |-- ClientHello + EarlyData(POST /buy) ---->|  (sent instantly, zero RTT)
  |                                           |
```

Because this data is encrypted before the server has contributed any fresh randomness to the connection, an attacker who records the packet can simply replay it — the server has no way to distinguish the replay from the original:

```
Attacker                                    Server
  |                                           |
  |--- Replayed ClientHello + EarlyData ----->|  (processed again!)
  |--- Replayed ClientHello + EarlyData ----->|  (processed a third time!)
```

If the early data is a non-idempotent request (`POST /transfer-funds`), the server executes it multiple times. The mitigation is architectural, not cryptographic: reject 0-RTT for any state-changing method at the TLS terminator or API gateway, and treat single-use session tickets as mandatory so a ticket can't be replayed across a rotation window.

## Common Misconceptions

**"TLS 1.3 is less secure because it allows 0-RTT."** 0-RTT is optional and must be explicitly enabled on both ends. The mandatory 1-RTT handshake path is fully forward-secret regardless.

**"ECDHE is doomed by quantum computers, so TLS 1.3 is already obsolete."** X25519 alone is vulnerable to a sufficiently large quantum computer running Shor's algorithm, but TLS 1.3's extension mechanism already supports hybrid post-quantum key exchange (e.g., ML-KEM combined with X25519) without changing the base protocol.

## Key Takeaways

* TLS 1.3 collapses the handshake to 1-RTT by having the client send an ephemeral `key_share` optimistically in the `ClientHello`, betting correctly on the server's preferred curve almost every time.
* Every secret in the connection — early, handshake, and application traffic keys — comes from one HKDF-based derivation tree, not ad-hoc hashing.
* Static RSA key exchange is banned; only ephemeral ECDHE is permitted, making forward secrecy mandatory rather than optional.
* 0-RTT early data trades latency for replay risk — restrict it to idempotent requests and treat this as an application-layer control, not a TLS-layer one.
