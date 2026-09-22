# Digital Signatures: The Mathematics of ECDSA Verification and Nonce Leakage Hazards

## The Problem: The Fragile Lifecycle of ECDSA Nonces

The Elliptic Curve Digital Signature Algorithm (ECDSA) is the mathematical bedrock of digital signatures in blockchains (Bitcoin, Ethereum), TLS connections, and SSH handshakes. It is favored for its small signature sizes and fast processing speeds.

However, ECDSA is incredibly fragile under **nonce leakage or reuse**. 

To generate an ECDSA signature, the signer must generate a unique, cryptographically secure random value $k$ (the **nonce**) for every single signature. If an implementation:
1.  **Reuses the same nonce $k$** across two different messages signed with the same private key,
2.  **Leaks even a few bits of $k$** across multiple signatures (due to a biased or weak PRNG, or side-channel leakage),

an observer can execute a trivial algebraic attack (or run a Lattice Reduction algorithm for partial leaks) to **instantly extract the private key $d$**, compromising the entire system. This exact flaw was famously used to extract the master private key of the Sony PlayStation 3.

---

## The Mathematics of ECDSA and Key Recovery

Let $E$ be an elliptic curve over finite field $\mathbb{F}_p$, with generator $G$ of prime order $n$. The signer has private key $d \in [1, n-1]$ and public key $Q = d \cdot G$.

### The ECDSA Signing Algorithm
To sign a message hash $z$:
1.  Select a cryptographically secure random integer $k \in [1, n-1]$.
2.  Compute the curve point:
    $$R = k \cdot G$$
3.  Compute the x-coordinate coordinate of $R$:
    $$r = x_R \pmod n \quad (\text{if } r = 0, \text{ start over})$$
4.  Compute:
    $$s = k^{-1}(z + r \cdot d) \pmod n \quad (\text{if } s = 0, \text{ start over})$$

The resulting signature is the coordinate pair $(r, s)$.

### Key Extraction via Nonce Reuse
Suppose a developer signs two distinct message hashes $z_1$ and $z_2$ using the same key $d$ and the exact same nonce $k$. This yields two signatures: $(r, s_1)$ and $(r, s_2)$. Notice that $r$ is identical because $R = k \cdot G$ remains constant.

We have a system of two equations:

$$s_1 \equiv k^{-1}(z_1 + r \cdot d) \pmod n \implies k \cdot s_1 \equiv z_1 + r \cdot d \pmod n$$

$$s_2 \equiv k^{-1}(z_2 + r \cdot d) \pmod n \implies k \cdot s_2 \equiv z_2 + r \cdot d \pmod n$$

Subtracting the two equations eliminates the private key $d$:

$$k(s_1 - s_2) \equiv (z_1 - z_2) \pmod n$$

$$k \equiv (z_1 - z_2)(s_1 - s_2)^{-1} \pmod n$$

Once the nonce $k$ is recovered, the private key $d$ is extracted via simple algebra:

$$d \equiv r^{-1}(s_1 \cdot k - z_1) \pmod n$$

```
   Intercept Signature 1: (r, s1) for Hash z1
   Intercept Signature 2: (r, s2) for Hash z2  <-- Same 'r' implies same nonce 'k'!
            |
            v
   Calculate Nonce: k = (z1 - z2) * (s1 - s2)^-1 mod n
            |
            v
   Extract Private Key: d = r^-1 * (s1 * k - z1) mod n  ===> Complete Key Compromise!
```

---

## Code Implementation: Private Key Recovery from Nonce Reuse in Go

Below is an algebraic proof-of-concept in Go that demonstrates key recovery from two signatures that reused a nonce, followed by the correct, deterministic solution.

