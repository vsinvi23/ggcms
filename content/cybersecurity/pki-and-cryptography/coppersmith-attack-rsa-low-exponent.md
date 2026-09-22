---
title: "Coppersmith's Attack: Why RSA with e=3 Breaks on Stereotyped Messages"
description: "How Hastad's broadcast attack and Coppersmith's LLL-based small-roots method turn RSA's low public exponent e=3 into a practical break against predictable message formats, and why OAEP plus e=65537 became the universal mitigation."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "rsa"
  - "coppersmith-attack"
  - "low-exponent-attack"
  - "hastad-broadcast-attack"
  - "lattice-reduction"
  - "sagemath"
---

# Coppersmith's Attack: Why RSA with e=3 Breaks on Stereotyped Messages

In the RSA cryptosystem, the public key is the pair `(N, e)`. To minimize the CPU cost of encryption and signature verification, early implementations often chose the smallest workable public exponent, `e = 3`. That choice drastically cuts computation — but it walks a razor-thin line: without correct padding, a low exponent invites devastating algebraic attacks, most notably Coppersmith's theorem.

## The Core Problem: The Algebra of Low Exponents

RSA encryption is `C ≡ M^e mod N`. When `e = 3`, this is `C ≡ M^3 mod N`.

If the message `M` is small enough that `M^3 < N`, the modulo operation never actually wraps around — encryption degenerates into ordinary integer arithmetic, and an attacker recovers `M` by simply taking the real-number cube root of `C`. Even once `M` is padded so `M^3 > N` (defeating this trivial case), low exponents remain highly vulnerable to two more sophisticated classes of attack.

## Mental Model: The Stereotyped Message

Imagine a system that encrypts daily reports, every one beginning with an identical, predictable header: `"CONFIDENTIAL DAILY REPORT: [Secret_Data]"`. If an attacker already knows 90% of the plaintext (the fixed header), they only need to recover the remaining unknown fraction. Coppersmith's theorem proves that a polynomial equation modulo `N` with a sufficiently small root can be found efficiently — and when `e = 3`, the threshold for "small enough" is remarkably forgiving.

## Håstad's Broadcast Attack

Before reaching for Coppersmith's full machinery, consider the simpler **Håstad's Broadcast Attack**. Suppose a sender encrypts the *identical* message `M` (with no random padding) to three different receivers, using three different moduli `N1, N2, N3` but the same `e = 3`:

```
C1 ≡ M^3 (mod N1)
C2 ≡ M^3 (mod N2)
C3 ≡ M^3 (mod N3)
```

Using the Chinese Remainder Theorem, an attacker combines all three congruences into one:

```
C_crt ≡ M^3 (mod N1 × N2 × N3)
```

Because `M < N_i` for every modulus, `M^3` is guaranteed to be smaller than the product `N1 × N2 × N3` — so the modulo operation drops away entirely, and the attacker recovers `M` by taking the *integer* cube root of `C_crt` directly.

## Coppersmith's Attack on Stereotyped Messages

Coppersmith's attack is far more general than Håstad's. It uses the **Lenstra–Lenstra–Lovász (LLL)** lattice basis reduction algorithm to prove: for a monic polynomial `f(x)` of degree `d` modulo `N`, all roots `x0` satisfying `|x0| < N^(1/d)` can be found efficiently.

With `e = 3`, the degree `d = 3`. An attacker can therefore recover the unknown portion of a message whenever that unknown portion is smaller than `N^(1/3)`. For a standard 2048-bit RSA modulus, `N^(1/3)` is roughly 682 bits — about 85 bytes. If a secret value (an API key, a session token) is 85 bytes or less and the surrounding message structure is known, `e = 3` is completely broken for it, no padding-oracle interaction required — this is a pure offline algebraic attack against a single captured ciphertext.

### Code Demonstration: SageMath

SageMath, a Python-based computer algebra system, ships Coppersmith's method built in via `.small_roots()`:

```python
# SageMath Script: Coppersmith Stereotyped Message Attack
# Assume a 2048-bit N, e=3
N = 189...  # 2048-bit modulus
e = 3
C = 456...  # Intercepted ciphertext

# Known stereotyped prefix, e.g. an API response format
known_prefix = b"API_KEY="
# Shift the known prefix left to leave room for the unknown 32-byte secret
# 32 bytes = 256 bits
shifted_prefix = int.from_bytes(known_prefix, 'big') << 256

# Construct the polynomial: f(x) = (shifted_prefix + x)^3 - C = 0 mod N
P.<x> = PolynomialRing(Zmod(N))
f = (shifted_prefix + x)^3 - C

# Coppersmith's method finds the root x (the unknown secret)
# epsilon tunes the LLL lattice dimension/precision trade-off
roots = f.small_roots(epsilon=0.03)

if roots:
    secret_int = roots[0]
    print("Recovered Secret:", int(secret_int).to_bytes(32, 'big'))
```

## The Mitigation: OAEP Padding and e=65537

The cryptography community closed this attack class with two changes, both now universal:

1. **Mandatory OAEP padding.** Optimal Asymmetric Encryption Padding introduces strong, randomized padding on every plaintext, guaranteeing `M` is never stereotyped or identical across multiple broadcasts — see the companion article on RSA-OAEP for the full construction.
2. **Standardizing on e=65537.** The value `2^16 + 1` is now the near-universal default public exponent. It's large enough that Coppersmith's and Håstad's attacks become computationally infeasible against it, while its binary representation (`10000000000000001`) has only two `1` bits — keeping square-and-multiply exponentiation nearly as fast as the `e=3` case it replaced.
