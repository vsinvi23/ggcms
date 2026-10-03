---
title: "Fully Homomorphic Encryption (FHE): Computing on Encrypted Data"
description: "How FHE lets an untrusted server compute directly on ciphertext, the Learning With Errors math and noise growth behind it, and how Gentry's bootstrapping breakthrough made unlimited computation possible."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "homomorphic-encryption"
  - "fhe"
  - "learning-with-errors"
  - "bootstrapping"
  - "lattice-cryptography"
---

# Fully Homomorphic Encryption (FHE): Computing on Encrypted Data

## The Problem: The Data Privacy Paradox in Cloud Computing

Traditional encryption protects data at rest (stored on a hard drive) and data in transit (moving over a network). However, when you want a cloud service to actually process your data — such as running a machine learning model on confidential medical records, or querying an encrypted financial database — you historically had to hand over the decryption key. The server decrypts the data, computes on the plaintext in memory, and then re-encrypts the result.

This creates a privacy paradox: you cannot leverage cloud computation without sacrificing data confidentiality. If the server is compromised by hackers, or the cloud provider itself is malicious, your plaintext data is fully exposed.

## The Solution: Fully Homomorphic Encryption (FHE)

Fully Homomorphic Encryption (FHE) is widely considered the "holy grail" of cryptography. It allows a third party to perform arbitrary mathematical operations directly on ciphertext, yielding a completely encrypted result. When the data owner downloads and decrypts this result, it perfectly matches the output of the operations had they been performed directly on the plaintext.

At no point does the cloud server see the decryption key, nor does it ever see the plaintext data.

## Mental Model: The Locked Glove Box

Imagine you have a block of gold you want a master jeweler to shape into a ring, but you do not trust the jeweler not to steal it. You place the gold in a heavy locked box that has built-in, flexible gloves reaching inside. You lock the box and keep the only key.

The jeweler can put their hands into the gloves, manipulate the gold inside the box, and shape it into a ring without ever being able to take the gold out or unlock the box. Finally, they return the locked box to you, and you use your key to retrieve the finished ring.

In FHE, the "box" is the encryption scheme, the "gloves" are homomorphic addition and multiplication operations, and the "jeweler" is the cloud server.

## Technical Details: LWE and Noise

Modern FHE schemes, such as BGV (Brakerski-Gentry-Vaikuntanathan) or CKKS (Cheon-Kim-Kim-Song), are largely based on the **Learning With Errors (LWE)** problem derived from lattice cryptography.

LWE relies on the mathematical fact that solving systems of linear equations is easy, but solving them when a very small amount of random "noise" or error is added becomes extremely difficult, even for quantum computers.

In an FHE scheme, encrypting a bit `m` involves hiding it within this mathematical noise. A simplified encryption equation looks like:

$$C = (A \cdot S + e + m) \pmod q$$

Where:

- $A$ is a random matrix (the public key component).
- $S$ is the secret key.
- $e$ is the small random error/noise.
- $m$ is the message (plaintext).
- $q$ is a large modulus.

### The Homomorphism: Addition and Multiplication

If you have two ciphertexts, $C_1$ and $C_2$, you can add them together directly:

$$C_1 + C_2 = A \cdot S + (e_1 + e_2) + (m_1 + m_2)$$

The result is a valid ciphertext that encrypts the sum $(m_1 + m_2)$. Notice, however, that the noise $(e_1 + e_2)$ has grown.

Multiplication is also mathematically possible on ciphertexts, but it causes the noise to grow exponentially faster. If the internal noise grows too large, it wraps around the modulus $q$ and permanently destroys the message, making decryption impossible.

```text
Fresh ciphertext:     noise = small        [safe to decrypt]
After +:              noise = e1 + e2      [still safe]
After * once:         noise = grows fast   [getting risky]
After * many times:   noise > threshold    [decryption fails — message destroyed]
                                │
                                ▼
                    Without bootstrapping, this ceiling limits you
                    to a fixed "leveled" multiplicative depth.
```

### Bootstrapping: The Gentry Breakthrough

For a long time, cryptographers only had Partially Homomorphic Encryption (PHE) — schemes that supported either addition (like RSA) or multiplication, but not both indefinitely.

In 2009, Craig Gentry solved the noise explosion problem through an ingenious technique called **bootstrapping**. Bootstrapping evaluates the FHE scheme's own decryption circuit homomorphically. Before the noise grows too large, the server takes the "noisy" ciphertext, encrypts it *again* (forming a double encryption), and runs the decryption algorithm on the inner layer using an encrypted version of the secret key. This produces a "fresh" ciphertext with reset, low noise, encrypting the exact same plaintext. This allows for an unlimited depth of computation, making the scheme *fully* homomorphic.

## Practical Implementation: Microsoft SEAL

Developers do not need to implement complex lattice math by hand. Libraries like Microsoft SEAL provide robust APIs for FHE.

```cpp
// Conceptual C++ using Microsoft SEAL for CKKS (real-number arithmetic)
#include "seal/seal.h"

using namespace seal;

// 1. Setup context and keys
EncryptionParameters parms(scheme_type::ckks);
// ... parameter setup ...
SEALContext context(parms);
KeyGenerator keygen(context);
auto secret_key = keygen.secret_key();
PublicKey public_key;
keygen.create_public_key(public_key);

Encryptor encryptor(context, public_key);
Evaluator evaluator(context);
Decryptor decryptor(context, secret_key);

// 2. Encrypt data on the client
Plaintext plain1("5.0"), plain2("7.0");
Ciphertext encrypted1, encrypted2;
encryptor.encrypt(plain1, encrypted1);
encryptor.encrypt(plain2, encrypted2);

// 3. Compute homomorphically on the untrusted server (no secret key needed!)
Ciphertext encrypted_result;
evaluator.add(encrypted1, encrypted2, encrypted_result); // encrypted_result holds 12.0
evaluator.multiply_inplace(encrypted_result, encrypted1); // (5+7) * 5 = 60.0

// 4. Decrypt result on the client
Plaintext plain_result;
decryptor.decrypt(encrypted_result, plain_result);
```

For a deeper look at how SEAL's two production schemes (BFV for exact integers, CKKS for approximate floating point) differ and how to choose between them, see the companion guide on Microsoft SEAL BFV/CKKS implementations.

## Summary

Fully Homomorphic Encryption shifts the paradigm of cloud security from "trusting the provider" to relying on "mathematical proof of privacy." While the computational overhead of FHE is currently high — often thousands of times slower than plaintext computation — rapid advancements in algorithms and dedicated hardware accelerators are bringing it closer to practical, everyday use for privacy-preserving machine learning and secure cloud database queries.