```go
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"fmt"
	"math/big"
)

// RecoverPrivateKey extracts the private key d given two signatures generated with the same nonce k
func RecoverPrivateKey(curve elliptic.Curve, z1, z2 *big.Int, r, s1, s2 *big.Int) (*big.Int, error) {
	n := curve.Params().N

	// 1. Calculate (s1 - s2) mod n
	sDiff := new(big.Int).Sub(s1, s2)
	sDiff.Mod(sDiff, n)

	// 2. Calculate modular inverse of (s1 - s2)
	sDiffInv := new(big.Int).ModInverse(sDiff, n)
	if sDiffInv == nil {
		return nil, fmt.Errorf("failed to calculate inverse of signature difference")
	}

	// 3. Calculate (z1 - z2) mod n
	zDiff := new(big.Int).Sub(z1, z2)
	zDiff.Mod(zDiff, n)

	// 4. Recover Nonce k = (z1 - z2) * (s1 - s2)^-1 mod n
	k := new(big.Int).Mul(zDiff, sDiffInv)
	k.Mod(k, n)

	// 5. Calculate r^-1 mod n
	rInv := new(big.Int).ModInverse(r, n)
	if rInv == nil {
		return nil, fmt.Errorf("failed to calculate inverse of r")
	}

	// 6. Recover Private Key: d = r^-1 * (s1 * k - z1) mod n
	s1TimesK := new(big.Int).Mul(s1, k)
	s1TimesKMinusZ1 := new(big.Int).Sub(s1TimesK, z1)
	
	d := new(big.Int).Mul(rInv, s1TimesKMinusZ1)
	d.Mod(d, n)

	return d, nil
}

func main() {
	// P-256 Elliptic Curve Parameters
	curve := elliptic.P256()
	
	// Simulated Message Hashes
	z1 := new(big.Int).SetBytes(sha256.New().Sum([]byte("message-one")))
	z2 := new(big.Int).SetBytes(sha256.New().Sum([]byte("message-two")))

	// Simulated victim private key d (highly secret)
	targetD, _ := new(big.Int).SetString("998242486152e071e6264ffb5fa38c82110c7bf7c8ad81ba24fbc7bc4f251c11", 16)
	
	// Vulnerable shared nonce k
	sharedK, _ := new(big.Int).SetString("7777777777777777777777777777777777777777777777777777777777777777", 16)

	// Compute shared r coordinate: R = k * G
	rX, _ := curve.ScalarBaseMult(sharedK.Bytes())
	r := new(big.Int).Mod(rX, curve.Params().N)

	// Compute s1 = k^-1 * (z1 + r * d) mod n
	kInv := new(big.Int).ModInverse(sharedK, curve.Params().N)
	
	rTimesD := new(big.Int).Mul(r, targetD)
	rTimesD.Mod(rTimesD, curve.Params().N)
	
	s1Val := new(big.Int).Add(z1, rTimesD)
	s1 := new(big.Int).Mul(kInv, s1Val)
	s1.Mod(s1, curve.Params().N)

	// Compute s2 = k^-1 * (z2 + r * d) mod n
	s2Val := new(big.Int).Add(z2, rTimesD)
	s2 := new(big.Int).Mul(kInv, s2Val)
	s2.Mod(s2, curve.Params().N)

	// Attack Phase: Recover private key from public signatures (r, s1) and (r, s2)
	recoveredD, err := RecoverPrivateKey(curve, z1, z2, r, s1, s2)
	if err != nil {
		log.Fatalf("Attack failed: %v", err)
	}

	fmt.Printf("Victim Private Key (Hex): %x\n", targetD)
	fmt.Printf("Recovered Key      (Hex): %x\n", recoveredD)
	
	if targetD.Cmp(recoveredD) == 0 {
		fmt.Println("CRITICAL BREAK: Private key extracted successfully due to nonce reuse!")
	}
}
```

---

## Defensive Engineering Best Practices

1.  **Enforce Deterministic Nonce Generation (RFC 6979):** The absolute mitigation for ECDSA nonce issues is RFC 6979. This standard specifies deriving the nonce $k$ deterministically using an HMAC-SHA256 of the private key $d$ and the message hash $z$:
    $$k = \text{HMAC-SHA256}(d, z)$$
    This guarantees that $k$ is completely unguessable, yet remains identical if (and only if) the exact same message is signed under the same key. The Go standard library (`crypto/ecdsa`) and modern Rust standard libraries enforce RFC 6979 by default.
2.  **Migrate to Ed25519 (EdDSA):** For modern protocols, prefer **Ed25519** (Edwards-curve Digital Signature Algorithm) over ECDSA. EdDSA has deterministic nonce generation built directly into the mathematical specification of the algorithm, preventing developers from ever deploying custom, weak PRNG loops.
3.  **Harden against Side-Channel Timing Attacks:** If using variable-time scalar multiplication to compute $k \cdot G$, an attacker can measure execution times to recover bits of $k$. Always use constant-time group operations (such as point-doubling ladders) to prevent timing leakage of nonce parameters.
