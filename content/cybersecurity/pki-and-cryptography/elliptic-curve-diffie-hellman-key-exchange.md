---
title: "Elliptic Curve Diffie-Hellman (ECDH): Mathematical Proofs and Key Agreement"
description: "How ECDH lets two parties agree on a shared secret over a monitored channel, why point multiplication makes it secure, and how to implement ECDHE with forward secrecy in Python."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "ecdh"
  - "diffie-hellman"
  - "key-agreement"
  - "elliptic-curve-cryptography"
  - "forward-secrecy"
  - "tls"
---

# Elliptic Curve Diffie-Hellman (ECDH): Mathematical Proofs and Key Agreement

## The Problem: Secure Key Exchange Over Monitored Channels

Imagine you and a remote party want to establish a secure encrypted channel, but every packet you send over the internet is being intercepted and recorded by an adversary. How can you both agree on a shared symmetric encryption key (like an AES-256 key) if you cannot securely send it to each other?

This paradox — establishing a shared secret over an inherently insecure medium — is the problem solved by key agreement protocols. For decades, classical Diffie-Hellman (DH), based on modular exponentiation over large prime fields, solved this. However, traditional DH requires massive key sizes (2048-bit or 4096-bit) to remain secure against modern cryptanalysis, making it computationally heavy and bandwidth-intensive.

The solution is **Elliptic Curve Diffie-Hellman (ECDH)**, which achieves the same mathematical guarantee using a completely different algebraic structure, requiring drastically smaller key sizes (e.g., 256 bits).

## The Mental Model: Mixing Paints (with Math)

The classic analogy for Diffie-Hellman is mixing paint. You and your partner agree on a common base color (yellow). You each pick a secret color — Alice picks red, Bob picks blue. You mix your secret with the base color and exchange the mixtures:

- Alice sends (Yellow + Red).
- Bob sends (Yellow + Blue).

Then you mix your own secret color into the mixture you received:

- Alice calculates: (Yellow + Blue) + Red.
- Bob calculates: (Yellow + Red) + Blue.

Both end up with the exact same muddy brown color — the shared key. The adversary, watching the channel, only saw the base color and the initial mixtures, but it is mathematically impossible to "un-mix" the paint to discover the secret colors.

## The Deep Dive: The Mathematics of Elliptic Curves

Instead of paint, ECDH uses points on an algebraic curve. An elliptic curve is defined by the Weierstrass equation:

$$y^2 = x^3 + ax + b \pmod p$$

In elliptic curve cryptography, we define a "generator point" ($G$) on the curve — our base paint. The core operation is **point multiplication**: adding a point to itself $d$ times, denoted $Q = d \times G$.

Because of the geometric properties of the curve, given $d$ and $G$ it is trivial to compute $Q$. However, given $Q$ and $G$, it is computationally infeasible to recover $d$. This is the **Elliptic Curve Discrete Logarithm Problem (ECDLP)**.

The ECDH protocol flow:

1. **Global parameters.** Alice and Bob agree on a curve (e.g., NIST P-256 or Curve25519) and its generator point $G$.
2. **Key generation.**
   - Alice chooses a random integer $d_A$ (her private key) and computes $Q_A = d_A \times G$ (her public key).
   - Bob chooses a random integer $d_B$ (his private key) and computes $Q_B = d_B \times G$ (his public key).
3. **The exchange.** Alice sends Bob $Q_A$; Bob sends Alice $Q_B$.
4. **The agreement.**
   - Alice calculates the shared point $S = d_A \times Q_B$.
   - Bob calculates the shared point $S = d_B \times Q_A$.

## The Mathematical Proof

Why do Alice and Bob arrive at the exact same point $S$? Substituting the public key definitions into the agreement formulas:

- Alice computes: $S = d_A \times (d_B \times G)$
- Bob computes: $S = d_B \times (d_A \times G)$

Because point multiplication on an elliptic curve is commutative (order does not matter), $d_A \times d_B \times G$ equals $d_B \times d_A \times G$. Both parties compute the exact same (X, Y) coordinate on the curve. The X-coordinate is then passed through a Key Derivation Function (KDF) such as HKDF to produce the symmetric AES key.

```text
       Alice                                                    Bob
   (Private: dA)                                            (Private: dB)
         |                                                        |
   Compute Public:                                          Compute Public:
   QA = dA * G                                              QB = dB * G
         |                                                        |
         +------------------- Exchange Public Keys -------------->|
         |<----------------------- QB / QA -----------------------+
         |                                                        |
   Compute Shared Secret:                                   Compute Shared Secret:
   S = dA * QB = dA * (dB * G)                              S = dB * QA = dB * (dA * G)
         |                                                        |
         v                                                        v
                       Both arrive at S = (dA * dB) * G
```

## Code Example: ECDHE with Forward Secrecy in Python

Implementing ECDH in Python with the `cryptography` library highlights how ephemeral the process should be. In Ephemeral ECDH (ECDHE), keys are generated solely for one session and then destroyed, providing forward secrecy.

```python
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# 1. Generate ephemeral private keys for Alice and Bob
alice_private_key = ec.generate_private_key(ec.SECP256R1())
bob_private_key = ec.generate_private_key(ec.SECP256R1())

# 2. Extract public keys to exchange over the wire
alice_public_key = alice_private_key.public_key()
bob_public_key = bob_private_key.public_key()

# 3. Perform the ECDH key agreement (both sides do this)
alice_shared_point = alice_private_key.exchange(ec.ECDH(), bob_public_key)
bob_shared_point = bob_private_key.exchange(ec.ECDH(), alice_public_key)

# Proof of mathematical equality
assert alice_shared_point == bob_shared_point

# 4. Pass the shared X-coordinate through a KDF to get an AES key
derived_aes_key = HKDF(
    algorithm=hashes.SHA256(),
    length=32,
    salt=None,
    info=b'handshake data',
).derive(alice_shared_point)
```

## Nuance and Attack Vectors

A critical pitfall in ECDH is the **Invalid Curve Attack**. If Bob sends a public key point $Q_B$ that does not actually lie on the agreed curve, he might force Alice to compute a shared secret in a weaker mathematical group, allowing him to easily deduce her private key $d_A$ from her response.

Modern cryptographic libraries perform *point validation* automatically — checking that the received point strictly satisfies $y^2 = x^3 + ax + b \pmod p$ before executing the multiplication. For the deeper mechanics of this attack and a hardened Go implementation, see the companion deep dive on invalid curve attacks.

## Conclusion

ECDH is the bedrock of modern internet privacy, acting as the primary key exchange mechanism in TLS 1.3. By leveraging the geometric complexity of elliptic curves, it provides an efficient, secure method to traverse hostile networks — even if adversaries collect every byte transmitted, they remain mathematically blind to the resulting shared secret.
