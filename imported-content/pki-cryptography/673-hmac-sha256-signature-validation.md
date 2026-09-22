# HMAC-SHA256: Preventing Length Extension Attacks with Hash-based Message Authentication Codes

## The Problem: The Vulnerability of Naive Hashing for Message Integrity

A common engineering requirement is verifying that a payload has not been modified in transit. A natural but highly insecure design pattern is to concatenate a private key with the message and run it through a standard cryptographic hash function, such as:

$$\text{Signature} = H(\text{SecretKey} \parallel \text{Message})$$

If $H$ is a Merkle-Damgård hash function (such as SHA-1, SHA-256, or SHA-512), this construction is vulnerable to a **Length Extension Attack**. 

In Merkle-Damgård hashes, messages are split into fixed-size blocks (e.g., 512 bits) and processed sequentially. The hash value output for a given message is the final internal state (chaining variables) of the hashing engine after the last block is processed. 
*   If an attacker intercepts $\text{Message}$ and its naive signature $\text{Signature}$, they can initialize a new hashing engine with the internal state set to $\text{Signature}$.
*   The attacker can then append malicious data ($\text{MaliciousData}$) and process it.
*   The resulting hash will be a valid signature for the concatenated payload: $\text{Message} \parallel \text{Padding} \parallel \text{MaliciousData}$.
*   The attacker achieves this **without ever knowing the secret key**.

```
   Naive Signature H(Secret || Message) 
                  |
                  v (Equals final state of MD compression function)
   Attacker State: [A, B, C, D, E, F, G, H]
                  |
                  +---> Inject Extra Blocks (Malicious Data)
                  v
   Valid Signature for: Message || Padding || Malicious Data (Generated without Secret Key)
```

---

## Technical Solution: The Nested HMAC Architecture

To prevent length extension attacks, RFC 2104 introduces the **Keyed-Hash Message Authentication Code (HMAC)**. HMAC processes messages using a nested double-hash construction that shields the inner hash state from the output:

$$\text{HMAC}(K, m) = H\Big((K' \oplus \text{opad}) \parallel H\big((K' \oplus \text{ipad}) \parallel m\big)\Big)$$

Where:
*   $K'$ is the secret key $K$, padded with zeros to match the hash function's block size (64 bytes for SHA-256). If $K$ is larger than the block size, it is first hashed.
*   $\text{ipad}$ is the inner padding constant (repeated byte `0x36`).
*   $\text{opad}$ is the outer padding constant (repeated byte `0x5C`).
*   $\oplus$ is bitwise exclusive-OR (XOR).

Because the outer hash $H$ is applied to the output of the inner hash, an attacker cannot extend the inner hash's message directly. The intermediate states remain completely hidden.

```
                  +----------------------------------+
                  |            Secret Key            |
                  +-----------------+----------------+
                                    |
                    +---------------+---------------+
                    | (XOR ipad)                    | (XOR opad)
                    v                               v
            +-------+-------+               +-------+-------+
            |  Key ^ 0x36   |               |  Key ^ 0x5c   |
            +-------+-------+               +-------+-------+
                    |                               |
                    v                               |
            +-------+-------+                       |
            |    Payload    |                       |
            +-------+-------+                       |
                    |                               |
                    v (H Hash)                      v
            +-------+-------+               +-------+-------+
            |  Inner Hash   |-------------->|  Inner Result |
            +---------------+               +-------+-------+
                                                    |
                                                    v (H Hash)
                                            +-------+-------+
                                            |  Outer Hash   |  ===> HMAC Output
                                            +---------------+
```

---

## Code Implementation: Secure HMAC-SHA256 Generation and Timing-Safe Verification

Even with a mathematically secure algorithm, developers often introduce vulnerabilities by using standard equality checks (like `==` or `bytes.Equal`) to verify signatures. Standard string and memory comparisons return early as soon as a byte mismatch is found. This leaks the position of matching bytes via timing, allowing an attacker to reconstruct a valid signature byte-by-byte in a **Timing Side-Channel Attack**.

The Go code below implements a secure signature validator using HMAC-SHA256 and enforces **constant-time byte comparison** via `crypto/subtle`.

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
)

type HMACValidator struct {
	secretKey []byte
}

func NewHMACValidator(secretKey []byte) (*HMACValidator, error) {
	if len(secretKey) < 32 {
		return nil, errors.New("key must be at least 256 bits (32 bytes) for HMAC-SHA256")
	}
	return &HMACValidator{secretKey: secretKey}, nil
}

// GenerateSignature computes the HMAC-SHA256 signature for a payload
func (v *HMACValidator) GenerateSignature(payload []byte) string {
	mac := hmac.New(sha256.New, v.secretKey)
	mac.Write(payload)
	signatureBytes := mac.Sum(nil)
	return hex.EncodeToString(signatureBytes)
}

// VerifySignature checks the payload signature using constant-time comparison
func (v *HMACValidator) VerifySignature(payload []byte, receivedSigHex string) (bool, error) {
	receivedSig, err := hex.DecodeString(receivedSigHex)
	if err != nil {
		return false, fmt.Errorf("invalid hexadecimal signature: %w", err)
	}

	// Compute the expected HMAC signature under the current key
	expectedSig := hmac.New(sha256.New, v.secretKey)
	expectedSig.Write(payload)
	expectedSigBytes := expectedSig.Sum(nil)

	// Validate in constant-time. This comparison executes in the same number of CPU cycles
	// regardless of where a mismatch occurs, preventing timing side-channel leaks.
	if subtle.ConstantTimeCompare(expectedSigBytes, receivedSig) != 1 {
		return false, errors.New("hmac verification failed: signature mismatch")
	}

	return true, nil
}

func main() {
	// Secret key generated cryptographically (e.g., from an environment secret)
	secret := []byte("f0c3d9b04b9e28ac8152e071e6264ffb5fa38c82110c7bf7c8ad81ba24fbc7bc")
	
	validator, err := NewHMACValidator(secret)
	if err != nil {
		log.Fatalf("Initialization failed: %v", err)
	}

	payload := []byte("user_id=10058964&action=transfer_funds&amount=50000.00")

	// 1. Generate Signature
	signature := validator.GenerateSignature(payload)
	fmt.Printf("Message: %s\n", string(payload))
	fmt.Printf("Signature: %s\n", signature)

	// 2. Validate Signature Successfully
	isValid, err := validator.VerifySignature(payload, signature)
	if err != nil {
		log.Printf("Verification error: %v", err)
	} else if isValid {
		fmt.Println("Success: HMAC verified in constant-time. Payload is authentic!")
	}

	// 3. Reject Altered Payload
	maliciousPayload := []byte("user_id=10058964&action=transfer_funds&amount=50000.00&attacker=true")
	_, err = validator.VerifySignature(maliciousPayload, signature)
	if err != nil {
		fmt.Printf("Rejection Verified: %v\n", err)
	}
}
```

---

## Defensive Engineering Best Practices

1.  **Always Use `subtle.ConstantTimeCompare`:** Never use standard operators or functions (`==`, `bytes.Equal`, or `strings.Compare`) to validate signatures. These leak execution timings that expose the correct hash bytes.
2.  **Ensure Adequate Key Entropy:** Keys used for HMAC-SHA256 must contain at least 256 bits of high-quality entropy (derived from `/dev/urandom` or a secure CSPRNG). Weak, guessable keys render the hashing algorithm useless.
3.  **Do Not Reuse Keys Across Contexts:** Avoid using the same secret key for both HMAC generation and other operations (like AES-GCM encryption or HKDF key derivation). Use HKDF to derive domain-specific keys from a master secret.
