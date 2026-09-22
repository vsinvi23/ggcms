---
title: "AES-GCM Fundamentals: Authenticated Encryption with Associated Data"
description: "Why encryption alone isn't enough, how AES-GCM combines CTR-mode confidentiality with GHASH integrity into a single AEAD primitive, and a working Go implementation."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "aes-gcm"
  - "aead"
  - "authenticated-encryption"
  - "ghash"
  - "golang-cryptography"
---

# AES-GCM Fundamentals: Authenticated Encryption with Associated Data

## The Problem: Encryption Without Integrity Is Dangerous

For years, the default symmetric cipher mode was AES in Cipher Block Chaining (CBC) mode. CBC gives excellent confidentiality — an attacker who intercepts the ciphertext can't read it. But CBC has no built-in way to detect **tampering**. An attacker can flip bits in an intercepted ciphertext and forward the modified version to the server. The server will happily decrypt it into garbled — but not rejected — plaintext, and depending on how the server reacts to the malformed result (a bad-padding error, a parsing failure, a subtly different response time), that reaction itself can leak information back to the attacker one bit at a time. This is exactly the mechanism behind the [padding oracle attacks](aes-cbc-padding-oracle-poodle-lucky13.md) that broke SSLv3 and early TLS.

The lesson: encryption without authentication is not secure by default. You need both **confidentiality** (nobody can read it) and **integrity/authenticity** (nobody can alter it without detection) — a combined property called **Authenticated Encryption with Associated Data (AEAD)**. The dominant AEAD cipher today is **AES-GCM (Galois/Counter Mode)**.

## Mental Model: The Tamper-Evident Envelope

Picture writing a secret letter. Older modes like AES-CBC put the letter in an ordinary envelope: an interceptor can't read it without opening it, but they *can* carefully steam it open, swap a paragraph, reseal it, and send it on — the recipient has no way to know it was altered.

AES-GCM instead seals the letter in a tamper-evident envelope. The moment it's sealed, a unique cryptographic "barcode" is burned into the seal itself. If anyone slices the envelope open, changes a single character, or even smudges the barcode, the seal instantly and visibly fails. The recipient rejects the letter outright, before ever reading a word of it.

## How GCM Works: Two Mechanisms in One Pass

AES-GCM combines two independent cryptographic ideas into a single operation.

### 1. Confidentiality via Counter (CTR) Mode

Instead of chaining blocks together like CBC, CTR mode turns the AES block cipher into a stream cipher. It takes a unique nonce, appends an incrementing counter (`nonce || 1`, `nonce || 2`, ...), and encrypts each of those counter values with the AES key to produce a pseudo-random keystream. That keystream is simply XORed against the plaintext to produce ciphertext. Because each block's keystream depends only on the counter — not on the previous ciphertext block — CTR mode is fully parallelizable, letting modern CPUs (with AES-NI hardware acceleration) encrypt gigabytes per second.

### 2. Integrity via GHASH (Galois Field Multiplication)

As ciphertext is produced, AES-GCM feeds it — along with any unencrypted "Associated Data" that needs to be authenticated but not hidden, such as routing headers — into the **GHASH** function. GHASH treats the input as coefficients of a polynomial evaluated over the finite field $GF(2^{128})$, using a secret subkey $H$ derived from the AES key. The result is reduced to a 16-byte **authentication tag**.

On decryption, the receiver independently recomputes GHASH over the received ciphertext and associated data. If the recomputed tag doesn't match the tag that arrived with the message, the decryption function returns an error and destroys the candidate plaintext — it never hands potentially-tampered data to the application.

## The One Rule That Cannot Be Broken: Nonce Uniqueness

AES-GCM's nonce (typically 96 bits / 12 bytes) must be unique for every single encryption performed under a given key. Reusing a nonce even once is catastrophic — it collapses both confidentiality (via keystream reuse) and integrity (by leaking the GHASH subkey $H$, enabling forged messages). This failure mode — the "Forbidden Attack" — is significant enough to warrant its own deep dive; see *AES-GCM Nonce Reuse: The Forbidden Attack and How to Prevent It* for the full mathematics and safe nonce-generation patterns.

## Code: AES-GCM in Go

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

// encryptGCM encrypts plaintext with AES-256-GCM, generating a fresh
// random nonce and prepending it to the returned ciphertext.
func encryptGCM(plaintext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// A strict, mathematically random 12-byte nonce — never reused.
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Seal encrypts and appends the 16-byte authentication tag.
	// Passing `nonce` as the destination buffer prepends it to the output.
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// decryptGCM verifies the authentication tag and decrypts in one step.
// If the tag is invalid, no plaintext is returned at all.
func decryptGCM(ciphertext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, cipherData := ciphertext[:nonceSize], ciphertext[nonceSize:]

	plaintext, err := gcm.Open(nil, nonce, cipherData, nil)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: payload tampered")
	}
	return plaintext, nil
}

func main() {
	key := make([]byte, 32) // AES-256
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		panic(err)
	}

	plaintext := []byte("transfer $500 to account 44210")
	ciphertext, err := encryptGCM(plaintext, key)
	if err != nil {
		panic(err)
	}
	fmt.Printf("ciphertext (hex): %x\n", ciphertext)

	// Tamper with a single byte to demonstrate the tag failing closed.
	tampered := append([]byte(nil), ciphertext...)
	tampered[len(tampered)-1] ^= 0x01

	if _, err := decryptGCM(tampered, key); err != nil {
		fmt.Println("tampered payload correctly rejected:", err)
	}

	recovered, err := decryptGCM(ciphertext, key)
	if err != nil {
		panic(err)
	}
	fmt.Printf("recovered plaintext: %s\n", recovered)
}
```

## Conclusion

AES-GCM is the default choice for symmetric encryption in modern protocols — mandatory in TLS 1.3, heavily accelerated by AES-NI CPU instructions, and structurally immune to the padding-oracle class of attacks that plagued CBC mode. Its one hard requirement — a unique nonce per message, per key, always — is simple to state but easy to violate under careless key reuse or naive counter logic, which is exactly why nonce handling deserves its own dedicated scrutiny in any AES-GCM implementation.
