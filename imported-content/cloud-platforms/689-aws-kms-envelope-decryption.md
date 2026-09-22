# AWS KMS Envelope Encryption: Protecting Keys with KEKs and Data Encryption Keys

## The Problem: The Latency and Size Limits of Direct KMS Encryption

In high-throughput cloud applications, securing sensitive data at rest is a foundational requirement. A naive approach is to send raw data directly to the AWS Key Management Service (KMS) via the `Encrypt` API. However, this architectural pattern fails catastrophically at scale due to three critical constraints:

1. **Payload Size Limitation**: The AWS KMS `Encrypt` API has a hard limit of 4 KB (4,096 bytes) for direct data encryption. Attempting to encrypt larger assets, such as database backups, PDF documents, or large JSON payloads, results in a `ValidationException`.
2. **Network Overhead and Latency**: Every direct encryption and decryption request requires a round-trip HTTP POST call to the AWS KMS regional endpoint. Introducing synchronous network requests into high-frequency write paths injects 10–50ms of latency per operation, severely degrading application throughput.
3. **KMS API Quota Exhaustion & Costs**: AWS KMS imposes strict cryptographic request rate quotas (typically 10,000 requests per second in major regions). Exceeding this quota triggers `ThrottlingException` (HTTP 400), stalling pipelines. Furthermore, at $0.03 per 10,000 API calls, encrypting millions of individual rows directly via KMS incurs substantial, unnecessary costs.

---

## Technical Architecture: KEK vs. DEK

To solve these limits, we must implement **Envelope Encryption**. In this pattern, data is encrypted locally using a unique symmetric **Data Encryption Key (DEK)**, while the DEK itself is encrypted using a root **Key Encryption Key (KEK)** managed by AWS KMS.

### The Cryptographic Flow

```
[Write/Encryption Path]
+-------------------+             +-----------------------+
|  AWS KMS (KEK)    |             |  Your Application     |
+---------+---------+             +-----------+-----------+
          |                                   |
          |  1. GenerateDataKey()             |
          v                                   v
+-----------------------------+               |
| Plaintext DEK (in memory)   +<--------------+
| Encrypted DEK (to store)    |               | 2. Encrypts payload
+-----------------------------+               |    locally with
          |                                   |    Plaintext DEK
          |                                   v
          |                             +-----+---------------+
          |                             | Plaintext Payload   |
          |                             +-----+---------------+
          v                                   v
+---------+---------+                   +-----+---------------+
| Store Encrypted   |                   | Encrypted Ciphertext|
| DEK along with ...|==================>+ Metadata / Payload  |
+-------------------+                   +---------------------+

[Read/Decryption Path]
+---------------------+                 +---------------------+
| Encrypted DEK from  |                 | AWS KMS (KEK)       |
| Storage Metadata    |                 +----------+----------+
+----------+----------+                            ^
          |                                        |
          | 1. Send Encrypted DEK                  | Decrypt()
          +----------------------------------------+
                                                   |
                                                   v
                                        +----------+----------+
                                        | Plaintext DEK       |
                                        +----------+----------+
                                                   |
                                                   | 2. Decrypt Ciphertext
                                                   |    Payload locally
                                                   v
                                        +----------+----------+
                                        | Plaintext Payload   |
                                        +---------------------+
```

1. **The KEK (Key Encryption Key)**: Lives safely within the HSM (Hardware Security Module) boundary of AWS KMS. It never leaves KMS in plaintext.
2. **The DEK (Data Encryption Key)**: A highly ephemeral symmetric key (typically AES-256) generated on-demand by KMS. KMS returns two variants of the DEK:
   - **Plaintext DEK**: Loaded temporarily into application memory to execute local, fast symmetric encryption (AES-GCM-256) of the bulk data. It must be zeroed out of memory immediately after use.
   - **Encrypted DEK (Ciphertext)**: Safe to store alongside the encrypted data (e.g., in a database column or object metadata).

---

## Implementation: Production-Ready Go Code

