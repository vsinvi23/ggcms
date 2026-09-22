# NIST PQC Standards: FIPS 203, 204, and 205 Decoded

## The Problem: Moving from Submissions to Standards
The NIST Post-Quantum Cryptography (PQC) standardization process lasted over seven years. During this time, the cryptographic community evaluated, attacked, and tweaked dozens of algorithms. When NIST finally published the draft Federal Information Processing Standards (FIPS) in August 2023, the selected algorithms—Kyber, Dilithium, and SPHINCS+—underwent critical structural changes and renaming. 

Developers implementing "Kyber" based on Round 3 reference code will find their implementations incompatible with the finalized FIPS standards. Understanding these exact algorithmic shifts is critical for interoperability.

## The Solution: Decoding the FIPS Triad
NIST reorganized the winners into three distinct FIPS publications. 

### 1. FIPS 203: ML-KEM (Module-Lattice-Based Key Encapsulation Mechanism)
Derived from CRYSTALS-Kyber. ML-KEM is the primary algorithm for establishing shared secrets over untrusted channels (replacing ECDH).

**Technical Changes from Kyber to ML-KEM:**
*   **Hash Function Constraints:** FIPS 203 enforces strict usage of SHA-3 (specifically SHAKE128 and SHAKE256) inside the KDF and PRF layers.
*   **Parameter Sets:** NIST explicitly defines three security levels corresponding to classical AES strengths:
    *   **ML-KEM-512** (AES-128 equivalent): 800-byte public key.
    *   **ML-KEM-768** (AES-192 equivalent): 1184-byte public key.
    *   **ML-KEM-1024** (AES-256 equivalent): 1568-byte public key.
*   **Decapsulation Failure:** ML-KEM enforces implicit rejection. If ciphertext tampering is detected during decapsulation, it deterministically outputs a pseudo-random string instead of throwing a distinct error, defending against chosen-ciphertext attacks (CCA).

### 2. FIPS 204: ML-DSA (Module-Lattice-Based Digital Signature Algorithm)
Derived from CRYSTALS-Dilithium. ML-DSA is the primary general-purpose digital signature algorithm (replacing ECDSA/RSA).

**Technical Changes from Dilithium to ML-DSA:**
*   **Randomized vs. Deterministic:** ML-DSA allows both deterministic and randomized signing. However, FIPS 204 emphasizes the randomized variant to mitigate fault-injection attacks.
*   **Context Strings:** ML-DSA introduces a mandatory context string parameter for domain separation. Signing the exact same payload in two different contexts (e.g., TLS handshake vs. document signing) yields completely different hashes prior to signing.

```c
// Conceptual FIPS 204 ML-DSA Signature API
int mldsa_sign(
    uint8_t *sig, size_t *siglen,
    const uint8_t *msg, size_t msglen,
    const uint8_t *ctx, size_t ctxlen, // New domain separation context
    const uint8_t *sk,
    const uint8_t *randomness         // For fault-injection defense
);
```

### 3. FIPS 205: SLH-DSA (Stateless Hash-Based Digital Signature Algorithm)
Derived from SPHINCS+. SLH-DSA is a fallback signature algorithm relying strictly on the security of hash functions rather than lattice math. 

**Technical Design of SLH-DSA:**
*   **The Math:** It chains together Winternitz One-Time Signatures (WOTS+) into a massive hyper-tree structure. Because it relies purely on pre-image resistance of SHA-2/SHA-3, its mathematical security is unassailable.
*   **The Trade-off:** The signatures are colossal. An SLH-DSA-SHA2-128f signature is roughly **17,000 bytes**, and computing it requires millions of hash invocations. It is completely unsuited for TLS handshakes but perfect for long-term code signing and root CAs where speed and size are secondary to absolute security.

### Architecture Diagram: PQC Deployment Strategy

```text
[ Root Certificate Authority ] 
       | Algorithm: FIPS 205 (SLH-DSA)
       | Reason: Extreme longevity, conservative math.
       v
[ Intermediate CAs ]
       | Algorithm: FIPS 204 (ML-DSA)
       | Reason: Faster issuing, moderate size for CRLs.
       v
[ End-Entity / TLS Server ]
       | Algorithm: FIPS 204 (ML-DSA) for Auth
       |            FIPS 203 (ML-KEM) for Key Exchange
       | Reason: Fast signing/verification, acceptable latency.
```

By segmenting the FIPS standards across specific PKI tiers, cryptographers can leverage the speed of module lattices at the edge while relying on the sheer brute-force security of hash-based structures at the root.