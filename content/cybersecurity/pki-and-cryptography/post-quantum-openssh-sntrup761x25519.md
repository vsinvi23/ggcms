---
title: "Post-Quantum SSH: Configuring OpenSSH's Hybrid sntrup761x25519-sha512 Key Exchange"
description: "How OpenSSH quietly shipped post-quantum key exchange by default since version 9.0, why it chose NTRU Prime over Kyber, and how to audit and enforce sntrup761x25519-sha512 in sshd_config and ~/.ssh/config."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "post-quantum-cryptography"
  - "openssh"
  - "ssh"
  - "ntru-prime"
  - "key-exchange"
  - "sshd-config"
---

# Post-Quantum SSH: Configuring OpenSSH's Hybrid `sntrup761x25519-sha512` Key Exchange

## The Problem: Persistent SSH Vulnerability to Harvest-Now-Decrypt-Later

An SSH session depends on two distinct cryptographic operations:

1. **Key exchange (KEX)** — typically ECDH over Curve25519, negotiating the symmetric session key.
2. **Authentication** — typically RSA or Ed25519, proving the identity of the server (host key) and the client (user key).

Both are vulnerable to a Cryptographically Relevant Quantum Computer (CRQC). The more immediate practical exposure is the key exchange: if a nation-state adversary is passively tapping traffic to a critical Linux server today (the "Store Now, Decrypt Later" attack), they can capture the ECDH handshake now and decrypt the entire administrative session — commands typed, passwords entered, files exfiltrated — the moment a CRQC becomes available.

## The Solution: OpenSSH's Default Hybrid KEX

OpenSSH developers didn't wait for NIST to finish standardizing PQC. Starting with **OpenSSH 9.0** (April 2022), the default key exchange algorithm silently became a hybrid post-quantum algorithm: `sntrup761x25519-sha512`.

This combines:

- **sntrup761** — Streamlined NTRU Prime, a lattice-based PQC KEM (parameter set 761).
- **x25519** — classical Elliptic Curve Diffie-Hellman over Curve25519.
- **sha512** — the KDF that binds both shared secrets into the final session key.

### Why NTRU Prime and Not Kyber (ML-KEM)?

At the time OpenSSH 9.0 shipped, Kyber was still under active revision inside NIST's standardization process, and its parameters weren't finalized. OpenSSH's developers chose NTRU Prime specifically because its design minimizes attack surface and side-channel risk, and because it avoided the intellectual-property questions that briefly clouded some other lattice submissions during that period. NIST ultimately standardized Kyber/ML-KEM, but `sntrup761` remains a well-analyzed, secure choice and is the active default across millions of OpenSSH deployments today — there's no urgency to replace it purely because a different algorithm won the NIST competition.

## Auditing and Enforcing PQC in SSH

By default, OpenSSH 9.0+ *prefers* `sntrup761x25519-sha512` but will silently negotiate down to classical `curve25519-sha256` if an older client connects. For environments where quantum-safety is a hard requirement rather than a best-effort default, that fallback needs to be closed off explicitly.

### 1. Verify Client/Server Support

```bash
ssh -Q kex | grep sntrup
# Expected output: sntrup761x25519-sha512@openssh.com
```

If this returns nothing, the installed OpenSSH predates 9.0 and needs upgrading before any of the hardening below is possible.

### 2. Hardening `sshd_config` (Server Side)

Edit `/etc/ssh/sshd_config` to remove classical key exchange algorithms from the allowed list entirely:

```text
# /etc/ssh/sshd_config

# Force Hybrid PQC Key Exchange only.
# WARNING: this will break connections from OpenSSH clients older than 9.0,
# and from clients (e.g. some PuTTY builds) that don't yet support this KEX.
KexAlgorithms sntrup761x25519-sha512@openssh.com

# Ensure symmetric ciphers are Grover-resistant (effectively 256-bit strength)
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com

# Ensure strong MACs
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```

Always validate the config before restarting the daemon:

```bash
sudo sshd -t && sudo systemctl restart sshd
```

Test connectivity from a *separate, already-open* session before closing your current one — an invalid `KexAlgorithms` line can lock out all SSH access to the host.

### 3. Hardening `~/.ssh/config` (Client Side)

To force a client to refuse anything but hybrid PQC key exchange when connecting to specific hosts:

```text
# ~/.ssh/config
Host critical-infrastructure.*
    KexAlgorithms sntrup761x25519-sha512@openssh.com
    Ciphers chacha20-poly1305@openssh.com
```

## The Next Frontier: Post-Quantum Authentication

`sntrup761x25519-sha512` protects the *session data* against Store-Now-Decrypt-Later — that threat is fully addressed once both ends enforce it. But the *authentication* layer (Ed25519 host and user keys) remains entirely classical. A future CRQC could forge a host key's signature and mount an active man-in-the-middle attack against a session it couldn't have decrypted passively.

OpenSSH is actively experimenting with ML-DSA (Dilithium) for host and user keys. Because ML-DSA keys and signatures are considerably larger than Ed25519's, they're expected to be deployed as hybrid certificates — combining a classical Ed25519 key with an ML-DSA key in the same certificate — in future OpenSSH releases, giving administrative shells a fully quantum-safe path end to end. Until that lands, enforcing the hybrid KEX above remains the highest-leverage step available today.
