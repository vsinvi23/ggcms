# The Birthday Paradox: Why a 128-bit Hash Collides in 2^64 Attempts

## The Problem: The Misleading Security of Bit-Width

When developers select a hash function for data integrity, deduplication, or digital signatures, they often evaluate its security strength by its output length. For instance, a 128-bit hash function (like MD5 or a truncated SHA-256) has a keyspace of $2^{128}$ possible values. It is intuitive but incorrect to assume that finding a collision (two different inputs $A$ and $B$ such that $Hash(A) = Hash(B)$) requires generating $2^{128}$ inputs.

This assumption confuses **Preimage Resistance** with **Collision Resistance**:
* **Preimage Resistance**: Given a specific target hash $H$, find an input $A$ such that $Hash(A) = H$. This requires $2^{n}$ brute-force attempts.
* **Collision Resistance**: Find *any* two arbitrary inputs $A$ and $B$ such that $Hash(A) = Hash(B)$. 

Because of the **Birthday Paradox**, finding any arbitrary matching pair is exponentially easier than matching a pre-selected target. A 128-bit hash space is reduced to just $2^{64}$ security strength under a collision search attack. This mathematical vulnerability has real-world consequences, such as making certificate signature forgery or Git commit collisions computationally feasible.

```text
    Collision Probability vs Number of Hash Computations (k)
P(Coll)
 1.0 +                                       * * * *
     |                                   * *
     |                                 *
 0.5 + - - - - - - - - - - - - - - - * (k \approx 1.18 \times \sqrt{H})
     |                             *
     |                           *
     |                        *
 0.0 + * * * * * * * * * * *
     +--------------------------------------------------> k
     0                     \sqrt{H}                    H
```

---

## The Mathematics of the Birthday Paradox

Let $H$ be the size of the hash keyspace ($H = 2^n$ where $n$ is the bit-width).
If we compute $k$ hashes from random inputs, we want to find the probability that at least two of these hashes are identical. It is easier to first compute the probability $P(\text{unique})$ that all $k$ hashes are completely unique.

The probability of the second hash being different from the first is:
$$1 - \frac{1}{H}$$

The probability of the third hash being different from the first two is:
$$1 - \frac{2}{H}$$

The joint probability that all $k$ hashes are unique is:
$$P(\text{unique}) = \prod_{i=0}^{k-1} \left(1 - \frac{i}{H}\right)$$

Using the Taylor series approximation $e^{-x} \approx 1 - x$ for small $x$, we can rewrite each term:
$$P(\text{unique}) \approx \prod_{i=0}^{k-1} e^{-\frac{i}{H}} = e^{-\sum_{i=0}^{k-1} \frac{i}{H}}$$

The summation in the exponent is an arithmetic series:
$$\sum_{i=0}^{k-1} i = \frac{k(k-1)}{2}$$

Therefore:
$$P(\text{unique}) \approx e^{-\frac{k(k-1)}{2H}} \approx e^{-\frac{k^2}{2H}}$$

The probability of at least one collision is $P(\text{collision}) = 1 - P(\text{unique})$:
$$P(\text{collision}) \approx 1 - e^{-\frac{k^2}{2H}}$$

To find the number of samples $k$ required to reach a 50% probability of collision ($P = 0.5$):
$$0.5 = 1 - e^{-\frac{k^2}{2H}} \implies e^{-\frac{k^2}{2H}} = 0.5$$
$$-\frac{k^2}{2H} = \ln(0.5) = -\ln(2)$$
$$k^2 = 2H \ln(2)$$
$$k = \sqrt{2 \ln(2) H} \approx 1.177 \sqrt{H}$$

Since $H = 2^n$, we get:
$$k \approx 1.177 \times 2^{n/2}$$

For $n=128$, the required operations are $k \approx 1.177 \times 2^{64}$. The cryptographic security strength is cut exactly in half.

---

## Implementation: Simulating a Birthday Attack in Python

Below is a Python demonstration showing how quickly a collision can be found when targeting a truncated 32-bit hash space ($H = 2^{32} \approx 4.29 \times 10^9$). The mathematical expected operations to achieve 50% probability is $k \approx 1.177 \times \sqrt{2^{32}} \approx 77,148$ iterations.

```python
import hashlib
import struct
import random

def truncate_hash_32(data: bytes) -> int:
    # Hash data with SHA-256 and truncate to 32 bits (4 bytes)
    full_hash = hashlib.sha256(data).digest()
    # Unpack first 4 bytes as an unsigned integer
    return struct.unpack("<I", full_hash[:4])[0]

def execute_birthday_attack():
    hash_lookup = {}
    attempts = 0
    expected_attempts = int(1.177 * (2**16))
    
    print(f"Target keyspace: 2^32 ({2**32} possibilities)")
    print(f"Expected attempts for 50% collision probability: {expected_attempts:,}")
    print("Beginning collision search...")
    
    while True:
        attempts += 1
        # Generate random input
        random_input = bytes([random.randint(0, 255) for _ in range(16)])
        hash_val = truncate_hash_32(random_input)
        
        # Check for collision
        if hash_val in hash_lookup:
            collision_input = hash_lookup[hash_val]
            if collision_input != random_input:
                print(f"\n[Collision Found] After {attempts:,} attempts!")
                print(f"Input A (Hex): {random_input.hex()}")
                print(f"Input B (Hex): {collision_input.hex()}")
                print(f"Shared 32-bit Hash Value: {hash_val} (Hex: {hash_val:08x})")
                
                # Double-check
                assert truncate_hash_32(random_input) == truncate_hash_32(collision_input)
                break
        else:
            hash_lookup[hash_val] = random_input
            
        if attempts % 20000 == 0:
            print(f"Checked {attempts:,} hashes...")

if __name__ == "__main__":
    execute_birthday_attack()
```

---

## Security Considerations and Mitigations

1. **Enforce Minimum Bit-Widths**:
   For applications requiring collision resistance (e.g., file deduplication, digital signatures, PKI certificates), never use hash functions with outputs smaller than 256 bits. A 256-bit hash (like SHA-256) yields $2^{128}$ collision resistance, which is currently computationally unbreakable.
2. **Beware of Truncation**:
   Truncating standard hash outputs to save space or network bandwidth directly degrades the collision threshold. If you truncate SHA-256 to 64 bits, it can be collided in only $2^{32} \approx 4.29$ billion attempts.
3. **Migrate Legacy Systems**:
   Decommission MD5 (128-bit) and SHA-1 (160-bit) entirely. Both have structural mathematical weaknesses that allow generating collisions much faster than the theoretical birthday bound.
