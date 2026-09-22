# Elliptic Curve Diffie-Hellman (ECDH): Finite Field Mathematics and Key Agreement

## The Problem: Classical Diffie-Hellman Scalability and Attack Vectors

Securely exchanging symmetric keys over an untrusted channel is a fundamental requirement of modern transport security. While classical Diffie-Hellman (DH) based on multiplicative groups of integers modulo a prime ($GF(p)$) solved this, it faces severe computational scalability challenges. To achieve a 128-bit security level, classical DH requires a prime modulus of at least 3072 bits, which demands high CPU usage and massive bandwidth overhead.

Furthermore, naive implementations of finite-field DH are susceptible to **small subgroup confinement attacks**, where a malicious peer sends a public key from a small subgroup to force the computed shared secret into a predictable, limited subset of values. 

Elliptic Curve Diffie-Hellman (ECDH) solves these issues. It achieves the equivalent 128-bit security level with just 256-bit keys, drastically reducing computation times and network overhead. However, ECDH is highly sensitive to implementation flaws, including **invalid curve attacks** (where an attacker submits a point that does not lie on the specified curve to extract the private scalar) and **timing side-channels**.

---

## ECDH Mathematical Foundations

ECDH operates on the algebraic structure of elliptic curves over a finite field $\mathbb{F}_p$. A curve $E$ (such as NIST P-256) is defined by the Weierstrass equation:

$$y^2 \equiv x^3 + ax + b \pmod p$$

Where $4a^3 + 27b^2 \not\equiv 0 \pmod p$ to ensure the curve contains no singularities.

### Point Addition and Scalar Multiplication
The core operations are:
1.  **Point Addition ($P + Q = R$):** Drawing a line through points $P$ and $Q$ on the curve; the line intersects the curve at a third point, which is reflected across the x-axis to find $R$.
2.  **Point Doubling ($2P = R$):** Drawing a tangent line at $P$, finding the intersection point, and reflecting it.
3.  **Scalar Multiplication ($Q = d \cdot G$):** Formed by repeated doubling and adding of a base generator point $G$, $d$ times. The security of ECDH depends on the **Elliptic Curve Discrete Logarithm Problem (ECDLP)**: given $Q$ and $G$, it is computationally infeasible to find the scalar $s$ such that $Q = s \cdot G$.

```
       Alice                                                    Bob
   (Private: dA)                                            (Private: dB)
         |                                                        |
   Compute Public:                                          Compute Public:
   QA = dA * G                                              QB = dB * G
         |                                                        |
         +------------------- Exchange Public Keys -------------->|
         |<----------------------- QB / QA -----------------------+
         |                                                        |
   Compute Shared Secret:                                   Compute Shared Secret:
   S_Alice = dA * QB                                        S_Bob = dB * QA
   S_Alice = dA * (dB * G)                                  S_Bob = dB * (dA * G)
         |                                                        |
         v                                                        v
   S_Shared = (dA * dB) * G  <===========================>  S_Shared = (dA * dB) * G
```

---

## Code Implementation: Secure Key Agreement with Curve Validation

Below is a robust Go implementation using the modern `crypto/ecdh` package (introduced in Go 1.20) to perform ECDH over the NIST P-256 curve and the Montgomery curve X25519. The modern package completely eliminates invalid curve attacks by making public point validation mandatory before scalar multiplication.

