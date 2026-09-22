---
title: "Quantum-Safe VPNs: Upgrading IPsec and IKEv2 with Hybrid PQC (RFC 9370)"
description: "How RFC 9370 lets IKEv2 negotiate multiple key exchanges so IPsec VPNs can combine classical ECDH with ML-KEM, why IKE_INTERMEDIATE matters for fragmentation and DDoS resistance, and how to configure it in strongSwan."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "post-quantum-cryptography"
  - "ipsec"
  - "ikev2"
  - "rfc-9370"
  - "strongswan"
  - "ml-kem"
  - "vpn"
---

# Quantum-Safe VPNs: Upgrading IPsec and IKEv2 with Hybrid PQC

## The Problem: The SNDL Threat to IPsec

IPsec is the backbone of enterprise site-to-site VPNs, remote access tunnels, and much of 5G cellular backhaul security. Its key negotiation protocol, IKEv2 (Internet Key Exchange version 2), establishes the shared secret that later ESP (Encapsulating Security Payload) traffic depends on.

During the initial `IKE_SA_INIT` exchange, peers perform a classical Diffie-Hellman key exchange — typically ECDH over Curve25519 or a NIST curve. If an adversary passively captures this handshake today (the "Store Now, Decrypt Later" strategy), a future Cryptographically Relevant Quantum Computer (CRQC) running Shor's algorithm can recover the DH shared secret. Once the IKE Security Association is broken, every ESP packet protected by keys derived from it is retroactively decryptable.

For VPN traffic carrying data with a long confidentiality requirement — government communications, healthcare data in transit, intellectual property — that retroactive exposure is unacceptable, and it means IKEv2 needs post-quantum protection *now*, not once a CRQC exists.

## The Solution: Multiple Key Exchanges in IKEv2 (RFC 9370)

Naively swapping ECDH for ML-KEM inside IKEv2 has two problems:

1. **FIPS/compliance transition period.** Regulated environments generally require hybrid (classical + PQC) rather than PQC-only key exchange until PQC algorithms have a longer track record.
2. **MTU limits.** ML-KEM public keys (roughly 1.2 KB for ML-KEM-768) routinely exceed the Ethernet MTU (1500 bytes), and `IKE_SA_INIT` payloads are sent unencrypted over UDP — where fragmentation is fragile and often blocked outright by firewalls hardened against UDP amplification attacks.

**RFC 9370 (Multiple Key Exchanges in IKEv2)** solves both: it lets peers negotiate and combine up to seven distinct key exchange methods, executed across two phases.

### Protocol Flow

```text
[ Initiator ]                                              [ Responder ]
      |                                                          |
      | ------------- IKE_SA_INIT (Classical) -----------------> |
      |   (HDR, SAi1, KEi1 [X25519], Ni, N(IKEV2_FRAG_SUPPORTED))|
      |                                                          |
      | <------------ IKE_SA_INIT (Classical) ------------------ |
      |   (HDR, SAr1, KEr1 [X25519], Nr, N(ADDITIONAL_KEY_EXCH)) |
      |                                                          |
      |   *** Classical Shared Secret (SK_d) established ***     |
      |                                                          |
      | ------------- IKE_INTERMEDIATE (Post-Quantum) ---------> |
      |   (HDR, SK { KEi2 [ML-KEM-768] })                        |
      |                                                          |
      | <------------ IKE_INTERMEDIATE (Post-Quantum) ---------- |
      |   (HDR, SK { KEr2 [ML-KEM-768 Ciphertext] })             |
      |                                                          |
      |   *** Keys combined via KDF into final IPsec Keys ***    |
      |                                                          |
      | ------------- IKE_AUTH (Authentication) ---------------> |
      |   (HDR, SK { IDi, AUTH, SAi2, TSi, TSr })                |
```

The first phase (`IKE_SA_INIT`) runs the classical exchange only and establishes an encrypted channel. The new `IKE_INTERMEDIATE` phase then carries the much larger ML-KEM public key and ciphertext *inside* that already-encrypted channel. A key derivation function combines the classical shared secret with the post-quantum shared secret into the final keys used for the rest of IKE and for the child IPsec Security Associations.

### Why `IKE_INTERMEDIATE` Instead of Stuffing ML-KEM Into `IKE_SA_INIT`?

1. **UDP fragmentation mitigation.** `IKE_SA_INIT` payloads are unencrypted; if they fragment at the UDP layer, many firewalls drop the fragments outright as a defense against UDP amplification. `IKE_INTERMEDIATE` payloads are encrypted, and IKEv2 already has a mechanism for fragmenting *encrypted* payloads (RFC 7383) that traverses strict firewalls cleanly.
2. **DDoS resistance.** ML-KEM decapsulation is computationally heavier than parsing a classical DH share. By completing the classical exchange (and its anti-clogging cookie mechanism) first, the responder verifies the initiator is not a spoofed source before committing CPU cycles to the more expensive PQC operation.

### strongSwan Configuration for Hybrid PQC

Modern strongSwan releases support RFC 9370. Configuring a hybrid tunnel combining X25519 with ML-KEM (Kyber) means adjusting the `ike`/`esp` proposal strings in `swanctl.conf`:

```conf
# strongSwan swanctl.conf example
connections {
    quantum_vpn {
        remote_addrs = 192.168.1.100

        # Negotiate AES-GCM-256, PRF-SHA384, X25519, and Kyber768.
        # The dash-separated suffix after the DH group name indicates
        # an additional (post-quantum) key exchange to combine with it.
        ike = aes256gcm16-prfsha384-x25519-kyber768

        # ESP Phase 2 uses AES-GCM-256 (Grover-resistant symmetric strength)
        esp = aes256gcm16-x25519-kyber768

        local {
            auth = pubkey
            certs = my_cert.pem
        }
        remote {
            auth = pubkey
        }
        children {
            net_sa {
                local_ts  = 10.10.0.0/24
                remote_ts = 10.20.0.0/24
            }
        }
    }
}
```

Verify negotiation succeeded with `swanctl --list-sas` after bringing the tunnel up — the SA detail output lists the negotiated DH/KE groups, and a hybrid tunnel should show both the classical group and the PQC KEM in the same SA.

## Moving Forward

Implementing RFC 9370 protects the confidentiality of IPsec tunnel data against "Store Now, Decrypt Later" attacks immediately — that's the highest-value, lowest-risk first step. It does **not** yet make the tunnel's authentication quantum-safe: the certificates referenced by `certs = my_cert.pem` in the config above are still signed with classical algorithms (RSA or ECDSA) unless the CA issuing them has already migrated to ML-DSA or SLH-DSA. A CRQC that can forge those signatures could still impersonate a VPN gateway in an active man-in-the-middle attack, even though it can no longer passively decrypt harvested traffic. Migrating the certificate chain to post-quantum signatures is the necessary second phase of a complete IPsec quantum-safety project.
