# Secure Password Storage Explained: Argon2, Salts, Peppers, and Offline Attacks

In the event of a database breach, user passwords must remain completely unrecoverable. Storing passwords in plaintext, or even using simple cryptographic hash functions like MD5, SHA-1, or SHA-256, is a critical security failure. Modern graphics cards (GPUs) and specialized mining chips (ASICs) can calculate SHA-256 hashes at rates of billions of attempts per second, making offline brute-force and precomputed "rainbow table" attacks trivial. Resilient system design demands password-hashing algorithms that are slow, memory-hard, and peppered.

---

## The Threat: GPU Acceleration and Rainbow Tables

A cryptographic hash function like SHA-256 is designed to be fast and computationally inexpensive. It is highly optimized for verifying file integrity and message authenticity. However, these exact design goals make it highly dangerous for password storage.

If an attacker steals a database dump containing raw SHA-256 hashes, they can run an offline brute-force attack:
* A modern consumer GPU can compute over 10 billion SHA-256 hashes per second.
* A standard 8-character password containing lowercase, uppercase, and numbers can be cracked in less than a day.

### Precomputed Rainbow Tables

Without a unique "salt," if two users share the same password (e.g., `Password123`), their hashes will be identical. Attackers generate billions of common words and their corresponding hashes beforehand (rainbow tables). They can then instantly look up stolen hashes in these tables to recover the plaintext password.

```
       [ Offline Attacker ]
               |
               |  (Has stolen Database Dump containing: "user_id | password_hash")
               v
  +-----------------------------------------------------------+
  |              High-Performance GPU Array                   |
  |  (Performs 10,000,000,000 parallel hash attempts/sec)     |
  +-----------------------------------------------------------+
         |
         +---> Try: "admin"      -> SHA256: 8c6976e5b5410415... (Mismatch)
         +---> Try: "123456"     -> SHA256: e10adc3949ba59ab... (Hit! Username decrypted)
         |
         v
     [ CRACKED USER CREDENTIALS ]
```

---

## The Secure Hashing Pipeline

To defeat offline cracking, we must use a Key Derivation Function (KDF) that implements:
1. **Cryptographic Salt:** A unique, cryptographically secure random value generated per user and stored next to the hash. This completely defeats rainbow tables.
2. **Work Factors:** Configurable knobs that force the hashing algorithm to use massive amounts of CPU and memory, eliminating the speed advantages of GPUs/ASICs.
3. **Application Pepper:** A secret key stored outside the database (e.g., in a Key Management Service or secure env variables) that is mixed with the password before hashing. Even if the database is leaked, hashes cannot be brute-forced without the pepper.

```
[ User Password ]
        |
        +---> [ AES-256-HMAC (with PEPPER from KMS) ]
        |
        v
[ Peppered Password ] + [ Unique Cryptographic Salt ]
        |
        v
+--------------------------------------------------+
|           Argon2id Hashing Engine                |
|  - Memory Cost: 64MB (Defeats GPU concurrency)   |
|  - Time Cost: 3 iterations (Enforces CPU delay)  |
|  - Parallelism: 4 threads (Scales to server load)|
+--------------------------------------------------+
        |
        v
[ PHC-Formatted String in DB: $argon2id$v=19$m=65536,t=3,p=4$salt$hash ]
```

---

## Why Argon2id Is the Standard

Argon2 was selected as the winner of the Password Hashing Competition (PHC) in 2015. It exists in three variants:
* **Argon2i:** Uses data-independent memory access. It is optimized to prevent side-channel timing attacks but is slightly less resistant to GPU-based attacks.
* **Argon2d:** Uses data-dependent memory access. Extremely resistant to GPU attacks, but vulnerable to timing side-channels.
* **Argon2id:** A hybrid variant that uses data-independent access in the first pass (preventing timing attacks) and data-dependent access in subsequent passes (preventing GPU acceleration). **This is the industry standard for storing user credentials.**

---

## Robust Go Implementation: Argon2id Hashing & Verification

The following code provides a complete, production-grade Go package using `golang.org/x/crypto/argon2` to hash and verify passwords using the standard PHC format. It incorporates constant-time byte comparisons to prevent timing side-channels.

```go
package pwdhash

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id configuration parameters matching OWASP guidelines
type Params struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

var DefaultParams = Params{
	Memory:      64 * 1024, // 64 MB
	Iterations:  3,
	Parallelism: 4,
	SaltLength:  16, // 128-bit salt
	KeyLength:   32, // 256-bit key
}

// HashPassword generates a secure PHC-formatted Argon2id hash of a password.
func HashPassword(password string, params Params) (string, error) {
	// Generate random salt
	salt := make([]byte, params.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	// Compute Argon2id hash
	hash := argon2.IDKey(
		[]byte(password),
		salt,
		params.Iterations,
		params.Memory,
		params.Parallelism,
		params.KeyLength,
	)

	// Encode to standard PHC format
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	phc := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		params.Memory,
		params.Iterations,
		params.Parallelism,
		b64Salt,
		b64Hash,
	)

	return phc, nil
}

// VerifyPassword compares a plaintext password against a stored PHC hash.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, errors.New("invalid hash format")
	}

	if parts[1] != "argon2id" {
		return false, errors.New("unsupported hashing algorithm")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, err
	}
	if version != argon2.Version {
		return false, errors.New("incompatible argon2 version")
	}

	var params Params
	_, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.Memory, &params.Iterations, &params.Parallelism)
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	params.SaltLength = uint32(len(salt))

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}
	params.KeyLength = uint32(len(expectedHash))

	// Recompute hash using parameters extracted from the PHC string
	actualHash := argon2.IDKey(
		[]byte(password),
		salt,
		params.Iterations,
		params.Memory,
		params.Parallelism,
		params.KeyLength,
	)

	// CRITICAL: Perform constant-time comparison to prevent timing side-channels
	if subtle.ConstantTimeCompare(actualHash, expectedHash) == 1 {
		return true, nil
	}

	return false, nil
}
```

---

## Defensive Engineering Checklist

1. **Keep Parameters Configurable:** Hardware speeds increase over time. Ensure your algorithm settings (memory cost, iterations) are configurable in your code so they can be scaled up without refactoring.
2. **Never Hash Plaintext in Logs:** Implement automated code scanners or regex sanitization on your logging framework to prevent raw strings submitted to login routes from being serialized into telemetry logs.
3. **Upgrade Legacy Hashes on Login:** If migrating from old MD5 or SHA-256 databases, implement a "lazy migration" strategy: when a user successfully authenticates using their old hash, re-hash their password with Argon2id and update the database silently.
