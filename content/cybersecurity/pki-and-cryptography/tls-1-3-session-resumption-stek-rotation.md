---
title: "TLS 1.3 Session Resumption: PSK Tickets and STEK Rotation"
description: "How TLS 1.3 session resumption via PSK tickets works, why a static Session Ticket Encryption Key breaks forward secrecy, and a thread-safe Go implementation of STEK rotation with multi-generation key support."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "tls-1-3"
  - "session-resumption"
  - "session-tickets"
  - "stek-rotation"
  - "forward-secrecy"
  - "aes-gcm"
---

# TLS 1.3 Session Resumption: PSK Tickets and STEK Rotation

Establishing a secure TLS connection is not cheap. Even TLS 1.3's streamlined 1-RTT handshake requires validating certificate chains and performing an elliptic-curve Diffie-Hellman exchange — real asymmetric cryptography, real CPU cycles, real latency. If a mobile client briefly disconnects and reconnects (switching from Wi-Fi to cellular, say), forcing a full handshake from scratch wastes bandwidth, drains battery, and adds noticeable latency for no security benefit — the client already proved who it was moments ago.

TLS 1.3 solves this with **Pre-Shared Key (PSK) Session Resumption** via Session Tickets. Used carelessly, though, it quietly reintroduces exactly the forward-secrecy problem TLS 1.3 was designed to eliminate.

## Mental Model: The VIP Club Stamp

Think of an exclusive club. The first time you visit, you wait in line, show ID, and get checked by the bouncer — the full TLS handshake. Once inside, the bouncer gives you an unforgeable hand-stamp. If you step out for a phone call and return ten minutes later, you don't repeat the line or the ID check — you show the stamp and you're back in instantly. The stamp is the Session Ticket; showing it is 1-RTT (or 0-RTT) resumption.

## How TLS 1.3 Unifies Resumption Around PSKs

TLS 1.2 had two competing, half-compatible resumption mechanisms (Session IDs and Session Tickets). TLS 1.3 throws both away and unifies resumption entirely around PSKs.

After a full handshake completes, the server generates a resumption secret, encrypts it under a local key only it knows — the **Session Ticket Encryption Key (STEK)** — and sends the result to the client in a `NewSessionTicket` message.

**The resumption flow:**

```text
Client                                               Server
|                                                         |
| [ClientHello] + {PSK Ticket}                            |
| ------------------------------------------------------> |
|                                           [ServerHello] |
|                                   [EncryptedExtensions] |
|                                              [Finished] |
| <------------------------------------------------------ |
|                                                         |
| [Finished]                                              |
| [Application Data]                                      |
| ------------------------------------------------------> |
```

1. **ClientHello** includes a `pre_shared_key` extension carrying the ticket from the earlier session.
2. **ServerHello** — the server decrypts the ticket with its STEK, recovers the resumption secret, and (if valid and unexpired) skips certificate exchange entirely.
3. **Key derivation** — both sides derive fresh symmetric traffic keys from the resumed secret.
4. **Finished** — the connection is live after a fast 1-RTT (or 0-RTT, if the client attaches early data), without touching RSA or ECDSA at all.

## The Hidden Forward-Secrecy Gap

A normal TLS 1.3 handshake achieves forward secrecy through ephemeral ECDHE: even a stolen server private key can't decrypt past traffic, because the ephemeral keys that actually protected it are long gone. Session resumption threatens this guarantee in a subtle way: **if the STEK itself is static and never rotated**, compromising that one key lets an attacker decrypt every session ticket it ever encrypted — recovering the resumption secrets, and from there, the actual application traffic keys of every resumed session.

The fix isn't avoiding resumption; it's treating the STEK the same way TLS 1.3 already treats DH keys — as something that must expire.

## STEK Rotation Architecture

A secure STEK deployment maintains multiple keys in different lifecycle stages simultaneously:

```
       +-----------------------------------------------------------+
       |                     STEK Key Ring                         |
       |                                                           |
       |  +--------------------+  Rotate  +---------------------+  |
       |  |     Active STEK    | -------->|    Passive STEK     |  |
       |  |  (Encrypts & Decrypts)         | (Decrypt only, for  |  |
       |  |                    |          |   old tickets)      |  |
       |  +---------+----------+          +----------+----------+  |
       +------------|--------------------------------|-------------+
                    | (Encrypt/Decrypt)              | (Decrypt Only)
                    v                                v
       +-----------------------------------------------------------+
       |                     Resumption Engine                     |
       | ClientHello (Ticket) -> Parse KeyID -> Match Key -> Decrypt|
       +-----------------------------------------------------------+
```

- **Active key** — used for both new-ticket encryption and decryption. Exactly one is active at any moment.
- **Passive keys** — retired from encrypting new tickets, but still available to decrypt tickets issued before the last rotation.
- **Retired keys** — past their maximum validity window, purged from memory entirely.

A ticket payload binds its own `KeyID` as authenticated associated data, preventing an attacker from tricking the server into decrypting a ticket under the wrong key generation:

$$\text{Ticket} = \text{KeyID} \parallel \text{IV} \parallel \text{Ciphertext} \parallel \text{AuthTag}$$

## Code: Thread-Safe STEK Manager in Go

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log"
	"sync"
	"time"
)

