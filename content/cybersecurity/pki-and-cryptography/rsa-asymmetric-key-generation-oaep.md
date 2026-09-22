---
title: "RSA Key Generation: Prime Factorization, OAEP Padding, and the Quantum Threat"
description: "How RSA solves the symmetric key distribution problem using prime factorization, why textbook RSA is insecure, and a working Python implementation using RSA-OAEP padding."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "rsa"
  - "asymmetric-cryptography"
  - "public-key-infrastructure"
  - "oaep-padding"
  - "post-quantum-cryptography"
---

# RSA Key Generation: Prime Factorization, OAEP Padding, and the Quantum Threat

## The Problem: The Key Distribution Paradox

For most of cryptographic history, encryption relied entirely on symmetric keys: the sender and receiver both needed the exact same secret key to encrypt and decrypt. That created an impossible chicken-and-egg problem. If Alice and Bob are on opposite sides of the world and every network they can use is monitored, how does Alice get Bob the symmetric key in the first place? Send it in plaintext, and an eavesdropper simply copies it. Encrypt it first, and Bob can't decrypt it — he doesn't have the key yet, and that's exactly the problem you're trying to solve.

In 1977, Rivest, Shamir, and Adleman solved this with **RSA**, the first practical asymmetric algorithm. Instead of one shared secret, RSA generates a mathematically linked *pair*: a **public key** that anyone can use to encrypt, and a **private key**, held by exactly one party, that alone can decrypt. Alice can broadcast her public key to the entire internet. Anyone can use it to lock a message to her; only she can unlock it.

## Mental Model: The Open Padlock

Alice manufactures a specific style of padlock. She distributes hundreds of them, already unlocked, to anyone who wants one — but keeps the one physical key to herself. When Bob wants to send Alice a secret, he puts it in a box, snaps one of Alice's open padlocks shut on it, and mails the box. The moment it clicks shut, not even Bob can open it again. Only Alice, holding the one key that fits every padlock she distributed, can open it on the other end.

## The Mathematics: Prime Factorization

RSA's security rests on the **integer factorization problem**: multiplying two large primes together is computationally trivial, but given only the product, recovering the two original primes is (with sufficiently large primes) practically infeasible for classical computers.

Key generation follows this sequence:

1. **Prime selection.** Choose two distinct, large prime numbers $p$ and $q$ — typically 2048 bits each for a 4096-bit key.
2. **Compute the modulus** $n = p \times q$. This value is public and determines the key size (e.g., RSA-4096 means $n$ is 4096 bits).
3. **Compute Euler's totient** $\phi(n) = (p-1)(q-1)$ — the count of integers less than $n$ that are coprime to it.
4. **Choose the public exponent** $e$, satisfying $1 < e < \phi(n)$ and $\gcd(e, \phi(n)) = 1$. In practice $e$ is almost universally `65537` ($2^{16}+1$), chosen for fast, well-understood encryption performance.
5. **Compute the private exponent** $d$, the modular multiplicative inverse of $e$ mod $\phi(n)$:
   $$d \equiv e^{-1} \pmod{\phi(n)}$$

The **public key** is $(n, e)$; the **private key** is $(n, d)$. To encrypt message $m$: $c \equiv m^e \pmod n$. To decrypt: $m \equiv c^d \pmod n$.

## Why "Textbook RSA" Is Never Used in Production

The formula above — raw modular exponentiation with no padding — is called **textbook RSA**, and it's dangerously insecure on its own for two reasons:

- **It's deterministic.** Encrypting the same plaintext with the same public key always produces the exact same ciphertext. An attacker who suspects a message is one of a small set of possibilities (e.g., "yes" or "no", or a known dollar amount) can simply encrypt each candidate and compare against the intercepted ciphertext.
- **It's malleable.** Textbook RSA has predictable algebraic structure that allows chosen-ciphertext attacks against poorly designed protocols.

The fix is **RSA-OAEP (Optimal Asymmetric Encryption Padding)**, which injects structured randomness and a hash-based Feistel construction into the plaintext before the modular exponentiation. OAEP ensures encrypting the same message a thousand times produces a thousand different ciphertexts, and closes the malleability gap that plain textbook RSA leaves open.

## Code: RSA Key Generation and OAEP Encryption in Python

```python
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes

# 1. Generate the RSA private key (internally derives p, q, d)
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=4096,
)

# 2. Derive the public key (n, e) from the private key
public_key = private_key.public_key()

# 3. Encrypt using the public key with OAEP padding — never use raw/textbook RSA
message = b"Highly confidential API payload."
ciphertext = public_key.encrypt(
    message,
    padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None,
    ),
)

# 4. Decrypt using the private key with matching OAEP parameters
plaintext = private_key.decrypt(
    ciphertext,
    padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None,
    ),
)

assert message == plaintext
print("Decryption verified:", plaintext.decode())
```

Never implement the big-integer arithmetic or OAEP padding scheme yourself — subtle timing differences or padding-check mistakes in a hand-rolled implementation are exactly how real-world RSA padding oracle attacks (like Bleichenbacher's attack against PKCS#1 v1.5) have historically been found. Always use an audited library.

## Why RSA Rarely Encrypts Bulk Data

RSA's modular exponentiation is orders of magnitude slower than symmetric ciphers like AES. In practice, RSA is almost never used to encrypt an entire message directly. Instead, it encrypts a short, randomly generated symmetric key (a "key exchange"), and that symmetric key does the actual bulk encryption with AES-GCM or ChaCha20-Poly1305. This is exactly the pattern TLS handshakes and hybrid encryption schemes use throughout modern PKI.

## The Quantum Threat

RSA's security assumption — that factoring the product of two large primes is computationally hard — holds firmly against classical computers. It does **not** hold against a sufficiently powerful quantum computer. Peter Shor's algorithm factors large integers in polynomial time on a quantum computer, which would break RSA-2048 and RSA-4096 outright once cryptographically relevant quantum computers (CRQCs) exist. This is why the cryptographic community is actively migrating toward **post-quantum cryptography (PQC)** — lattice-based algorithms like Kyber (now standardized as ML-KEM) are being deployed alongside or in place of RSA specifically to hedge against this future.

## Key Takeaways

- RSA solves the symmetric key distribution paradox by splitting encryption and decryption capability between a public and a private key, linked through the integer factorization problem.
- Textbook RSA (raw modular exponentiation) is deterministic and malleable — never use it directly; always pad with RSA-OAEP.
- RSA is computationally expensive relative to symmetric ciphers, so production systems use it to exchange a symmetric session key, not to encrypt bulk data directly.
- RSA's security model is fundamentally at risk from cryptographically relevant quantum computers via Shor's algorithm, driving the industry's migration toward post-quantum, lattice-based alternatives.