The following Go implementation demonstrates envelope encryption and decryption using the AWS SDK for Go v2, utilizing `AES-256-GCM` with a 12-byte random initialization vector (IV) to prevent replay attacks and ensure cryptographic integrity.

```go
package main

import (
	"context"
	"crypto/aes"
	"go/types"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/kms/types"
)

type EnvelopeEncryptor struct {
	kmsClient *kms.Client
	kmsKeyID  string
}

type EncryptedPayload struct {
	EncryptedDEK []byte
	IV           []byte
	Ciphertext   []byte
}

func NewEnvelopeEncryptor(ctx context.Context, kmsKeyID string) (*EnvelopeEncryptor, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	return &EnvelopeEncryptor{
		kmsClient: kms.NewFromConfig(cfg),
		kmsKeyID:  kmsKeyID,
	}, nil
}

// Encrypt locks down plain data locally using a KMS-generated DEK
func (ee *EnvelopeEncryptor) Encrypt(ctx context.Context, plaintext []byte) (*EncryptedPayload, error) {
	// 1. Request a new Data Encryption Key from AWS KMS
	out, err := ee.kmsClient.GenerateDataKey(ctx, &kms.GenerateDataKeyInput{
		KeyId:   &ee.kmsKeyID,
		KeySpec: types.DataKeySpecAes256,
	})
	if err != nil {
		return nil, fmt.Errorf("kms generate data key failed: %w", err)
	}

	plaintextDEK := out.Plaintext
	encryptedDEK := out.Ciphertext

	// Defer zeroing the plaintext key to prevent memory leaks/retrieval
	defer func() {
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
	}()

	// 2. Setup AES-GCM Cipher block
	block, err := aes.NewCipher(plaintextDEK)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// 3. Generate secure random IV
	iv := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return nil, fmt.Errorf("failed to generate random IV: %w", err)
	}

	// 4. Encrypt raw payload locally
	ciphertext := aesGCM.Seal(nil, iv, plaintext, nil)

	return &EncryptedPayload{
		EncryptedDEK: encryptedDEK,
		IV:           iv,
		Ciphertext:   ciphertext,
	}, nil
}

// Decrypt processes the payload locally by first decrypting the DEK via KMS
func (ee *EnvelopeEncryptor) Decrypt(ctx context.Context, payload *EncryptedPayload) ([]byte, error) {
	// 1. Decrypt the Data Encryption Key (DEK) via KMS
	out, err := ee.kmsClient.Decrypt(ctx, &kms.DecryptInput{
		CiphertextBlob: payload.EncryptedDEK,
		KeyId:          &ee.kmsKeyID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt DEK: %w", err)
	}

	plaintextDEK := out.Plaintext
	defer func() {
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
	}()

	// 2. Setup AES-GCM Cipher block with decrypted key
	block, err := aes.NewCipher(plaintextDEK)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// 3. Decrypt ciphertext locally
	plaintext, err := aesGCM.Open(nil, payload.IV, payload.Ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt payload ciphertext: %w", err)
	}

	return plaintext, nil
}
```

---

## Operational Best Practices

* **Zero out memory immediately**: In languages with garbage collection (like Go or Java) or manual allocation (C/C++), overwrite the plaintext DEK byte slice with zeros immediately after the symmetric encryption or decryption operation completes. This mitigates the risk of side-channel memory-dump attacks.
* **Implement Encryption Contexts**: Always pass an `EncryptionContext` (a set of key-value pairs representing non-secret metadata) to both `GenerateDataKey` and `Decrypt`. AWS KMS cryptographically binds this context to the key; decryption will fail if the identical context is not supplied. This acts as an additional defense against signature-tampering and key-swapping attacks.
* **Enable KMS Key Rotation**: Turn on automatic annual key rotation for your customer managed KMS keys (KEKs). AWS handles the lifecycle back-compatibility transparently: older ciphertexts remain decryptable using prior versions of the KEK, while new DEKs are secured using the active KEK version.
