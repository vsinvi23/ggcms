# AES-GCM: Enforcing Confidentiality and Integrity with AEAD

## The Problem: The Malleability of Unauthenticated Encryption
For years, the industry standard for symmetric encryption was AES in Cipher Block Chaining (CBC) mode. AES-CBC encrypts data in 16-byte blocks, providing excellent confidentiality. However, CBC mode lacks one critical cryptographic property: **Integrity**. 

If an attacker intercepts an AES-CBC encrypted packet, they cannot read it. But, because there is no cryptographic signature verifying the ciphertext, the attacker can systematically flip bits in the ciphertext and forward it to the server. By observing how the server's decryption logic fails (specifically, how it handles padding errors), the attacker can execute a **Padding Oracle Attack**, slowly decrypting the entire ciphertext byte-by-byte without ever knowing the key.

Encryption without authentication is dangerous. We need an algorithm that provides both confidentiality (nobody can read it) and authenticity (nobody can alter it). This paradigm is known as **Authenticated Encryption with Associated Data (AEAD)**, and its undisputed king is **AES-GCM (Galois/Counter Mode)**.

## The Mental Model: The Tamper-Evident Envelope
Imagine writing a secret letter. Older encryption modes (like AES-CBC) put the letter in a standard envelope. An interceptor cannot see the letter, but they can steam the envelope open, carefully swap out a paragraph, reseal it, and send it on. The recipient has no idea it was modified.

AES-GCM puts the letter inside a chemically sealed, tamper-evident envelope. The moment the envelope is sealed, a unique cryptographic barcode is burned into the seal. If an interceptor tries to slice the envelope open, alter a single comma, or even smudge the barcode, the chemical seal instantly turns bright red. The recipient immediately rejects the letter before even attempting to read it.

## Deep Dive: How GCM Works
AES-GCM achieves AEAD by combining two distinct mathematical concepts: Counter Mode (CTR) for encryption, and a Galois Message Authentication Code (GMAC) for integrity.

### 1. Confidentiality via Counter Mode (CTR)
Unlike CBC, which chains blocks together, CTR mode turns the AES block cipher into a stream cipher. It takes a unique initialization vector (Nonce) and appends a counter ($Nonce || 1$, $Nonce || 2$). It encrypts these counters using the AES key to generate a pseudo-random keystream. This keystream is simply XORed against the plaintext message to create the ciphertext. Because it relies on counters, CTR mode is heavily parallelizable, allowing modern CPUs to encrypt gigabytes of data in milliseconds.

### 2. Integrity via Galois Field Multiplication
As the ciphertext is generated, AES-GCM passes it into the GHASH function. GHASH performs polynomial arithmetic over a finite mathematical field, specifically **Galois Field $GF(2^{128})$**. It takes the ciphertext, alongside any unencrypted "Associated Data" (like HTTP headers or routing tags that need to be authenticated but not hidden), and mathematically reduces it into a 16-byte Authentication Tag.

When the receiver gets the payload, they independently recompute the GHASH over the ciphertext. If their computed 16-byte tag does not perfectly match the tag appended to the message, the decryption function throws a fatal error and destroys the plaintext in memory.

## The Catastrophic Danger: Nonce Reuse
AES-GCM has an Achilles' heel: **The Nonce**. The Nonce (Number Used Once) is typically a 12-byte (96-bit) value that must be absolutely unique for every single encryption operation performed under the same key.

If you ever use the same Nonce twice with the same AES key, the math breaks down catastrophically. 
1. **Confidentiality Loss**: Because it's an XOR stream cipher, an attacker who intercepts two ciphertexts encrypted with the same Nonce can XOR them together. The keystream cancels out, leaving the attacker with the XOR of the two plaintexts, which is trivial to break.
2. **Integrity Loss (The Forbidden Attack)**: Worse, reusing a nonce in GCM allows an attacker to solve the Galois polynomial equations and derive the secret GHASH authentication subkey. Once they have this, they can forge valid authentication tags for any message they want, completely destroying the integrity of the entire system.

## Code Example: Go AES-GCM Implementation
Implementing AES-GCM in Go is straightforward using the `crypto/cipher` package. The developer is responsible for generating a secure, random nonce.

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

func encrypt_gcm(plaintext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// Generate a strict, mathematically random 12-byte Nonce
	nonce := make([]byte, aesgcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Seal encrypts and appends the 16-byte authentication tag
	ciphertext := aesgcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

func decrypt_gcm(ciphertext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesgcm.NonceSize()
	nonce, cipherData := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Open simultaneously decrypts and verifies the authentication tag
	// If the tag is invalid, it returns an error and NO plaintext.
	plaintext, err := aesgcm.Open(nil, nonce, cipherData, nil)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: payload tampered")
	}

	return plaintext, nil
}
```

## Conclusion
AES-GCM is the gold standard for symmetric encryption. It is mandatory in TLS 1.3 and heavily hardware-accelerated via AES-NI CPU instructions. By coupling the blistering speed of CTR mode with the mathematical rigor of Galois Fields, AES-GCM ensures that intercepted data remains an opaque, unmodifiable black box—provided you never, ever reuse a nonce.
