# TLS 1.3 Session Resumption: PSK and Session Ticket Encryption Key (STEK) Rotation

## The Problem: The Forward Secrecy Gaps in Session Tickets

TLS 1.3 defines a streamlined 1-RTT handshake and supports an optimized session resumption mechanism utilizing **Pre-Shared Keys (PSK)**. Resumption minimizes latency by avoiding expensive public key cryptography on repeat connections. The server encapsulates the session state (negotiated master secret, cipher suite, identity, ALPN) inside a **Session Ticket**, encrypts it, and sends it to the client. On subsequent connections, the client presents this ticket in its `ClientHello`.

However, this mechanism introduces a dangerous vulnerability. If the server utilizes a static **Session Ticket Encryption Key (STEK)**, a compromise of that key allows an attacker to decrypt all intercepted session tickets. This retroactively exposes the master secrets of past connections, completely breaking **Perfect Forward Secrecy (PFS)**. 

To maintain forward secrecy in real-world clusters, servers must implement continuous, synchronized, memory-safe **STEK rotation**. 

---

## STEK Rotation Lifecycle & Architecture

A secure STEK deployment requires a key manager that supports multiple concurrent keys in various lifecycle stages:
1.  **Active Key:** Used to encrypt new tickets and decrypt existing tickets. Only one key is Active at any given time.
2.  **Passive Keys:** Older keys no longer used for encryption, but maintained to decrypt valid, unexpired tickets.
3.  **Retired Keys:** Keys that have passed their maximum validity window and are purged from memory.

```
       +-----------------------------------------------------------+
       |                     STEK Key Ring                         |
       |                                                           |
       |  +--------------------+  Rotate  +---------------------+  |
       |  |     Active STEK    | -------->|    Passive STEK     |  |
       |  |    (Encrypts &     |          | (Only decrypts older|  |
       |  |     Decrypts)      |          |       tickets)      |  |
       |  +---------+----------+          +----------+----------+  |
       +------------|--------------------------------|-------------+
                    | (Encrypt/Decrypt)              | (Decrypt Only)
                    v                                v
       +-----------------------------------------------------------+
       |                     Resumption Engine                     |
       |                                                           |
       | ClientHello (Ticket) ---> Parse KeyID ---> Match Key -----> Decrypt State
       +-----------------------------------------------------------+
```

### Session Ticket Payload Structure
A secure session ticket is wrapped in an Authenticated Encryption with Associated Data (AEAD) envelope, such as AES-256-GCM:

$$\text{Ticket} = \text{KeyID} \parallel \text{IV} \parallel \text{Ciphertext} \parallel \text{AuthTag}$$

Where the associated data is the $\text{KeyID}$ to prevent key-confusion attacks.

---

## Code Implementation: Thread-Safe STEK Manager in Go

The following Go code implements a memory-safe, thread-safe STEK Manager that handles multi-generation keys, encrypts session payloads with AES-256-GCM, and supports rotation.

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
)

type STEK struct {
	ID        [8]byte   // Unique identifier for key resolution
	Key       [32]byte  // 256-bit AES Key
	CreatedAt time.Time
}

type STEKManager struct {
	mu         sync.RWMutex
	activeKey  *STEK
	keyRing    map[[8]byte]*STEK
	ticketTTL  time.Duration
}

func NewSTEKManager(ticketTTL time.Duration) *STEKManager {
	return &STEKManager{
		keyRing:   make(map[[8]byte]*STEK),
		ticketTTL: ticketTTL,
	}
}

// Rotate generates a new active key and moves the old key to passive state
func (m *STEKManager) Rotate() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	newKey := &STEK{
		CreatedAt: time.Now(),
	}
	if _, err := io.ReadFull(rand.Reader, newKey.ID[:]); err != nil {
		return err
	}
	if _, err := io.ReadFull(rand.Reader, newKey.Key[:]); err != nil {
		return err
	}

	m.keyRing[newKey.ID] = newKey
	m.activeKey = newKey

	// Evict expired keys
	now := time.Now()
	for id, k := range m.keyRing {
		if now.Sub(k.CreatedAt) > (m.ticketTTL * 2) { // Allow passive buffer window
			delete(m.keyRing, id)
		}
	}

	return nil
}

