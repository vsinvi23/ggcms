---
title: "RSA-OAEP Padding: Fixing Textbook RSA's Malleability and Determinism"
description: "Why textbook RSA and PKCS#1 v1.5 padding are insecure in practice, how OAEP's Feistel-network masking eliminates malleability and formatting-oracle leaks, and a production-ready Go implementation using crypto/rsa with domain-binding labels."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "rsa"
  - "oaep"
  - "asymmetric-cryptography"
  - "pkcs1"
  - "golang-crypto"
  - "euler-totient"
---

# RSA-OAEP Padding: Fixing Textbook RSA's Malleability and Determinism

## The Problem: The Insecurity of "Textbook" RSA and PKCS#1 v1.5

Textbook RSA encryption, `C = M^e mod N`, is mathematically elegant but catastrophically insecure in practical use:

1. **Deterministic encryption.** Encrypting the same message twice produces identical ciphertext, letting an eavesdropper run dictionary-matching attacks against low-entropy payloads (a "YES"/"NO" response, a small enumerable set of possible values).
2. **Malleability.** Given `C1 = M1^e mod N` and `C2 = M2^e mod N`, an attacker computes `C_mall = C1 · C2 mod N`, which decrypts to `M1 · M2` — a plaintext the attacker chose the relationship of, without ever touching the private key.
3. **Bleichenbacher padding oracles.** Early standards patched textbook RSA with **PKCS#1 v1.5 padding**, but that padding's rigid `0x00 0x02 ...` structure leaks, through server error messages or timing, whether a decrypted block was correctly formatted. An adaptive attacker who can query that oracle roughly `2^20` times can fully decrypt a ciphertext without the private key (see the companion article on Bleichenbacher's attack).

To achieve semantic security (IND-CCA2 resistance), RSA encryption must be wrapped in a probabilistic padding scheme — **Optimal Asymmetric Encryption Padding (OAEP)**.

## Mathematical Foundations

### RSA Key Generation

1. Select two large, distinct secret primes `p` and `q`.
2. Compute the modulus: `N = p · q`.
3. Compute the Euler totient: `φ(N) = (p-1)(q-1)`.
4. Choose a public exponent `e` (conventionally `65537 = 2^16 + 1`) such that `1 < e < φ(N)` and `gcd(e, φ(N)) = 1`.
5. Compute the private exponent via the Extended Euclidean Algorithm: `d ≡ e^-1 mod φ(N)`.

The public key is `(e, N)`; the private key is `(d, N)`. Security rests entirely on the hardness of factoring `N` back into `p` and `q`.

### OAEP: A Feistel Network Before the Modular Exponentiation

OAEP runs a two-round Feistel network using a hash function `H` and a Mask Generation Function (`MGF1`) to turn the deterministic plaintext into pseudo-random-looking data *before* it's ever raised to the power `e`.

```text
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

Because the random seed feeds into `MGF1` twice — masking the data block, and then (via the masked data block) masking itself — every bit of the final encoded message `EM` depends on every bit of both the plaintext and the fresh random seed. That eliminates both the homomorphic malleability of textbook RSA and the rigid, checkable structure that PKCS#1 v1.5 exposed to Bleichenbacher-style oracles.

## Implementation: Secure RSA-OAEP in Go

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
	// 2048-bit is the current practical floor; 4096-bit is preferred
	// for long-term secrets and root-level keys.
	priv, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key: %w", err)
	}
	return &RSACipher{privateKey: priv}, nil
}

// EncryptOAEP encrypts plaintext using SHA-256-based OAEP padding and an
// optional domain-binding label.
func (r *RSACipher) EncryptOAEP(plaintext []byte, label []byte) ([]byte, error) {
	pubKey := &r.privateKey.PublicKey
	hashEngine := sha256.New()

	// rand.Reader supplies the random seed that makes every ciphertext
	// different, even for identical plaintext — this is what removes
	// textbook RSA's determinism.
	ciphertext, err := rsa.EncryptOAEP(hashEngine, rand.Reader, pubKey, plaintext, label)
	if err != nil {
		return nil, fmt.Errorf("encryption failure: %w", err)
	}
	return ciphertext, nil
}

// DecryptOAEP decrypts ciphertext using the matching private key, hash
// engine, and label.
func (r *RSACipher) DecryptOAEP(ciphertext []byte, label []byte) ([]byte, error) {
	hashEngine := sha256.New()

	// Any modification to the ciphertext, or a mismatched label, produces
	// a single generic error — Go's crypto/rsa deliberately avoids leaking
	// *why* decryption failed, closing off padding-oracle style probing.
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
	// Domain-binding labels tie ciphertext to a specific semantic context,
	// so it can't be replayed into a different API/protocol step.
	bindingLabel := []byte("payment-api-context")

	// 1. Encrypt payload
	ciphertext, err := cipherEngine.EncryptOAEP(payload, bindingLabel)
	if err != nil {
		log.Fatalf("Encryption failed: %v", err)
	}
	fmt.Printf("Ciphertext Length: %d bytes\n", len(ciphertext))
	fmt.Printf("Ciphertext (Hex truncated): %x...\n", ciphertext[:40])

	// 2. Decrypt payload successfully
	decrypted, err := cipherEngine.DecryptOAEP(ciphertext, bindingLabel)
	if err != nil {
		log.Fatalf("Decryption failed: %v", err)
	}
	fmt.Printf("Decrypted Plaintext: %s\n", string(decrypted))

	// 3. Decryption fails cleanly if the binding label is altered
	_, err = cipherEngine.DecryptOAEP(ciphertext, []byte("different-malicious-context"))
	if err != nil {
		fmt.Printf("Rejection verified with wrong label: %v\n", err)
	}
}
```

## Defensive Engineering Best Practices

1. **Never use PKCS#1 v1.5 padding for new systems.** Ban it from configuration entirely; ensure APIs enforce RSA-OAEP by default rather than accepting a caller-chosen padding scheme.
2. **Verify modulus size.** Use a minimum of 3072-bit keys; prefer 4096-bit for root Certificate Authorities or any key expected to remain active past 2030.
3. **Use OAEP's `label` parameter for domain binding.** Tying a ciphertext to a specific protocol step, transaction ID, or service URL prevents an attacker from replaying a validly-decryptable ciphertext into a different context than the one it was created for.
4. **Never expose why decryption failed.** A generic decryption error, as shown above, is the correct behavior — surfacing "invalid padding" versus "invalid label" versus "invalid ciphertext length" reintroduces exactly the kind of oracle OAEP was designed to close.
