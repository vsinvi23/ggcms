---
title: "Isogeny-Based Cryptography: The Fall of SIKE and the Search for Compact Quantum-Safe Curves"
description: "What an isogeny actually is, why SIKE promised ECC-sized post-quantum keys, how the 2022 Castryck-Decru attack broke it in an hour on a laptop, and why CSIDH and SQIsign survived where SIKE didn't."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "post-quantum-cryptography"
  - "isogeny-cryptography"
  - "sike"
  - "csidh"
  - "sqisign"
  - "elliptic-curves"
  - "cryptanalysis"
---

# Isogeny-Based Cryptography: The Fall of SIKE and the Search for Compact Quantum-Safe Curves

## The Problem: The Key Size Crisis in PQC

Lattice-based algorithms — ML-KEM for key encapsulation, ML-DSA for signatures — are the pragmatic center of NIST's post-quantum standardization. But their public keys measure in the kilobytes: an ML-KEM-768 public key is roughly 1.2 KB, versus 32 bytes for a classical elliptic curve public key. For protocols with tight bandwidth budgets — DNSSEC, constrained IoT firmware update channels, high-frequency IKEv2 rekeying — that 30-40x size increase is a real deployment obstacle (see the IKEv2/RFC 9370 fragmentation problem it creates elsewhere in PQC migration).

The holy grail was an algorithm that is quantum-resistant but keeps the ultra-compact key sizes of classical ECC. For several years, Isogeny-based cryptography — specifically Supersingular Isogeny Key Encapsulation (SIKE) — was the leading candidate, with public keys around 330 bytes, roughly ten times smaller than ML-KEM. Then, in 2022, it was completely broken.

## The Math: What Is an Isogeny?

In classical ECC, cryptographic operations work *within* a single elliptic curve — adding point P to point Q on the same curve, or computing a scalar multiple of a fixed base point.

In isogeny-based cryptography, the operation transforms *one entire curve into a different curve*. An isogeny is a morphism — a structure-preserving rational map — between two elliptic curves that preserves the point at infinity (the group's identity element). Instead of a random walk across points on one curve, the cryptographic hard problem lives on an **isogeny graph**: a graph whose nodes are distinct supersingular elliptic curves and whose edges are the isogenies connecting them.

```text
[Curve E_start] ----(Isogeny phi_1)----> [Curve E_1] ----(Isogeny phi_2)----> [Curve E_2]
```

Finding a path between two large, randomly chosen curves in this graph — recovering the sequence of isogenies an honest party used to walk from `E_start` to their public curve — was believed to be exceptionally hard for both classical and quantum computers. That belief is exactly what SIKE's security rested on.

## The Fall of SIKE: The Castryck-Decru Attack

SIKE reached the fourth round of NIST's PQC standardization process as the leading alternative to lattice-based schemes, precisely because of its compact keys. But to make a Diffie-Hellman-like key exchange work over isogeny graphs, SIKE needed each party to transmit auxiliary information alongside their public curve: the images of certain **torsion points** under their secret isogeny. That auxiliary data turned out to be the fatal weakness.

In July 2022, Wouter Castryck and Thomas Decru published an attack that used the auxiliary torsion point information, combined with **Richelot isogenies** and **Kani's theorem** from genus-2 curve geometry, to algebraically reconstruct the secret isogeny path directly — bypassing the hard graph-walking problem entirely.

The attack required no quantum computer. A single-core classical CPU running a SageMath script broke SIKE-p434 (NIST Security Level 1, roughly equivalent to AES-128) in **about one hour**. SIKE went from "leading PQC finalist" to "publicly broken" within days of the paper's release.

### The Attack, Conceptually

```python
# The Castryck-Decru attack logic, simplified to its structure —
# real implementations use SageMath's genus-2 curve arithmetic.
def break_sike(E_start, E_pub, torsion_points):
    """
    E_start: Starting curve
    E_pub: Alice's public curve
    torsion_points: Auxiliary info Alice sent to Bob (the fatal leak)
    """
    # 1. Lift the 1-dimensional elliptic curves into a 2-dimensional
    #    Abelian surface, using the auxiliary torsion points as the glue.
    abelian_surface = construct_genus_2_surface(E_start, E_pub, torsion_points)

    # 2. Exploit Richelot isogenies on the 2D surface — this bypasses
    #    the hard graph-walking problem that exists on the 1D curves.
    secret_path = richelot_isogeny_chain(abelian_surface)

    # 3. Project back down to 1D to reveal the secret isogeny (= private key)
    return extract_private_key(secret_path)
```

## The Aftermath: CSIDH and SQIsign

The Castryck-Decru attack did not destroy all isogeny-based cryptography — it destroyed schemes that transmit auxiliary torsion points as part of the protocol. Two survivors illustrate the design lesson.

### CSIDH (Commutative Supersingular Isogeny Diffie-Hellman)

CSIDH sidesteps the attack entirely because it never transmits torsion points. Instead of arbitrary-degree isogenies between curves over an extension field, CSIDH uses the action of the ideal class group of an imaginary quadratic field acting on the set of supersingular curves defined over a prime field `F_p`.

- **Pros:** public keys around 64 bytes — smaller even than SIKE's.
- **Cons:** slow, and a quantum subexponential-time variant of Shor's algorithm applies to the underlying class-group-action problem, forcing much larger parameter sizes than were originally assumed to stay secure.

### SQIsign (Signature Quantum with Isogenies)

Currently the most promising isogeny-based *signature* scheme (not a KEM). It produces signatures smaller than RSA — around 177 bytes — by leveraging the **Deuring correspondence**, which translates the hard geometric problem of finding an isogeny path into a purely algebraic quaternion algebra problem.

- **Pros:** the smallest signatures of any PQC candidate.
- **Cons:** signing takes several seconds on a modern CPU — impractical for high-volume TLS handshakes, but a reasonable fit for infrequent, high-value operations like static document signing or firmware release signing where a few seconds of signer latency is irrelevant.

## Conclusion

Isogenies remain the most mathematically elegant and most compact area of post-quantum cryptography, but the sheer complexity of genus-2 surfaces and quaternion algebras makes them the hardest family to implement correctly and the easiest to get subtly, catastrophically wrong — as the entire SIKE program demonstrated. Anyone evaluating an isogeny-based scheme for production use should treat "does this protocol transmit any auxiliary point/torsion information beyond the bare public curve?" as the first and most important question to ask.
