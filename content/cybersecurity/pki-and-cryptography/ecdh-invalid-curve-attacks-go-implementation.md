---
title: "ECDH Implementation Security: Invalid Curve Attacks and Safe Key Agreement in Go"
description: "Why naive ECDH implementations are vulnerable to invalid curve and small subgroup attacks, and how Go's crypto/ecdh package enforces mandatory point validation to prevent them."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "ecdh"
  - "invalid-curve-attack"
  - "small-subgroup-attack"
  - "x25519"
  - "golang"
  - "elliptic-curve-cryptography"
---

# ECDH Implementation Security: Invalid Curve Attacks and Safe Key Agreement in Go

## The Problem: Classical Diffie-Hellman Scalability and Attack Vectors

Securely exchanging symmetric keys over an untrusted channel is a fundamental requirement of modern transport security. Classical Diffie-Hellman (DH), based on multiplicative groups of integers modulo a prime ($GF(p)$), solves this — but faces severe computational scalability challenges. To achieve a 128-bit security level, classical DH requires a prime modulus of at least 3072 bits, demanding high CPU usage and heavy bandwidth overhead.

Naive implementations of finite-field DH are also susceptible to **small subgroup confinement attacks**, where a malicious peer sends a public key from a small subgroup to force the computed shared secret into a predictable, limited subset of values.

Elliptic Curve Diffie-Hellman (ECDH) solves the scalability problem: it achieves an equivalent 128-bit security level with just 256-bit keys, drastically reducing computation time and network overhead. However, ECDH is highly sensitive to implementation flaws, including **invalid curve attacks** (where an attacker submits a point that does not lie on the specified curve, to extract the private scalar) and **timing side-channels**.

## ECDH Mathematical Foundations

ECDH operates on the algebraic structure of elliptic curves over a finite field $\mathbb{F}_p$. A curve $E$ (such as NIST P-256) is defined by the Weierstrass equation:

$$y^2 \equiv x^3 + ax + b \pmod p$$

where $4a^3 + 27b^2 \not\equiv 0 \pmod p$, to ensure the curve has no singularities.

### Point Addition and Scalar Multiplication

The core operations are:

1. **Point addition ($P + Q = R$)**: draw a line through points $P$ and $Q$; the line intersects the curve at a third point, which is reflected across the x-axis to find $R$.
2. **Point doubling ($2P = R$)**: draw a tangent line at $P$, find the intersection, and reflect it.
3. **Scalar multiplication ($Q = d \cdot G$)**: repeated doubling and adding of a base generator point $G$, $d$ times. The security of ECDH depends on the **Elliptic Curve Discrete Logarithm Problem (ECDLP)**: given $Q$ and $G$, it is computationally infeasible to find the scalar $d$ such that $Q = d \cdot G$.

```text
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

### The Invalid Curve Attack

The attack works because point addition and doubling formulas only use the curve coefficient $a$, never $b$. If an attacker sends a crafted point that satisfies $y^2 = x^3 + ax + b'$ for a *different*, weaker curve $b'$ (one with a small or smooth group order), a naive implementation happily performs the scalar multiplication anyway. Because the arithmetic never checks that the point actually lies on the intended curve, the resulting "shared secret" lands in the attacker's weak subgroup, where the discrete log is trivial to solve — leaking bits, or the entirety, of the victim's private scalar across repeated probes.

## Code Implementation: Secure Key Agreement with Mandatory Curve Validation

Below is a Go implementation using the modern `crypto/ecdh` package (introduced in Go 1.20) to perform ECDH over both NIST P-256 and the Montgomery curve X25519. The modern package eliminates invalid curve attacks by making public point validation mandatory before scalar multiplication ever runs.

```go
package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"log"
)

// ECDHSession handles the secure key agreement flow.
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

// GenerateKeyPair generates a cryptographically secure private/public keypair.
func (s *ECDHSession) GenerateKeyPair() (*ecdh.PrivateKey, *ecdh.PublicKey, error) {
	privateKey, err := s.curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate key: %w", err)
	}
	return privateKey, privateKey.PublicKey(), nil
}

// DeriveSharedSecret computes the shared secret and derives a symmetric key using SHA-256.
func (s *ECDHSession) DeriveSharedSecret(priv *ecdh.PrivateKey, peerPubBytes []byte) ([]byte, error) {
	// Parse and validate the peer's public key.
	// This step is critical: it enforces that the point lies on the curve and
	// is not the point at infinity — this is what prevents invalid curve attacks.
	peerPub, err := s.curve.NewPublicKey(peerPubBytes)
	if err != nil {
		return nil, fmt.Errorf("invalid peer public key point: %w", err)
	}

	// Perform the scalar multiplication: sharedSecret = priv * peerPub
	rawSecret, err := priv.ECDH(peerPub)
	if err != nil {
		return nil, fmt.Errorf("ecdh computation failed: %w", err)
	}

	// Apply a single-step Key Derivation Function using SHA-256.
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

	// 1. Alice generates a keypair
	alicePriv, alicePub, err := session.GenerateKeyPair()
	if err != nil {
		log.Fatalf("Alice keygen failed: %v", err)
	}

	// 2. Bob generates a keypair
	bobPriv, bobPub, err := session.GenerateKeyPair()
	if err != nil {
		log.Fatalf("Bob keygen failed: %v", err)
	}

	// Serialize public keys for transmission over the wire
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

## Defensive Engineering Best Practices

1. **Enforce Key Derivation Functions (KDF).** The output of an ECDH exchange is a raw coordinate point on the curve, which is not uniformly distributed. Always run this output through a cryptographic KDF (HKDF, or a simple SHA-256 hash) to generate a uniform key before passing it to symmetric algorithms like AES-GCM.
2. **Mitigate small subgroup attacks with prime-order curves.** Prefer curves with cofactor $h = 1$ (like P-256), where every point on the curve, except the point at infinity, belongs to the main prime-order subgroup. When using curves with $h > 1$ (like Curve25519, where $h = 8$), ensure public keys are validated, or use the Montgomery ladder, which inherently handles subgroup issues safely.
3. **Prevent twist attacks.** If you ever parse points manually, always verify the point satisfies the curve equation $y^2 = x^3 + ax + b \pmod p$. Go's `crypto/ecdh` and Rust's `ring` library perform this check automatically during deserialization — never reimplement point parsing yourself.
