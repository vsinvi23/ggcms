---
title: "Post-Quantum Hash-Based Signatures: SPHINCS+ and Winternitz One-Time Signatures"
description: "How SPHINCS+ (FIPS 205 / SLH-DSA) builds a stateless post-quantum signature scheme out of WOTS+ one-time signatures, Merkle/XMSS trees, and a FORS hyper-tree, without relying on any new hardness assumption."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "post-quantum-cryptography"
  - "sphincs-plus"
  - "slh-dsa"
  - "hash-based-signatures"
  - "merkle-tree"
  - "digital-signatures"
---

# Post-Quantum Hash-Based Signatures: SPHINCS+ and Winternitz One-Time Signatures

## The Problem: The Quantum Threat to RSA and ECC

Virtually all modern digital signatures — whether RSA, ECDSA, or EdDSA — rely on the computational difficulty of mathematical problems like integer factorization or the discrete logarithm. In 1994, Peter Shor published a quantum algorithm that solves these exact problems in polynomial time. Once large-scale, fault-tolerant quantum computers are built, current asymmetric cryptography will be instantly broken.

To prepare, NIST initiated a standardization process for Post-Quantum Cryptography (PQC). Among the finalists are **Hash-Based Signatures (HBS)**. Unlike lattice or code-based cryptography, HBS does not introduce novel, untested mathematical hardness assumptions. It relies solely on the proven security of established cryptographic hash functions (like SHA-2 or SHAKE).

If a hash function is pre-image and collision resistant, the signature scheme is secure. The most prominent stateless HBS algorithm is **SPHINCS+**, standardized by NIST as **FIPS 205 (SLH-DSA)**.

## The Foundation: Winternitz One-Time Signatures (WOTS+)

To understand SPHINCS+, we must first build a one-time signature. The Lamport signature is the simplest, but the **Winternitz One-Time Signature (WOTS+)** drastically reduces the signature size by signing multiple bits at once.

Instead of hashing a secret value once per bit, WOTS+ chains hashes together. Let $H$ be a cryptographic hash function, and $w$ be the Winternitz parameter (e.g., $w = 16$). We are operating in base-16, meaning each chunk of the message represents a value from 0 to 15.

1. **Key Generation** — generate a random secret key $sk$. Hash it $w-1$ times to get the public key $pk$.
   $$ pk = H^{15}(sk) $$
2. **Signing** — if the message chunk is $M = 5$, the signature is the secret key hashed 5 times.
   $$ Sig = H^5(sk) $$
3. **Verification** — the verifier receives $Sig$ and knows the message is $M=5$. They hash the signature the remaining number of times $(15 - 5 = 10)$ to see if it equals the public key.
   $$ pk \stackrel{?}{=} H^{10}(Sig) $$

Because hash functions are one-way, an attacker holding $H^5(sk)$ cannot reverse it to find $H^4(sk)$ to forge a smaller message. (Note: a checksum is appended to prevent an attacker from computing $H^6(sk)$ to forge a larger message.)

### The Problem with WOTS+

WOTS+ is highly secure but has a massive limitation: **it is a one-time signature (OTS)**. If you sign two different messages with the same secret key, you expose different hash chain links, allowing attackers to forge signatures. To sign multiple messages, we need a way to manage millions of WOTS+ key pairs securely.

## Enter the XMSS Tree

To sign multiple messages, we arrange WOTS+ key pairs into a **Merkle Tree**, creating the eXtended Merkle Signature Scheme (XMSS).

1. Generate $2^h$ different WOTS+ key pairs (where $h$ is the tree height).
2. Hash each WOTS+ public key to form the leaves of a Merkle Tree.
3. Hash the leaves up to a single Root Hash. **This Root Hash is your overarching public key.**

When you sign a message, you use one WOTS+ key pair, and your signature includes the WOTS+ signature *plus* the Merkle authentication path to prove that the specific WOTS+ key belongs to the Root Hash.

**The statefulness problem** — standard XMSS requires you to remember which WOTS+ keys you have already used (statefulness). If you restore a backup of your server and accidentally reuse a WOTS+ key, the system is broken.

## SPHINCS+: The Stateless Solution

SPHINCS+ solves the statefulness problem by making the tree so unimaginably massive that a collision (picking the same WOTS+ key twice at random) is statistically impossible.

It does this using a **hyper-tree** (a tree of trees):

- Instead of one giant Merkle tree, SPHINCS+ uses layers of trees. The leaves of the top tree sign the roots of the trees in the layer below, continuing down to the bottom layer.
- At the very bottom leaves, it doesn't use WOTS+. It uses a few-time signature scheme called **FORS** (Forest of Random Subsets).

```text
+-----------------------------------------------------------------------+
|                Global Public Key = Root of Top Tree                   |
+-----------------------------------------------------------------------+
                                |
                                v  Top tree leaves sign the roots below
                +----------------------------------+
                |         Mid-Layer Tree(s)         |
                +----------------------------------+
                                |
                                v  Mid tree leaves sign the roots below
                +----------------------------------+
                |        Bottom-Layer Tree(s)       |
                +----------------------------------+
                                |
                                v  Bottom tree leaves = FORS instances
                +----------------------------------+
                |   FORS Few-Time Signature (Msg)   |
                +----------------------------------+
```

When signing a message, SPHINCS+ uses a pseudorandom function to probabilistically select a leaf at the bottom of this hyper-tree. The hyper-tree contains up to $2^{60}$ leaves. Even if you sign billions of messages, the chance of randomly selecting the same FORS key pair is negligible.

## Conclusion and Trade-offs

SPHINCS+ provides incredible post-quantum security guarantees, relying purely on symmetric hash math rather than number theory. However, this mathematical certainty comes at a high structural cost. Because a SPHINCS+ signature must include the FORS signature, multiple WOTS+ signatures (to connect the tree layers), and all the corresponding Merkle authentication paths, a single signature is enormous — often ranging from **8 KB to 30 KB** (compared to a 64-byte ECDSA signature). While not ideal for constrained network protocols, SPHINCS+ (SLH-DSA) remains a critical, ultra-conservative fallback for long-term document and code signing in the post-quantum era.
