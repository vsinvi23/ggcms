# The Birthday Paradox: Why a 128-bit Hash Collides in $2^{64}$ Attempts

## The Problem: The Counter-Intuitive Mathematics of Collisions

A common architectural misconception is that the strength of a hash function against collisions is equal to its output space. Under this assumption, a 128-bit hash function (like MD5) would require $2^{128}$ brute-force evaluations to find two distinct inputs that produce the identical hash output.

This assumption is dangerously false.

While finding a **preimage** (reconstructing a specific message $x$ matching a pre-determined hash $Y$ such that $H(x) = Y$) indeed requires $2^{128}$ operations, finding an arbitrary **collision** (any two random messages $x_1$ and $x_2$ such that $H(x_1) = H(x_2)$) is governed by the **Birthday Paradox**. Because of the combinatorics of pair-wise matching, a 128-bit hash function will suffer a collision with greater than 50% probability after only **$2^{64}$** evaluations. This makes 128-bit hashes entirely obsolete for digital signatures and certificate integrity.

---

## Architectural Distinctions in Hash Security

```
[ Preimage Resistance ]
Given: Hash value Y
Goal:  Find x such that H(x) = Y
Complexity: O(2^H) where H is hash bits (e.g., 2^128 attempts)

      Input Space (2^128)               Target Output
      [   x_1   ]                       [     Y     ]
      [   x_2   ] ------------(Match?)-->[   Target  ]
      [   x_N   ]


[ Collision Resistance (Birthday Bound) ]
Given: None
Goal:  Find ANY x_1, x_2 such that H(x_1) = H(x_2)
Complexity: O(2^(H/2)) (e.g., 2^64 attempts)

      Input Space                       Hash Space
      [   x_1   ] -------> [ H(x_1) ] ---\
                                           +---> (Match!)
      [   x_2   ] -------> [ H(x_2) ] ---/
```

In preimage resistance, every single guess is compared to one fixed target. In collision resistance, every new guess is compared against **every previous guess**, generating a quadratic explosion of potential matching pairs.

---

## The Mathematical Proof

Let $N$ be the total size of the hash space (e.g., $N = 2^{128}$). If we select $k$ random inputs, we want to calculate the probability $P(k; N)$ that at least two inputs share the same hash. It is mathematically simpler to calculate the complementary probability $P^c(k; N)$ that all $k$ hashes are unique:

$$P^c(k; N) = 1 \cdot \left(1 - \frac{1}{N}\right) \cdot \left(1 - \frac{2}{N}\right) \dots \left(1 - \frac{k-1}{N}\right) = \prod_{i=0}^{k-1} \left(1 - \frac{i}{N}\right)$$

Using the Taylor series approximation $e^{-x} \approx 1 - x$ for small $x$:

$$P^c(k; N) \approx \prod_{i=0}^{k-1} e^{-\frac{i}{N}} = e^{-\sum_{i=0}^{k-1} \frac{i}{N}} = e^{-\frac{k(k-1)}{2N}} \approx e^{-\frac{k^2}{2N}}$$

We want to find the threshold $k$ where the probability of a collision $P(k; N) = 1 - P^c(k; N)$ reaches $0.50$ (50% chance):

$$0.50 \approx 1 - e^{-\frac{k^2}{2N}} \implies e^{-\frac{k^2}{2N}} \approx 0.50$$

Taking the natural logarithm of both sides:

$$-\frac{k^2}{2N} \approx \ln(0.50) \implies \frac{k^2}{2N} \approx 0.693$$

$$k \approx \sqrt{2 \ln(2) \cdot N} \approx 1.177 \sqrt{N}$$

For a 128-bit hash, $N = 2^{128}$. Thus:

$$k \approx 1.177 \sqrt{2^{128}} = 1.177 \cdot 2^{64} \approx 2^{64} \text{ evaluations}$$

---

## Go Implementation: Simulating a 32-bit Birthday Collision

The following Go program demonstrates the Birthday Paradox by truncating SHA-256 outputs to 32 bits ($2^{32}$ space). According to the formula, a collision should occur in roughly $1.18 \times \sqrt{2^{32}} \approx 77,000$ operations instead of $4.29$ billion.

```go
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/rand"
	"time"
)

func main() {
	// Seed random generator
	rand.Seed(time.Now().UnixNano())

	// Store observed hashes. Key: 32-bit hash, Value: original seed
	hashMap := make(map[uint32][]byte)

	var attempts uint64 = 0
	startTime := time.Now()

	fmt.Println("Simulating birthday collision attack on a truncated 32-bit hash space...")
	fmt.Printf("Expected attempts for 50%% collision chance: ~77,300\n\n")

	for {
		attempts++
		
		// Generate random payload
		payload := make([]byte, 16)
		binary.BigEndian.PutUint64(payload[0:8], rand.Uint64())
		binary.BigEndian.PutUint64(payload[8:16], rand.Uint64())

		// Compute SHA-256 hash
		hash := sha256.Sum256(payload)

		// Truncate hash to 32 bits (first 4 bytes)
		truncatedHash := binary.BigEndian.Uint32(hash[0:4])

		// Check for collision
		if existingPayload, exists := hashMap[truncatedHash]; exists {
			duration := time.Since(startTime)
			fmt.Printf("COLLISION FOUND!\n")
			fmt.Printf("Attempts: %d\n", attempts)
			fmt.Printf("Time taken: %s\n", duration)
			fmt.Printf("Truncated Hash (Hex): %08x\n", truncatedHash)
			fmt.Printf("Payload 1: %x\n", existingPayload)
			fmt.Printf("Payload 2: %x\n", payload)
			
			// Verify hashes actually match
			hash1 := sha256.Sum256(existingPayload)
			hash2 := sha256.Sum256(payload)
			if binary.BigEndian.Uint32(hash1[0:4]) == binary.BigEndian.Uint32(hash2[0:4]) {
				fmt.Println("Verification: Confirmed valid truncated hash match.")
			} else {
				fmt.Println("Verification Failed: Hash mismatch!")
			}
			break
		}

		// Store in map
		hashMap[truncatedHash] = payload
	}
}
```

---

## Architectural Guidelines for Modern Hashing

To defend enterprise systems from birthday collision threats:

1. **Retire obsolete hashes**: Deprecate all uses of MD5 (128-bit) and SHA-1 (160-bit, collision strength $2^{80}$ which has been cracked in practice).
2. **Standardize on $\ge$ 256-bit hashes**: Use SHA-256, SHA-384, or SHA-3. Under SHA-256, the birthday bound is $2^{128}$, which remains physically secure and completely out of reach for any modern supercomputer.
3. **Truncation awareness**: If you must truncate a SHA-256 hash to save storage (e.g., for database lookup keys), calculate the birthday collision probability of the target size first to ensure it remains cryptographically sound.