type STEK struct {
	ID        [8]byte  // Unique identifier used to resolve which key decrypts a ticket
	Key       [32]byte // 256-bit AES key
	CreatedAt time.Time
}

type STEKManager struct {
	mu        sync.RWMutex
	activeKey *STEK
	keyRing   map[[8]byte]*STEK
	ticketTTL time.Duration
}

func NewSTEKManager(ticketTTL time.Duration) *STEKManager {
	return &STEKManager{
		keyRing:   make(map[[8]byte]*STEK),
		ticketTTL: ticketTTL,
	}
}

// Rotate generates a new active key and demotes the previous one to passive.
func (m *STEKManager) Rotate() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	newKey := &STEK{CreatedAt: time.Now()}
	if _, err := io.ReadFull(rand.Reader, newKey.ID[:]); err != nil {
		return err
	}
	if _, err := io.ReadFull(rand.Reader, newKey.Key[:]); err != nil {
		return err
	}

	m.keyRing[newKey.ID] = newKey
	m.activeKey = newKey

	// Evict keys well past their usefulness (2x ticket TTL passive buffer window)
	now := time.Now()
	for id, k := range m.keyRing {
		if now.Sub(k.CreatedAt) > (m.ticketTTL * 2) {
			delete(m.keyRing, id)
		}
	}
	return nil
}

// EncryptSession serializes and encrypts session state under the current active STEK.
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

	// KeyID is bound as associated data, preventing key-confusion attacks
	ciphertext := gcm.Seal(nil, nonce, sessionState, active.ID[:])

	payload := make([]byte, 8+len(nonce)+len(ciphertext))
	copy(payload[0:8], active.ID[:])
	copy(payload[8:8+len(nonce)], nonce)
	copy(payload[8+len(nonce):], ciphertext)
	return payload, nil
}

// DecryptSession resolves the correct generation key from the ticket's KeyID.
func (m *STEKManager) DecryptSession(ticket []byte) ([]byte, error) {
	if len(ticket) < 20 { // 8-byte KeyID + 12-byte nonce
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

	plaintext, err := gcm.Open(nil, nonce, ciphertext, keyID[:])
	if err != nil {
		return nil, fmt.Errorf("session decryption failed: %w", err)
	}
	return plaintext, nil
}

func main() {
	mgr := NewSTEKManager(1 * time.Hour)

	if err := mgr.Rotate(); err != nil {
		log.Fatalf("failed to initialize keys: %v", err)
	}

	originalSession := []byte("session-id:99824;master-secret:0xDEADBEEF;cipher:TLS_AES_256_GCM_SHA384")

	ticket, err := mgr.EncryptSession(originalSession)
	if err != nil {
		log.Fatalf("encryption failed: %v", err)
	}
	fmt.Printf("Generated ticket (hex): %x\n", ticket)

	fmt.Println("Rotating keys...")
	if err := mgr.Rotate(); err != nil {
		log.Fatalf("rotation failed: %v", err)
	}

	// The ticket was issued under the now-passive key; it must still decrypt.
	recovered, err := mgr.DecryptSession(ticket)
	if err != nil {
		log.Fatalf("decryption failed: %v", err)
	}
	fmt.Printf("Decrypted session: %s\n", string(recovered))
}
```

## Nginx: Where Most Teams Actually Configure This

```nginx
server {
    listen 443 ssl;
    server_name api.serenya.com;

    ssl_protocols TLSv1.3;

    ssl_session_tickets on;
    ssl_session_timeout 1h;

    # Rotate this file across the fleet — do not let it go stale
    ssl_session_ticket_key /etc/nginx/ssl/ticket_key.bin;
}
```

## Defensive Engineering Best Practices

1. **Rotate frequently.** Rotate the active STEK every 1–4 hours; keep passive keys in the ring no longer than twice the session ticket's TTL.
2. **AEAD only, always.** Never use CBC+HMAC for session tickets — use AES-GCM or ChaCha20-Poly1305, and bind the `KeyID` as authenticated associated data to prevent key-confusion attacks across generations.
3. **Cross-cluster synchronization.** In a distributed fleet, never generate STEKs independently on isolated nodes — a client resuming against a different node than it originally connected to needs that node to hold the same key. Use a centralized, secure distribution mechanism (HashiCorp Vault, or a Raft-backed coordinator) to synchronize rotated keys across all instances.
4. **Force ephemeral key exchange on resumption.** Use `psk_dhe_ke` mode (PSK combined with a fresh ECDHE exchange) rather than pure `psk_ke`, so forward secrecy holds for the *resumed* session even if the STEK is eventually compromised.

## Key Takeaways

- TLS 1.3 unifies session resumption entirely around PSK tickets, replacing TLS 1.2's split Session ID / Session Ticket mechanisms.
- A static, never-rotated STEK is a silent forward-secrecy hole: compromising it retroactively exposes every session ticket it ever encrypted.
- Multi-generation key rings (one active, several passive, decaying to retired) let you rotate keys continuously without breaking in-flight tickets issued under the previous generation.
- Prefer `psk_dhe_ke` over pure `psk_ke` so that even resumed sessions retain forward secrecy against a future STEK compromise.
