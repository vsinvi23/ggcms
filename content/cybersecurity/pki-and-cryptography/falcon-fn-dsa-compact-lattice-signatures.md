---
title: "Post-Quantum Falcon (FN-DSA): Fast-Fourier Lattices for Compact Signatures"
description: "Why ML-DSA's 3.7KB signature+key bandwidth breaks constrained protocols like DNSSEC and IoT, how Falcon (FN-DSA) uses NTRU lattices and Klein's sampler over FFTs to compress that footprint, and the constant-time risks it introduces."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "post-quantum-cryptography"
  - "falcon"
  - "fn-dsa"
  - "ntru-lattice"
  - "digital-signatures"
  - "constant-time"
---

# Post-Quantum Falcon (FN-DSA): Fast-Fourier Lattices for Compact Signatures

## The Problem: ML-DSA's Bloat in Constrained Environments

While ML-DSA (FIPS 204) is the flagship lattice-based signature scheme, it suffers from a significant drawback: bandwidth. An ML-DSA-44 public key is 1,312 bytes, and its signature is 2,420 bytes. For standard web traffic, this is tolerable. However, in heavily constrained environments — IoT devices, embedded hardware, deep-space telemetry, or protocols with strict Maximum Transmission Unit (MTU) limits like DNSSEC — ML-DSA causes severe packet fragmentation and protocol failure.

## The Solution: FN-DSA (Falcon)

Falcon (Fast-Fourier Lattice-based Compact Signatures), standardized by NIST as FN-DSA, solves the bandwidth crisis. By utilizing NTRU lattices and Gaussian sampling via Fast Fourier Transforms (FFT), Falcon produces the smallest combined public key and signature sizes of any post-quantum signature scheme.

- **FN-DSA-512 Public Key:** 897 bytes
- **FN-DSA-512 Signature:** 666 bytes
- **Total Bandwidth:** ~1,563 bytes (compared to ML-DSA-44's 3,732 bytes)

### The Math: How Falcon Compresses Data

ML-DSA operates over module lattices using Fiat-Shamir with Aborts. Falcon operates over NTRU lattices using the Hash-and-Sign paradigm via Klein's sampler.

In Falcon, the private key is a "good" basis for an NTRU lattice (vectors that are short and orthogonal). The public key is a "bad" basis for the same lattice (vectors that are long and highly skewed). To sign a message, the signer hashes the message to a random point in the vector space, and uses the private "good" basis to find the absolute closest lattice point to that hash. The signature is the difference vector. The verifier uses the public "bad" basis to verify that the vector is indeed part of the lattice and sufficiently close to the hash.

To do this efficiently, Falcon utilizes floating-point arithmetic and recursive FFTs over the polynomial ring.

```text
+-----------------------+
| Falcon Signing Core   |
+-----------------------+
        | Hash(Msg) --> Point (c)
        v
+-----------------------+
| Fast Fourier Sampling |
| (Klein's Sampler via  |
|  NTRU Good Basis)     |
+-----------------------+
        |
        v
  Signature Vector (s)
  (Extremely short, compressible)
```

### The Catch: Floating-Point Complexity

The compactness of Falcon comes at a massive implementation cost. The recursive FFTs require 64-bit floating-point (IEEE 754) arithmetic.

**Implementation risks:**

1. **Constant-Time Execution** — floating-point units (FPUs) in modern CPUs often do not execute in constant time, leading to fatal timing side-channel attacks against the private key.
2. **Embedded Systems** — many microcontrollers lack hardware FPUs. Emulating 64-bit floats in software on an ARM Cortex-M4 destroys performance, making Falcon ironically slower than ML-DSA on the very devices that need its small bandwidth.

### Code Context: Encoding the Falcon Signature

Because the signature vector consists of small integers clustered around zero (a Gaussian distribution), Falcon uses Huffman coding to aggressively compress the signature before transmission.

```c
// Conceptual representation of Falcon signature compression
// The signature vector 's' contains values like {0, -1, 1, 0, 0, 2, -1 ...}

void compress_signature(uint8_t *out, const int16_t *s, size_t n) {
    BitStream stream;
    init_stream(&stream, out);

    for (size_t i = 0; i < n; i++) {
        int16_t val = s[i];
        uint8_t sign = (val < 0) ? 1 : 0;
        uint16_t abs_val = abs(val);

        // Huffman encode: abs_val zeroes followed by a 1
        for (uint16_t j = 0; j < abs_val; j++) {
            write_bit(&stream, 0);
        }
        write_bit(&stream, 1);

        // Write sign bit if non-zero
        if (abs_val > 0) {
            write_bit(&stream, sign);
        }
    }
}
```

### When to Use FN-DSA

FN-DSA is not the default. Use ML-DSA whenever possible. Reserve FN-DSA strictly for protocols where saving 2 kilobytes of bandwidth per handshake justifies the intense CPU utilization and side-channel risks associated with complex constant-time FFT implementations.