```go
package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"log"
)

// ECDHSession handles the secure key agreement flow
type ECDHSession struct {
	curve ecdh.Curve
}

func NewECDHSession(curveType string) (*ECDHSession, error) {
	var curve ecdh.Curve
	switch curveType {
	case "P256":
		curve = ecdh.P256()
	case "X25519":
		curve = ecdh.X25519()
	default:
		return nil, fmt.Errorf("unsupported curve type: %s", curveType)
	}
	return &ECDHSession{curve: curve}, nil
}

// GenerateKeyPair generates a cryptographically secure private/public keypair
func (s *ECDHSession) GenerateKeyPair() (*ecdh.PrivateKey, *ecdh.PublicKey, error) {
	privateKey, err := s.curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate key: %w", err)
	}
	return privateKey, privateKey.PublicKey(), nil
}

// DeriveSharedSecret computes the shared secret and derives a symmetric key using SHA-256
func (s *ECDHSession) DeriveSharedSecret(priv *ecdh.PrivateKey, peerPubBytes []byte) ([]byte, error) {
	// Parse and validate the peer's public key.
	// This step is critical: it enforces that the point lies on the curve and is not the point at infinity.
	peerPub, err := s.curve.NewPublicKey(peerPubBytes)
	if err != nil {
		return nil, fmt.Errorf("invalid peer public key point: %w", err)
	}

	// Perform the scalar multiplication: sharedSecret = priv * peerPub
	rawSecret, err := priv.ECDH(peerPub)
	if err != nil {
		return nil, fmt.Errorf("ecdh computation failed: %w", err)
	}

	// Apply a Single-Step Key Derivation Function (KDF) using SHA-256.
	// Never use the raw x-coordinate directly as a symmetric key.
	hasher := sha256.New()
	hasher.Write(rawSecret)
	derivedKey := hasher.Sum(nil)

	return derivedKey, nil
}

func main() {
	// Initialize a session using X25519 (highly resistant to timing side-channels)
	session, err := NewECDHSession("X25519")
	if err != nil {
		log.Fatalf("Failed to initialize session: %v", err)
	}

	// 1. Alice Generates Keypair
	alicePriv, alicePub, err := session.GenerateKeyPair()
	if err != nil {
		log.Fatalf("Alice keygen failed: %v", err)
	}

	// 2. Bob Generates Keypair
	bobPriv, bobPub, err := session.GenerateKeyPair()
	if err != nil {
		log.Fatalf("Bob keygen failed: %v", err)
	}

	// Serialize Public Keys for transmission over wire
	alicePubBytes := alicePub.Bytes()
	bobPubBytes := bobPub.Bytes()

	// 3. Alice derives the shared secret using Bob's public key
	aliceSharedKey, err := session.DeriveSharedSecret(alicePriv, bobPubBytes)
	if err != nil {
		log.Fatalf("Alice secret derivation failed: %v", err)
	}

	// 4. Bob derives the shared secret using Alice's public key
	bobSharedKey, err := session.DeriveSharedSecret(bobPriv, alicePubBytes)
	if err != nil {
		log.Fatalf("Bob secret derivation failed: %v", err)
	}

	// Verify both parties computed the exact same symmetric key
	fmt.Printf("Alice Key (Hex): %x\n", aliceSharedKey)
	fmt.Printf("Bob Key   (Hex): %x\n", bobSharedKey)
	
	if string(aliceSharedKey) == string(bobSharedKey) {
		fmt.Println("Success: Cryptographic key agreement completed securely!")
	} else {
		log.Fatal("Error: Derived keys mismatch!")
	}
}
```

---

## Defensive Engineering Best Practices

1.  **Enforce Key Derivation Functions (KDF):** The output of an ECDH exchange is a raw coordinate point on the curve, which is not uniformly distributed. You must run this output through a cryptographic KDF (like HKDF, or a simple SHA-256 hash) to generate a uniform key before passing it to symmetric algorithms like AES-GCM.
2.  **Mitigate Small Subgroup Attacks with Prime-Order Curves:** Prefer curves with co-factor $h = 1$ (like P-256) where every point on the curve (except the point at infinity) belongs to the main prime-order subgroup. When using curves with $h > 1$ (like Curve25519, where $h = 8$), ensure public keys are validated, or use the Montgomery ladder which inherently handles subgroup issues safely.
3.  **Prevent Twist Attacks:** If you parse points manually, always verify that the point satisfies the curve equation $y^2 = x^3 + ax + b \pmod p$. The Go `crypto/ecdh` and Rust `ring` libraries perform this check automatically during deserialization.
