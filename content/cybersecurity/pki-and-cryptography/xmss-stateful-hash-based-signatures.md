---
title: "Stateful Hash-Based Signatures: XMSS and LMS for Post-Quantum Root Keys"
description: "How XMSS and LMS use WOTS+ one-time signatures and Merkle trees to provide the most conservative post-quantum signature guarantee available, and why state management makes them unsuitable for anything but tightly controlled hardware."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "post-quantum-cryptography"
  - "xmss"
  - "hash-based-signatures"
  - "merkle-tree"
  - "wots-plus"
  - "lms"
  - "hsm"
---

# Stateful Hash-Based Signatures: XMSS and LMS for Post-Quantum Root Keys

## The Problem: The Mathematical Anxiety of Lattices

NIST has standardized lattice-based cryptography (ML-DSA, formerly Dilithium) as the general-purpose post-quantum signature scheme. But lattices are mathematically young compared to integer factorization or discrete logarithms. The hardness assumption behind ML-DSA — Learning With Errors (LWE) — has been studied seriously for less than two decades. If a classical cryptanalyst finds a fast algorithm against LWE, every certificate, firmware image, and root of trust signed with ML-DSA is retroactively forgeable.

High-assurance environments cannot tolerate that kind of algorithmic anxiety:

- **Firmware signing for satellites and industrial control systems** — devices that will run unpatched for 15+ years.
- **Root and intermediate Certificate Authorities** — a single root key compromise invalidates an entire PKI hierarchy.
- **Hardware Security Modules (HSMs)** — the anchor of trust for an organization's entire cryptographic estate.

These environments need a signature scheme whose security reduces to something that has survived decades of attack: cryptographic hash functions.

## The Solution: Stateful Hash-Based Signatures (XMSS and LMS)

XMSS (eXtended Merkle Signature Scheme, RFC 8391 / NIST SP 800-208) and its sibling LMS (Leighton-Micali Signatures, RFC 8554) provide exactly that. Their security relies entirely on the pre-image and collision resistance of an underlying hash function such as SHA-256 or SHA-3. There is no new algebraic structure to attack — if SHA-256 remains hard to invert, XMSS remains secure, against both classical and quantum adversaries (Grover's algorithm only halves the effective hash strength, so SHA-256 still delivers ~128-bit post-quantum security).

### How It Works: WOTS+ and Merkle Trees

At the core of XMSS is the Winternitz One-Time Signature scheme (WOTS+). A WOTS+ keypair can sign exactly **one** message safely. Sign two different messages with the same WOTS+ private key and an attacker can algebraically combine the two signatures to forge new ones — the "one-time" in one-time signature is a hard security requirement, not a suggestion.

To make a one-time primitive usable for a real certificate authority or firmware signer, XMSS generates many thousands (or millions) of WOTS+ keypairs in advance and hashes their public keys into the leaves of a Merkle tree. The tree's root becomes the long-lived XMSS public key.

```text
               [ Root Hash (XMSS Public Key) ]
                      /               \
                 [Node 0]           [Node 1]
                 /      \           /      \
             [N_00]    [N_01]   [N_10]    [N_11]
               |         |         |         |
WOTS+ PubKeys: P_0       P_1       P_2       P_3
               |         |         |         |
WOTS+ PrivKeys:S_0       S_1       S_2       S_3
             (Used)    (Next)    (Avail)   (Avail)
```

An XMSS signature over a message consists of three parts:

1. The WOTS+ signature of the message hash.
2. The WOTS+ public key that produced that signature.
3. The **authentication path** — the sibling hashes up the Merkle tree that let a verifier recompute the root and confirm the WOTS+ public key really is leaf `i` of this specific tree.

The verifier never needs to see the whole tree — only `log2(N)` sibling hashes, where `N` is the number of leaves.

### The Catastrophic Catch: State Management

Because a WOTS+ key must never be reused, the signer must track — durably, across restarts, backups, and crashes — which leaf index has already been consumed.

```c
// Conceptual XMSS Signer
typedef struct {
    uint32_t current_index; // THE CRITICAL STATE
    uint32_t max_index;
    uint8_t  secret_seed[32];
    uint8_t  public_root[32];
} XMSS_State;

int xmss_sign(XMSS_State *state, const uint8_t *msg, uint8_t *sig_out) {
    if (state->current_index >= state->max_index) {
        return ERR_KEYS_EXHAUSTED;
    }

    // 1. Generate the WOTS+ keypair for the current index
    WOTS_Keypair kp = generate_wots(state->secret_seed, state->current_index);

    // 2. Sign the message
    wots_sign(kp.private_key, msg, sig_out);

    // 3. Append the Merkle authentication path to sig_out
    append_auth_path(state, state->current_index, sig_out);

    // 4. CRITICAL: Update non-volatile state BEFORE returning
    state->current_index++;
    if (nvram_write_state(state) != 0) {
        // If durable state write fails, the device MUST halt signing
        // rather than risk reusing this index after a crash/restore.
        return ERR_STATE_WRITE_FAILED;
    }

    return SUCCESS;
}
```

**State synchronization failure is the entire risk profile of this scheme.** If a signing server is virtualized, snapshotted, and later restored from that snapshot, `current_index` reverts to an earlier value. The very next signature reuses a WOTS+ leaf that was already consumed before the snapshot — and an attacker who collects both signatures can derive the private key material for that leaf, letting them forge new signatures under the same root. This is why XMSS/LMS deployment guidance (NIST SP 800-208) explicitly warns against running the signer inside a VM that supports snapshot/restore, and why HSM vendors implement XMSS state as a monotonic, tamper-evident counter in dedicated non-volatile memory rather than in application-layer storage.

### Multi-Tree: HSS and MT-XMSS

A single Merkle tree is bounded by a practical height (commonly `2^20` leaves, i.e. about one million signatures, since deeper trees make signing slower). Systems that need billions of signatures over their lifetime — a firmware signing authority shipping updates for decades — use a hyper-tree construction: **HSS** (Hierarchical Signature System, the LMS multi-tree variant) or **MT-XMSS**. Here, upper-level trees sign the roots of lower-level trees, so the effective signing capacity multiplies across levels while each individual tree stays small enough to generate and traverse efficiently.

## Where XMSS/LMS Fits — and Where It Doesn't

| Use case | Fit | Why |
|---|---|---|
| Firmware/bootloader signing | Excellent | Signer is a controlled build server; verifier logic is simple and stable for years |
| Root/intermediate CA signing key | Excellent | Low signature volume, extremely high assurance requirement, HSM-backed state |
| TLS server certificates | Poor | TLS terminates on many replicated, often ephemeral hosts — state synchronization across replicas is the failure mode described above |
| End-user authentication (WebAuthn, SSH user keys) | Poor | Users cannot be trusted to manage NVRAM state correctly; a stateless scheme like ML-DSA or SLH-DSA is the right tool here |

## Conclusion

Stateful hash-based signatures are a narrow but critical tool: they trade the operational burden of atomic, durable state management for the strongest security argument available in post-quantum cryptography — "as secure as SHA-256/SHA-3, full stop." For root CAs, HSMs, and firmware signing pipelines where the operational discipline to guarantee atomic state writes already exists, XMSS and LMS are the most conservative hedge against both quantum computers and future mathematical breakthroughs against lattice assumptions.
