# Asymmetric RSA: Prime Factorization, Euler Totient, and RSA-OAEP Padding

## The Problem: The Insecurity of "Textbook" RSA and PKCS#1 v1.5

Textbook RSA encryption ($C = M^e \pmod N$) is mathematically elegant but catastrophically insecure in practical environments:
1.  **Deterministic Nature:** Hashing or encrypting the exact same message twice generates identical ciphertext. This allows active eavesdroppers to perform dictionary matching attacks on low-entropy payloads (such as "YES" or "NO").
2.  **Malleability (Homomorphic Properties):** Given two ciphertexts $C_1 = M_1^e \pmod N$ and $C_2 = M_2^e \pmod N$, an attacker can compute $C_{mall} = C_1 \cdot C_2 \pmod N$, which decrypts to the plaintext $M_1 \cdot M_2$. This permits cipher tampering without ever knowing the private key.
3.  **Bleichenbacher Padding Oracles:** To fix textbook RSA, early standards used **PKCS#1 v1.5 padding**. However, this padding structure leaks whether decrypted blocks conform to correct formatting rules. By measuring server response errors or timing variations, an attacker can decrypt ciphertext using $\approx 2^{20}$ adaptive chosen-ciphertext queries.

To ensure semantic security (IND-CCA2 resistance), RSA must be wrapped in a probabilistic padding scheme, specifically **Optimal Asymmetric Encryption Padding (OAEP)**.

---

## Mathematical Foundations & OAEP Architecture

### The Mathematics of RSA Key Generation
1.  Select two large, distinct secret primes, $p$ and $q$.
2.  Compute the modulus:
    $$N = p \cdot q$$
3.  Compute the Euler Totient of $N$:
    $$\phi(N) = (p-1)(q-1)$$
4.  Choose a public exponent $e$ (typically $65537 = 2^{16} + 1$) such that:
    $$1 < e < \phi(N) \quad \text{and} \quad \gcd(e, \phi(N)) = 1$$
5.  Compute the private exponent $d$ using the Extended Euclidean Algorithm:
    $$d \equiv e^{-1} \pmod{\phi(N)}$$

The public key is $(e, N)$, and the private key is $(d, N)$. Security depends entirely on the hardness of **Integer Factorization** of $N$ to recover $p$ and $q$.

### Optimal Asymmetric Encryption Padding (OAEP)
OAEP implements a two-round Feistel network using symmetric cryptographic hash functions ($H$) and Mask Generation Functions ($\text{MGF1}$).

```
                  +----------------------------+
                  |      Plaintext (M)         |
                  +--------------+-------------+
                                 |
                                 v  (Pad with 0x00...0x01)
                  +--------------+-------------+     +-------------------+
                  |      Data Block (DB)       |     |    Random Seed    |
                  +--------------+-------------+     +---------+---------+
                                 |                             |
                                 | <---+ (XOR) <---+ MGF1 <----+
                                 |     |                       |
                                 v     |                       |
                  +--------------+--+  |                       |
                  |   Masked DB     |--+                       |
                  +--------------+--+                          |
                                 |                             v
                                 +---> MGF1 ---> (XOR) <-------+
                                                   |
                                                   v
                                             +-----+-----+
                                             |Masked Seed|
                                             +-----+-----+
                                                   |
                                                   v
                        Concat: EM = 0x00 || Masked Seed || Masked DB
```

OAEP converts our deterministic input into pseudo-random garbage before mathematical modular exponentiation, eliminating both homomorphic malleability and formatting leak vulnerabilities.

---

## Code Implementation: Secure RSA-OAEP Encryption in Go

The following Go implementation demonstrates secure RSA-OAEP encryption and decryption using a 4096-bit key, SHA-256 for both the hashing engine and MGF1, and an optional domain-binding verification label.

```go
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"fmt"
	"log"
)

type RSACipher struct {
	privateKey *rsa.PrivateKey
}

func NewRSACipher() (*RSACipher, error) {
	// Generate a 4096-bit RSA key pair. 
	// 2048-bit is the absolute minimum, but 4096-bit is preferred for long-term secrets.
	priv, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key: %w", err)
	}
	return &RSACipher{privateKey: priv}, nil
}

// EncryptOAEP encrypts plaintext utilizing SHA-256 based OAEP padding and a domain label
func (r *RSACipher) EncryptOAEP(plaintext []byte, label []byte) ([]byte, error) {
	pubKey := &r.privateKey.PublicKey
	hashEngine := sha256.New()

	// Perform encryption. The rand.Reader ensures probabilistic outputs on every invocation.
	ciphertext, err := rsa.EncryptOAEP(hashEngine, rand.Reader, pubKey, plaintext, label)
	if err != nil {
		return nil, fmt.Errorf("encryption failure: %w", err)
	}
	return ciphertext, nil
}

// DecryptOAEP decrypts ciphertext using the matching private key, hash engine, and label
func (r *RSACipher) DecryptOAEP(ciphertext []byte, label []byte) ([]byte, error) {
	hashEngine := sha256.New()

	// Decrypt using OAEP. Any modification to the ciphertext or mismatch in label
	// will trigger a generic validation error, preventing timing leakage.
	plaintext, err := rsa.DecryptOAEP(hashEngine, rand.Reader, r.privateKey, ciphertext, label)
	if err != nil {
		return nil, fmt.Errorf("decryption failure: %w", err)
	}
	return plaintext, nil
}

func main() {
	cipherEngine, err := NewRSACipher()
	if err != nil {
		log.Fatalf("Init failed: %v", err)
	}

	payload := []byte("confidential-payload-to-be-encrypted")
	// Domain-binding labels ensure ciphertext can only be decrypted in a specific semantic context
	bindingLabel := []byte("payment-api-context")

	// 1. Encrypt Payload
	ciphertext, err := cipherEngine.EncryptOAEP(payload, bindingLabel)
	if err != nil {
		log.Fatalf("Encryption failed: %v", err)
	}
	fmt.Printf("Ciphertext Length: %d bytes\n", len(ciphertext))
	fmt.Printf("Ciphertext (Hex truncated): %x...\n", ciphertext[:40])

	// 2. Decrypt Payload Successfully
	decrypted, err := cipherEngine.DecryptOAEP(ciphertext, bindingLabel)
	if err != nil {
		log.Fatalf("Decryption failed: %v", err)
	}
	fmt.Printf("Decrypted Plaintext: %s\n", string(decrypted))

	// 3. Fail Decryption if binding label is altered
	_, err = cipherEngine.DecryptOAEP(ciphertext, []byte("different-malicious-context"))
	if err != nil {
		fmt.Printf("Rejection Verified with wrong label: %v\n", err)
	}
}
```

---

## Defensive Engineering Best Practices

1.  **Never Use PKCS#1 v1.5 Padding:** Ban PKCS#1 v1.5 padding from all legacy configurations. Ensure that modern APIs enforce RSA-OAEP.
2.  **Verify Modulus Size:** Use modular keys with a minimum length of 3072 bits. 4096-bit keys must be preferred for high-value Root Certificate Authorities or keys expected to remain active past 2030.
3.  **Strict Label Binding:** Leverage the optional `label` parameter in RSA-OAEP. This ties the cipher text to a specific scope (e.g., dynamic protocol step, transaction ID, or service URL), preventing an attacker from reusing ciphertexts in alternate API contexts.
4.  **Avoid Constant Decryption Paths:** If decryption fails, do not throw custom exception messages detailing *why* it failed (e.g., "invalid padding"). Always throw a generic decryption error to avoid side-channel profiling.
