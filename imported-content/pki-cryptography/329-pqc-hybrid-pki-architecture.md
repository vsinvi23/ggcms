# Post-Quantum Hybrid PKI: Combining Classical ECC with ML-KEM

## The Problem: Shor's Algorithm and the "Store Now, Decrypt Later" Threat
A Cryptographically Relevant Quantum Computer (CRQC) running Shor's algorithm will completely compromise asymmetric cryptography based on integer factorization (RSA) and discrete logarithms (ECC). While a CRQC does not exist today, adversaries are currently employing a "Store Now, Decrypt Later" (SNDL) strategy—harvesting encrypted traffic to decrypt it when quantum computers become available. 

Transitioning exclusively to newly standardized Post-Quantum Cryptography (PQC) like ML-KEM (Kyber) poses its own risk: *algorithmic immaturity*. A novel classical cryptanalytic breakthrough could shatter a new PQC standard before a CRQC ever exists.

## The Solution: Hybrid Cryptography
The defense-in-depth approach is the Hybrid Key Encapsulation Mechanism (Hybrid KEM) and Hybrid PKI. By combining a mature classical algorithm (like ECDH over Curve25519) with a post-quantum algorithm (like ML-KEM-768), the resulting shared secret remains secure as long as *at least one* of the underlying algorithms remains unbroken.

### Protocol Flow: Hybrid KEM 
In a hybrid key exchange, both algorithms are executed in parallel. Their resulting shared secrets are concatenated or passed through a Key Derivation Function (KDF) to produce the final cryptographic key.

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

### Implementing Hybrid KEM in Go
Below is a robust conceptual implementation illustrating a hybrid KEM combination using X25519 and ML-KEM.

```go
package hybridpqc

import (
	"crypto/sha256"
	"fmt"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
	// Note: pseudo-import for ML-KEM
	"github.com/cloudflare/circl/kem/schemes"
)

type HybridSharedSecret struct {
	MasterKey []byte
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
	mlkem := schemes.ByName("Kyber768") // Circl uses older naming convention
	pubKey, err := mlkem.UnmarshalBinaryPublicKey(peerPubKeyMLKEM)
	if err != nil {
		return nil, err
	}
	
	ct, sharedMLKEM, err := mlkem.Encapsulate(pubKey)
	if err != nil {
		return nil, err
	}

	// 3. Combine using HKDF (SHA-256)
	combinedSecret := append(sharedX25519, sharedMLKEM...)
	
	hkdfReader := hkdf.New(sha256.New, combinedSecret, nil, []byte("hybrid-kem-v1"))
	masterKey := make([]byte, 32)
	if _, err := hkdfReader.Read(masterKey); err != nil {
		return nil, err
	}

	// Ciphertext to send back to initiator includes X25519 pubkey and ML-KEM ct
	hybridCT := append(myPubX25519, ct...)

	return &HybridSharedSecret{
		MasterKey:  masterKey,
		Ciphertext: hybridCT,
	}, nil
}
```

### Infrastructure Challenges
Moving to Hybrid PKI is not just an algorithmic swap. ML-KEM and ML-DSA keys and ciphertexts are significantly larger than ECC equivalents.

*   **P256 Public Key:** 32 bytes
*   **ML-KEM-768 Public Key:** 1184 bytes
*   **Hybrid Public Key:** ~1216 bytes

This size increase impacts TLS handshake performance, increasing packet fragmentation and latency. It requires upgrading HSMs, re-configuring certificate authorities to support composite OIDs, and ensuring middleboxes (like firewalls and load balancers) do not drop large TLS ClientHello messages.

By implementing Hybrid PKI today, architects can ensure forward secrecy against the CRQC threat while maintaining absolute mathematical certainty against classical crypto-analysis.