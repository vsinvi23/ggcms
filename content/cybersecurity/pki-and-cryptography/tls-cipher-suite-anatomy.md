---
title: "Deciphering TLS Cipher Suites: Key Exchange, Bulk Encryption, and MACs"
description: "How to parse a TLS cipher suite string into its key exchange, authentication, bulk encryption, and MAC components, and why TLS 1.3 collapsed the format down to two fields."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "cipher-suites"
  - "aead"
  - "ecdhe"
  - "aes-gcm"
  - "tls-configuration"
---

# Deciphering TLS Cipher Suites: Key Exchange, Bulk Encryption, and MACs

A TLS cipher suite like `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` looks like an impenetrable string of cryptographic acronyms. Without understanding its structure, engineers cannot audit transport security, enforce compliance baselines, or spot a downgrade before it becomes a breach. This article breaks the format apart component by component, for both TLS 1.2 and TLS 1.3.

## The Anatomy of a TLS 1.2 Cipher Suite

In TLS 1.2 and earlier, a cipher suite is a single string encoding four distinct cryptographic responsibilities. The IANA format is:

```
TLS_[Key Exchange]_[Authentication]_WITH_[Bulk Encryption]_[MAC/PRF]
```

Deconstructing `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`:

### 1. Key Exchange — `ECDHE`

Determines how client and server establish a shared secret over an untrusted channel.

- **ECDHE** (Elliptic Curve Diffie-Hellman Ephemeral) — uses elliptic curve math, and "Ephemeral" means a fresh keypair is generated for every connection, guaranteeing Perfect Forward Secrecy (PFS). A future compromise of the server's long-term key cannot expose past traffic.
- *Legacy alternative:* static `RSA` key exchange, where the client encrypts the pre-master secret with the server's public key directly. No PFS — a stolen private key decrypts every past session.

### 2. Authentication — `RSA`

Determines how the server proves its identity — that it actually owns the private key matching the certificate it presented.

- **RSA** — the server signs the ECDHE key exchange parameters with its RSA private key.
- *Modern alternative:* `ECDSA` (Elliptic Curve Digital Signature Algorithm) — faster, and uses much smaller keys for equivalent security strength.

### 3. Bulk Encryption — `AES_256_GCM`

The symmetric cipher that actually encrypts application data.

- **AES_256_GCM** — AES with a 256-bit key, operating in Galois/Counter Mode. GCM is an AEAD (Authenticated Encryption with Associated Data) mode: it provides confidentiality and integrity in one atomic operation, immune to padding-oracle attacks like POODLE by construction.
- *Legacy alternative:* `AES_128_CBC` — vulnerable if paired with the MAC-then-Encrypt construction (see the dedicated article on BEAST/POODLE for why).

### 4. MAC / PRF — `SHA384`

In AEAD suites, the ciphertext's integrity is already handled by the cipher itself (via its authentication tag), so this final field specifies the hash function used for the connection's Pseudorandom Function (PRF) — deriving the master secret from the pre-master secret and generating `Finished` message hashes.

- **SHA384** used for the PRF.
- *Legacy alternative:* `SHA` (SHA-1), considered cryptographically weak today.

## The TLS 1.3 Paradigm Shift

TLS 1.3 radically simplifies this. The protocol mandates Perfect Forward Secrecy (dropping static RSA entirely) and mandates AEAD ciphers (dropping CBC and MAC-then-Encrypt entirely). Authentication — which certificate type and signature algorithm the server uses — is negotiated as a *separate* extension, no longer baked into the cipher suite string at all.

A TLS 1.3 cipher suite looks like this:

```
TLS_AES_256_GCM_SHA384
```

**Structure:** `TLS_[Bulk Encryption]_[Hash for PRF]` — two fields instead of four.

```text
TLS 1.2: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
          |____|   |   ---- |_________| |____|
            KX    Auth           Bulk     PRF

TLS 1.3: TLS_AES_256_GCM_SHA384
             |_________| |____|
                Bulk       PRF
```

Key exchange (always ephemeral ECDHE) and authentication (negotiated via `signature_algorithms`) are no longer part of the cipher suite name at all — they're implicit and separately negotiated, because TLS 1.3 doesn't offer a non-ephemeral, non-AEAD alternative to fall back to.

## Enforcing Modern Cipher Suites in Production

Even on TLS 1.2 (which many deployments must keep enabled for compatibility), you should explicitly disable weak primitives rather than trust default OpenSSL/BoringSSL cipher lists:

```nginx
server {
    listen 443 ssl http2;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Prioritize AEAD suites with Perfect Forward Secrecy
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256';

    # Let the server, not the client, dictate cipher preference
    ssl_prefer_server_ciphers on;
}
```

Note that on TLS 1.3 connections, `ssl_ciphers` only affects the TLS 1.2 negotiation path — TLS 1.3 cipher suites are configured separately (via `ssl_conf_command Ciphersuites ...` on modern Nginx builds against OpenSSL 1.1.1+), since the protocol's suite list is fixed and short by design.

## Quick Reference: Reading Any Cipher Suite String

| You see this token | It means |
| :--- | :--- |
| `ECDHE` | Ephemeral elliptic curve key exchange — forward secret |
| `RSA` (as key exchange, before `_WITH_`) | Static RSA key exchange — no forward secrecy, deprecated |
| `RSA` / `ECDSA` (as authentication) | Certificate signature algorithm |
| `GCM` / `CHACHA20_POLY1305` | AEAD bulk cipher — safe against padding oracles |
| `CBC` | Block cipher chaining mode — requires careful MAC ordering, avoid if possible |
| `SHA384` / `SHA256` (final token) | PRF hash, or MAC hash in non-AEAD suites |
| `SHA` (bare, final token) | SHA-1 — weak, avoid |

## Key Takeaways

- A TLS 1.2 cipher suite string encodes four independent decisions: key exchange, authentication, bulk cipher, and PRF/MAC hash — read left to right around `_WITH_`.
- `ECDHE` in the key-exchange slot means forward secrecy; bare `RSA` in that slot means none.
- `GCM` or `CHACHA20_POLY1305` in the bulk-cipher slot means AEAD, immune to padding-oracle attacks; `CBC` does not.
- TLS 1.3 cipher suites only encode bulk cipher and PRF hash, because key exchange (always ephemeral) and authentication (separately negotiated) are no longer optional variables worth naming in the suite string.
