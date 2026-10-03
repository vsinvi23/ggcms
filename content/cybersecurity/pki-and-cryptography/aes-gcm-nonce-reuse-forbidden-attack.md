---
title: "AES-GCM Nonce Reuse: The Forbidden Attack and How to Prevent It"
description: "Why reusing a single 96-bit AES-GCM nonce collapses both confidentiality and authentication, the math behind the Joux forbidden attack, and safe Go patterns for nonce generation and key rotation."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "aes-gcm"
  - "nonce-reuse"
  - "aead"
  - "ghash"
  - "forbidden-attack"
  - "key-rotation"
  - "golang-cryptography"
---

# AES-GCM Nonce Reuse: The Forbidden Attack and How to Prevent It

## The Problem: A Single Repeated 12 Bytes Breaks Everything

AES-GCM (Galois/Counter Mode) is the default Authenticated Encryption with Associated Data (AEAD) cipher behind TLS 1.3, SSH, and IPsec. It gives you confidentiality (via CTR-mode encryption) and integrity (via GHASH authentication) in one operation. It also has one absolute rule that, if violated even once, destroys both properties for every message ever encrypted under that key: **never reuse a nonce.**

This isn't a "weakens security" bug like a short key — it's catastrophic and total. If a single 96-bit nonce is reused just once under the same AES key:

1. **Confidentiality collapses.** AES-GCM's encryption is CTR mode: `ciphertext = keystream XOR plaintext`, where the keystream is derived purely from the key and nonce. Reuse the nonce and you reuse the *exact same keystream*. Two ciphertexts encrypted under the same (key, nonce) pair let an attacker compute:
   $$C_1 \oplus C_2 = (K_1 \oplus M_1) \oplus (K_1 \oplus M_2) = M_1 \oplus M_2$$
   The keystream cancels out entirely, leaving the XOR of the two plaintexts — from which classical frequency analysis and crib-dragging can recover both messages.

2. **Integrity collapses completely — the "Forbidden Attack."** GCM's authentication tag is computed by evaluating a polynomial over $GF(2^{128})$ using a secret subkey $H = E_K(0)$. If an attacker observes two distinct messages authenticated under the same key and nonce, they get two equations in the single unknown $H$. Solving that system recovers $H$ directly. Once $H$ is known, the attacker can **forge a valid authentication tag for any ciphertext they want** — not just replay old traffic, but construct entirely new, cryptographically "valid" messages the recipient will accept.

## How AES-GCM Actually Works

```
                    +-----------------------------+
                    |          96-bit Nonce       |
                    +--------------+--------------+
                                   |
                                   v  (append 32-bit counter)
                    +--------------+--------------+
                    |        Initial Counter      |
                    +-------+--------------+------+
                            |              |
                    +-------v------+       +-------v------+
                    |  Counter + 1 |       |  Counter + 2 |
                    +-------+------+       +-------+------+
                            | (AES)                | (AES)
                            v                      v
   +-----------+    +-------+------+       +-------+------+
   | Plaintext |--->|     XOR      |       |     XOR      |<--- [Plaintext 2]
   +-----------+    +-------+------+       +-------+------+
                            |                      |
                            v                      v
                    +-------+------+       +-------+------+
                    | Ciphertext 1 |       | Ciphertext 2 |
                    +-------+------+       +-------+------+
                            |                      |
                            +-----------+----------+
                                        | (accumulated in GF(2^128) using H)
                                        v
                            +----------------------+
                            |  GHASH accumulator   | ---> [16-byte auth tag]
                            +----------------------+
```

If the nonce is identical across two encryption calls, the `Counter + N` inputs to AES are identical, which means the keystream blocks are identical — directly leaking the plaintext relationship above — and the GHASH accumulation over both messages shares the same $H$, setting up the equations that leak $H$ itself.

## Secure Go Implementation: Random Nonces Done Right

The safest default is a cryptographically random 96-bit nonce generated fresh for every single encryption, never reused, never derived from a counter you can't strictly guarantee is monotonic and persistent across restarts and replicas.

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
	"log"
)

// SecureEncryptor wraps a single AES-256 key. In production, load this
// from a KMS/HSM rather than generating it locally.
type SecureEncryptor struct {
	key [32]byte
}

func NewSecureEncryptor() (*SecureEncryptor, error) {
	var enc SecureEncryptor
	if _, err := io.ReadFull(rand.Reader, enc.key[:]); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}
	return &enc, nil
}

