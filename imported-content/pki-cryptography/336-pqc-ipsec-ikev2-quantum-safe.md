# Quantum-Safe VPNs: Upgrading IPsec and IKEv2 with Hybrid PQC

## The Problem: The SNDL Threat to IPsec
IPsec (Internet Protocol Security) is the backbone of enterprise VPNs, site-to-site connectivity, and 5G cellular architectures. The key negotiation protocol for IPsec is IKEv2 (Internet Key Exchange version 2). 

During the initial `IKE_SA_INIT` phase, peers establish a secure channel using a classical Diffie-Hellman exchange (e.g., ECDH over Curve25519). If an adversary captures this handshake today (the "Store Now, Decrypt Later" strategy), a future Cryptographically Relevant Quantum Computer (CRQC) can use Shor's algorithm to recover the Diffie-Hellman shared secret. Once the IKE SA is broken, all subsequent IPsec ESP (Encapsulating Security Payload) traffic is fully decrypted.

To protect long-term confidential data traversing VPNs today, IKEv2 must be upgraded to support Post-Quantum Cryptography immediately.

## The Solution: Multiple Key Exchanges in IKEv2 (RFC 9370)
Upgrading IKEv2 isn't as simple as replacing ECDH with ML-KEM. IPsec gateways must support Hybrid KEM (combining classical and PQC algorithms) to satisfy FIPS compliance while providing quantum resistance. Furthermore, ML-KEM public keys are large, often exceeding the Ethernet MTU (1500 bytes), causing UDP fragmentation.

The IETF solved this with **RFC 9370 (Multiple Key Exchanges in IKEv2)**, allowing peers to negotiate and combine up to seven distinct key exchanges.

### How IKEv2 Hybrid PQC Works
The negotiation happens in two phases. The first phase establishes a baseline (classical) secure channel. The second phase layers the PQC algorithm over it.

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

### Technical Benefits of `IKE_INTERMEDIATE`
Why use `IKE_INTERMEDIATE` instead of stuffing ML-KEM directly into `IKE_SA_INIT`?
1.  **UDP Fragmentation Mitigation:** `IKE_SA_INIT` payloads are unencrypted. If they fragment over UDP, firewalls often drop them (preventing UDP amplification attacks). `IKE_INTERMEDIATE` payloads are encrypted using the classical key. IKEv2 has native support for fragmenting encrypted payloads (RFC 7383), allowing massive ML-KEM keys to traverse strict firewalls smoothly.
2.  **DDoS Protection:** Generating ML-KEM keys is computationally heavier. By performing the classical DH first, the responder can verify the initiator's cookie before committing CPU resources to PQC decapsulation.

### StrongSwan Configuration for Hybrid PQC
Modern implementations of strongSwan support RFC 9370. To configure a Hybrid IPsec tunnel combining X25519 with Kyber (ML-KEM), adjust the `ike` cipher suite definition in `swanctl.conf`.

```conf
# strongSwan swanctl.conf example
connections {
    quantum_vpn {
        remote_addrs = 192.168.1.100
        
        # Negotiate AES-GCM-256, PRF-SHA384, X25519, and Kyber768
        # The syntax uses a dash to indicate multiple key exchanges
        ike = aes256gcm16-prfsha384-x25519-kyber768
        
        # ESP Phase 2 uses AES-GCM-256 (Grover resistant)
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

### Moving Forward
Implementing RFC 9370 protects the IPsec tunnel data from "Store Now, Decrypt Later" attacks immediately. However, true PQC compliance requires upgrading the IKE_AUTH phase (the certificates used for `my_cert.pem`) to use ML-DSA or SLH-DSA, ensuring that future quantum computers cannot spoof the identities of the VPN gateways themselves.