// EncryptSession Serializes and encrypts session state under the current active STEK
func (m *STEKManager) EncryptSession(sessionState []byte) ([]byte, error) {
	m.mu.RLock()
	active := m.activeKey
	m.mu.RUnlock()

	if active == nil {
		return nil, errors.New("no active STEK configured")
	}

	block, err := aes.NewCipher(active.Key[:])
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Ciphertext contains KeyID as associated data to prevent key tampering
	ciphertext := gcm.Seal(nil, nonce, sessionState, active.ID[:])

	// Format: KeyID (8 bytes) || Nonce (12 bytes) || Ciphertext (variable)
	payload := make([]byte, 8+len(nonce)+len(ciphertext))
	copy(payload[0:8], active.ID[:])
	copy(payload[8:8+len(nonce)], nonce)
	copy(payload[8+len(nonce):], ciphertext)

	return payload, nil
}

// DecryptSession resolves the key from the ticket's KeyID and decrypts the state
func (m *STEKManager) DecryptSession(ticket []byte) ([]byte, error) {
	if len(ticket) < 20 { // 8 bytes ID + 12 bytes Nonce
		return nil, errors.New("invalid ticket size")
	}

	var keyID [8]byte
	copy(keyID[:], ticket[0:8])
	nonce := ticket[8:20]
	ciphertext := ticket[20:]

	m.mu.RLock()
	key, exists := m.keyRing[keyID]
	m.mu.RUnlock()

	if !exists {
		return nil, errors.New("unknown or expired STEK ID")
	}

	block, err := aes.NewCipher(key.Key[:])
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	// Verify authentication tag with KeyID as authenticated associated data
	plaintext, err := gcm.Open(nil, nonce, ciphertext, keyID[:])
	if err != nil {
		return nil, fmt.Errorf("session decryption failed: %w", err)
	}

	return plaintext, nil
}

func main() {
	// Initialize STEK Manager with a 1-hour ticket TTL
	mgr := NewSTEKManager(1 * time.Hour)

	// Rotate immediately to configure the initial active key
	if err := mgr.Rotate(); err != nil {
		log.Fatalf("Failed to initialize keys: %v", err)
	}

	originalSession := []byte("session-id:99824;master-secret:0xDEADBEEF;cipher:TLS_AES_256_GCM_SHA384")

	// Server encrypts the ticket to return to client
	ticket, err := mgr.EncryptSession(originalSession)
	if err != nil {
		log.Fatalf("Encryption failed: %v", err)
	}
	fmt.Printf("Generated Ticket (Hex): %x\n", ticket)

	// Simulate Key Rotation
	fmt.Println("Rotating keys...")
	if err := mgr.Rotate(); err != nil {
		log.Fatalf("Rotation failed: %v", err)
	}

	// Server decrypts client's ticket (validates that old key is now passive but still readable)
	recovered, err := mgr.DecryptSession(ticket)
	if err != nil {
		log.Fatalf("Decryption failed: %v", err)
	}
	fmt.Printf("Decrypted Session: %s\n", string(recovered))
}
```

---

## Defensive Engineering Best Practices

1.  **Strict Rotation Frequency:** Rotate the active STEK every 1 to 4 hours. Keep passive keys in the ring for no longer than twice the session ticket's TTL.
2.  **Use Strong AEAD Modes:** Do not use CBC mode with HMAC for session tickets. Always use AEAD constructions (AES-GCM or ChaCha20-Poly1305) and bind the `KeyID` as authenticated associated data.
3.  **Cross-Cluster Sync:** In distributed environments, never generate STEKs locally on isolated server nodes. Use a centralized, secure key distribution coordinator (such as HashiCorp Vault or a secure Raft consensus cluster) to safely distribute matching rotated keys across all instances.
4.  **Forward Secrecy fallback:** When resuming sessions, force a DH or ECDH ephemeral key exchange (`psk_dhe_ke` mode) to guarantee forward secrecy even if the STEK is eventually compromised. Avoid pure static PSK resumption (`psk_ke`).
