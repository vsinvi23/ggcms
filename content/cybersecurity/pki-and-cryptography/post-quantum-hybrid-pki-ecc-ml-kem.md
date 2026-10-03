---
title: "Post-Quantum Hybrid PKI: Combining Classical ECC with ML-KEM"
description: "A practical architecture and Go implementation guide for hybrid key encapsulation, combining X25519 and ML-KEM so a shared secret stays safe even if either the classical or post-quantum assumption fails, plus the infrastructure changes hybrid PKI demands."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "post-quantum-cryptography"
  - "hybrid-kem"
  - "ml-kem"
  - "x25519"
  - "hkdf"
  - "pki"
  - "store-now-decrypt-later"
---

# Post-Quantum Hybrid PKI: Combining Classical ECC with ML-KEM

## The Problem: Shor's Algorithm and "Store Now, Decrypt Later"

A Cryptographically Relevant Quantum Computer (CRQC) running Shor's algorithm would completely break asymmetric cryptography based on integer factorization (RSA) and discrete logarithms (ECC/ECDH). No CRQC exists today — but adversaries with long collection horizons are already executing a "Store Now, Decrypt Later" (SNDL) strategy: harvesting today's encrypted TLS and VPN traffic in bulk, betting that a future quantum computer will let them decrypt it retroactively. For data with a multi-decade confidentiality requirement (health records, national security communications, long-term IP), that bet already pays off even if the CRQC is a decade away.

The obvious fix — replace ECC with a new NIST-standardized PQC algorithm like ML-KEM (Kyber) — introduces a different risk: *algorithmic immaturity*. ML-KEM has been public and scrutinized for only a few years, versus multiple decades for ECC. A novel classical cryptanalytic break against the lattice assumption is not impossible.

## The Solution: Hybrid Key Encapsulation

**Hybrid KEM** runs a mature classical algorithm and a post-quantum algorithm in parallel and combines both resulting shared secrets through a KDF. The combined secret is only as weak as the *stronger* of the two remaining assumptions — an attacker must break **both** ECDH and ML-KEM to recover the session key, not just one.

### Protocol Flow

```text
+-----------+                                       +-----------+
| Initiator |                                       | Responder |
+-----------+                                       +-----------+
      |                                                   |
      | 1. Generate ECDH Keypair (sk_E, pk_E)             |
      | 2. Generate ML-KEM Keypair (sk_M, pk_M)           |
      |                                                   |
      |-------- (pk_E, pk_M) ---------------------------->|
      |                                                   |
      |                           3. ECDH: ss_E = DH(pk_E, sk_E_R)
      |                           4. ML-KEM: (ss_M, ct_M) = Encap(pk_M)
      |                           5. KDF: MasterKey = KDF(ss_E || ss_M)
      |                                                   |
      |<------- (pk_E_R, ct_M) ---------------------------|
      |                                                   |
      | 6. ECDH: ss_E = DH(pk_E_R, sk_E)                  |
      | 7. ML-KEM: ss_M = Decap(ct_M, sk_M)               |
      | 8. KDF: MasterKey = KDF(ss_E || ss_M)             |
      |                                                   |
      +---------------------------------------------------+
```

Both sides derive the same `MasterKey` because ECDH and ML-KEM decapsulation are each individually correct — the KDF step is what binds the two shared secrets together so neither can be used or attacked in isolation.

### Implementing Hybrid KEM in Go

```go
package hybridpqc

import (
	"crypto/sha256"
	"fmt"

	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
	// ML-KEM (Kyber) implementation
	"github.com/cloudflare/circl/kem/schemes"
)

type HybridSharedSecret struct {
	MasterKey  []byte
	Ciphertext []byte
}

func GenerateHybridSharedSecret(peerPubKeyX25519 []byte, peerPubKeyMLKEM []byte) (*HybridSharedSecret, error) {
	// 1. Classical: X25519
	myPrivX25519, myPubX25519, err := GenerateX25519Keypair()
	if err != nil {
		return nil, err
	}
	sharedX25519, err := curve25519.X25519(myPrivX25519, peerPubKeyX25519)
	if err != nil {
		return nil, err
	}

	// 2. Post-Quantum: ML-KEM-768
	mlkem := schemes.ByName("Kyber768") // Circl's pre-standardization naming
	pubKey, err := mlkem.UnmarshalBinaryPublicKey(peerPubKeyMLKEM)
	if err != nil {
		return nil, err
	}

	ct, sharedMLKEM, err := mlkem.Encapsulate(pubKey)
	if err != nil {
		return nil, err
	}

	// 3. Combine via HKDF (SHA-256). Concatenation order must be fixed and
	// documented — both peers must agree on ss_E || ss_M, never the reverse.
	combinedSecret := append(sharedX25519, sharedMLKEM...)

	hkdfReader := hkdf.New(sha256.New, combinedSecret, nil, []byte("hybrid-kem-v1"))
	masterKey := make([]byte, 32)
	if _, err := hkdfReader.Read(masterKey); err != nil {
		return nil, err
	}

	// The value sent back to the initiator carries both the X25519 public key
	// and the ML-KEM ciphertext.
	hybridCT := append(myPubX25519, ct...)

	return &HybridSharedSecret{
		MasterKey:  masterKey,
		Ciphertext: hybridCT,
	}, nil
}
```

A production implementation must clear `sharedX25519` and `sharedMLKEM` from memory after deriving `masterKey`, and must use a constant-time comparison anywhere the derived key or its hash is later checked — the same discipline required for any KDF output that guards long-lived session keys.

## Infrastructure Challenges

Moving to Hybrid PKI is not a drop-in algorithmic swap — ML-KEM and ML-DSA keys and ciphertexts are dramatically larger than their ECC equivalents:

| Component | Size |
|---|---|
| P-256 public key | 32 bytes |
| ML-KEM-768 public key | 1,184 bytes |
| Hybrid public key (X25519 + ML-KEM-768) | ~1,216 bytes |

That size increase has concrete downstream effects that need to be planned for before rollout, not discovered during an incident:

- **TLS handshake fragmentation.** A ClientHello carrying a hybrid key share can exceed a single TCP segment, and some legacy middleboxes (older load balancers, deep packet inspection appliances) drop or mishandle abnormally large ClientHellos.
- **HSM upgrades.** Most deployed HSM firmware has no native ML-KEM/ML-DSA support yet; vendor roadmaps and firmware upgrade windows need to be tracked as a migration dependency, not an afterthought.
- **CA and certificate format changes.** Supporting composite keys in X.509 requires composite OIDs (either draft IETF composite-signatures schemes or vendor-specific interim formats) and CA software that understands them.
- **Key/ciphertext storage sizing.** Databases, caches, and audit logs that assumed a 32–64 byte public key column now need to accommodate kilobyte-scale values.

By implementing Hybrid PKI today — X25519 combined with ML-KEM in the key exchange, while retaining classical certificates for authentication in the near term — architects get forward secrecy against the eventual CRQC threat immediately, without betting the entire system's security on ML-KEM's youth.