// Encrypt seals plaintext with AES-256-GCM using a fresh random 96-bit nonce.
// The nonce is prepended to the output so Decrypt can recover it.
func (e *SecureEncryptor) Encrypt(plaintext, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(e.key[:])
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// MUST be a fresh CSPRNG value every single call — never a counter
	// unless that counter is guaranteed unique and persistent across
	// process restarts and every replica sharing this key.
	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Seal(dst, nonce, plaintext, aad) appends ciphertext+tag to dst.
	// Passing nonce as dst prepends it to the output for transit.
	ciphertext := gcm.Seal(nonce, nonce, plaintext, aad)
	return ciphertext, nil
}

// Decrypt splits the nonce back off and verifies + decrypts in one call.
func (e *SecureEncryptor) Decrypt(payload, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(e.key[:])
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(payload) < nonceSize {
		return nil, fmt.Errorf("payload too short to contain a nonce")
	}
	nonce, ciphertext := payload[:nonceSize], payload[nonceSize:]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		// Deliberately vague: never reveal *why* verification failed.
		return nil, fmt.Errorf("decryption failed: payload tampered or wrong key")
	}
	return plaintext, nil
}

func main() {
	encryptor, err := NewSecureEncryptor()
	if err != nil {
		log.Fatalf("init failed: %v", err)
	}

	secretMessage := []byte("high-value-financial-transaction-payload")
	associatedData := []byte("recipient=service-02")

	payload, err := encryptor.Encrypt(secretMessage, associatedData)
	if err != nil {
		log.Fatalf("encryption failed: %v", err)
	}
	fmt.Printf("Encrypted payload (hex): %x\n", payload)

	plaintext, err := encryptor.Decrypt(payload, associatedData)
	if err != nil {
		log.Fatalf("decryption failed: %v", err)
	}
	fmt.Printf("Decrypted: %s\n", plaintext)
}
```

## When Random Nonces Aren't Enough: AES-GCM-SIV

Random 96-bit nonces are safe *in theory* only up to the birthday bound: after roughly $2^{32}$ messages encrypted under one key, the probability of an accidental nonce collision becomes non-negligible. In practice this becomes a real risk in environments where:

- Many short-lived containers or serverless functions share the same encryption key but cannot coordinate a persistent, strictly-increasing counter across replicas.
- A system has no reliable source of entropy at the exact moment of encryption (rare, but happens on constrained embedded hardware).

**AES-GCM-SIV (RFC 8452)** solves this by deriving the nonce input to the cipher *deterministically* from a hash of the key and the plaintext itself, rather than from an external random source. Encrypting the same message twice with the same key produces the same ciphertext (a controlled, documented trade-off), but even if the *caller* accidentally reuses the same external nonce input, the internal construction resists the confidentiality and integrity collapse that standard GCM suffers. Go's standard library does not include GCM-SIV; use a vetted, actively maintained third-party implementation rather than hand-rolling the polynomial construction yourself.

## Defensive Engineering Checklist

1. **Never use a non-cryptographic PRNG for nonces.** `math/rand` in Go, or `random` in Python, must never touch nonce generation — only a CSPRNG (`crypto/rand`, `/dev/urandom`) is acceptable.
2. **Never derive nonces from wall-clock time or request counters** unless that counter is provably unique and durable across every process and replica sharing the key — a counter that resets on restart is a nonce-reuse bug waiting to happen.
3. **Prefer AES-GCM-SIV in stateless, horizontally-scaled environments** (serverless, ephemeral containers) where uniqueness can't be strictly guaranteed.
4. **Rotate keys well before the birthday-bound limit.** For a 96-bit random nonce, treat roughly $2^{32}$ encryptions under a single key as the practical ceiling and rotate automatically before reaching it.
5. **Log and alert on GCM authentication failures.** A spike in `Open()` errors can indicate an active tampering attempt, not just a bug.

## Key Takeaways

- AES-GCM's entire security model depends on nonce uniqueness per key; reuse breaks confidentiality (via keystream reuse) *and* integrity (via the Joux forbidden attack recovering the GHASH subkey $H$).
- A single reused nonce is enough to forge arbitrary future ciphertexts under that key — this is not a gradual weakening, it's total compromise of authentication.
- Random 96-bit nonces from a CSPRNG are the correct default; counters are only safe with guaranteed, durable uniqueness.
- AES-GCM-SIV exists specifically for environments — stateless microservices, ephemeral compute — where that guarantee is hard to make.
