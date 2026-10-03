---
title: "Encrypted Client Hello (ECH): Closing the TLS SNI Privacy Leak"
description: "Why the Server Name Indication field leaks the destination domain in plaintext even under TLS 1.3, and how Encrypted Client Hello uses HPKE and DNS HTTPS records to hide it."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "encrypted-client-hello"
  - "sni"
  - "hpke"
  - "tls-1-3"
  - "dns-privacy"
---

# Encrypted Client Hello (ECH): Closing the TLS SNI Privacy Leak

TLS 1.3 encrypts the server's certificate, the certificate verification signature, and nearly the entire rest of the handshake. Yet for years one glaring exception remained in plaintext: the **Server Name Indication (SNI)** field, sent inside the very first `ClientHello` packet — before any encryption keys exist to protect it.

## The Problem: SNI Has to Be Sent Before Encryption Is Possible

Modern web infrastructure routes traffic through reverse proxies and CDNs that host thousands or millions of distinct domains behind a single IP address. When a client connects, the server genuinely doesn't know which certificate to present until the client tells it which domain it wants — that's exactly what the SNI extension is for.

The client includes the target hostname (e.g., `secure.bank.com`) in the SNI field of the plaintext `ClientHello`. Because this happens *before* any key exchange has occurred, there is no way to encrypt it using ordinary TLS mechanics — the keys needed to encrypt it don't exist yet at the point it needs to be sent. Any passive observer sitting on the network path — an ISP, a corporate network monitor, or a national censorship firewall — can read the exact domain being visited, even though every byte that follows is fully encrypted.

## The Solution: Encrypted Client Hello (ECH)

Encrypted Client Hello (ECH, formerly Encrypted SNI / ESNI) solves this by encrypting the sensitive parts of the `ClientHello` and wrapping them inside a generic, unencrypted "outer" `ClientHello`. The outer hello points to the CDN's shared front-end domain; the inner, encrypted hello contains the real destination.

## Mental Model: An Envelope Within an Envelope

Think of ECH as double-enveloped mail. The **outer envelope** (unencrypted) is addressed to the mailroom of a large office building — the CDN's shared front door. Anyone inspecting the mail from outside can only see it's headed to that building. The **inner envelope** (encrypted) is addressed to one specific employee inside — the true destination domain. The mailroom opens the outer envelope, decrypts the inner one with its private key, and routes the message internally.

## How ECH Works

### Step 1 — Publishing the ECH Config via DNS

The server operator publishes an `ECHConfigList` in a DNS `HTTPS` resource record, containing the provider's public HPKE (Hybrid Public Key Encryption) key:

```text
$ dig HTTPS secret-site.com
secret-site.com.  300  IN  HTTPS  1 . alpn="h2,http/1.1" ech="<base64_encoded_ECHConfigList>"
```

### Step 2 — Building the Encrypted Inner Hello

The client resolves this DNS record, retrieves the `ECHConfigList`, and uses HPKE to encrypt the inner `ClientHello` — the one carrying the real SNI:

```text
ClientHello (Outer)
  SNI: cloudflare-ech.com          <- the shared, client-facing provider domain
  Extension: ech
    [ Encrypted Inner ClientHello ]
      -> SNI: secret-site.com      <- the true destination, only visible after decryption
      -> Real ALPN, cipher suites, etc.
```

### Step 3 — Server-Side Decryption and Routing

1. The CDN's edge server receives the outer `ClientHello`.
2. It notices the `ech` extension and uses its private HPKE key to decrypt the inner `ClientHello`.
3. On success, it swaps the outer parameters for the decrypted inner ones.
4. The TLS 1.3 handshake continues as normal, now correctly mapped to `secret-site.com`.

If decryption fails — for instance, because the client's cached `ECHConfigList` used stale, rotated keys — the server falls back to serving the outer `ClientHello`'s parameters and returns an `ECH Required` response, handing the client a fresh `ECHConfigList` to retry with.

## The Cryptographic Engine: HPKE

ECH relies on **HPKE** (Hybrid Public Key Encryption, RFC 9180), which combines a Key Encapsulation Mechanism (KEM) with an AEAD cipher:

```python
# Conceptual representation of HPKE as used by ECH
def construct_ech_payload(server_public_key, inner_hello_bytes):
    # 1. Generate an ephemeral Diffie-Hellman keypair for this connection
    ephemeral_priv, ephemeral_pub = generate_dh_keypair()

    # 2. Compute a Diffie-Hellman shared secret with the server's public key
    shared_secret = dh_compute(ephemeral_priv, server_public_key)

    # 3. Derive an AEAD key and nonce from the shared secret via HKDF
    aead_key, aead_nonce = hkdf_derive(shared_secret, "ech-context")

    # 4. Encrypt the inner ClientHello under that AEAD key
    encrypted_inner = aead_encrypt(aead_key, aead_nonce, inner_hello_bytes)

    return ephemeral_pub, encrypted_inner
```

Because the ephemeral keypair is fresh per connection, ECH inherits the same forward-secrecy property as the rest of the TLS 1.3 handshake — a future compromise of the server's static HPKE key cannot retroactively decrypt a recorded outer `ClientHello`'s inner payload from a past connection, since the ephemeral secret used for that specific encryption is gone.

## What ECH Does Not Hide

ECH hides the *destination domain* but not the fact that a connection to the CDN's shared front-end domain occurred at all, nor the IP address, nor the rough timing and size of the traffic. An observer can still tell "this client is talking to Cloudflare" — they just can't tell *which* of Cloudflare's millions of hosted domains it's talking to.

## Key Takeaways

- The SNI field is the last major plaintext identity leak surviving in TLS 1.3, because it must be sent before any encryption keys exist.
- ECH solves this by wrapping the real `ClientHello` inside an encrypted inner payload, addressed via a generic outer SNI that many domains share.
- The server's HPKE public key is distributed via a DNS `HTTPS` record, letting the client encrypt before the TLS handshake even starts.
- ECH hides *which* domain behind a shared CDN front-end a client is visiting; it does not hide that the client is talking to that CDN at all.
