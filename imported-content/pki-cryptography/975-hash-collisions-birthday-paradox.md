# The Birthday Paradox: Why a 128-bit Hash Collides in 2^64 Attempts

## The Problem: Overestimating Hash Security Margins

Symmetric keys and cryptographic hash functions form the core of modern identity verification. When assessing security posture, developers often equate the output bit-length of a hash function directly to its workload resistance against brute-force attacks.

For example, a common security assumption is: "Because a UUID or custom token uses a 128-bit hash, finding a collision (two distinct inputs $m_1 \neq m_2$ yielding the exact same output $H(m_1) = Hash(m_2)$) requires searching the entire key-space, making it safe for $2^{128}$ generations."

This assumption is dangerously wrong. It conflates **Preimage Resistance** with **Collision Resistance**. 
- **Preimage Resistance:** Finding an input $x$ that hashes to a pre-selected target $Y$ (Complexity: $2^{128}$ attempts).
- **Collision Resistance:** Finding *any* two arbitrary inputs that yield the same hash (Complexity: $2^{64}$ attempts).

The mathematical phenomenon driving this half-strength security reduction is the **Birthday Paradox**.

---

## Architectural Blueprint: Preimage vs. Collision Space

```
   Preimage Resistance (Target-Specific)                Collision Resistance (Any Match)
+------------------------------------------+        +------------------------------------------+
|  Fixed Target Hash H_target              |        |   Input pool (n size) -> Hash set        |
|  Attacker generates candidate x          |        |   Checks for ANY overlapping pair.       |
|  Checks: Hash(x) == H_target             |        |   Comparisons: n(n-1)/2 connections.     |
|                                          |        |                                          |
|  Complexity: O(2^N)                      |        |   Complexity: O(2^(N/2))                 |
+------------------------------------------+        +------------------------------------------+
```

As the size of the generated hash pool grows, the number of potential overlapping pairs grows quadratically. In a room of $n$ people, we are not looking for a specific person with a specific birthday (Preimage), but rather *any* two people who share a birthday (Collision).

---

## Mathematical Derivation of the Collision Boundary

Let $H$ be the bit-length of the hash output, yielding a total of $d = 2^H$ possible outputs.
If we sample $n$ random inputs, the probability $P(n, d)$ that all $n$ hashes are unique is:

$$P(n, d) = 1 \cdot \left(1 - \frac{1}{d}\right) \cdot \left(1 - \frac{2}{d}\right) \dots \left(1 - \frac{n-1}{d}\right) = \prod_{i=0}^{n-1} \left(1 - \frac{i}{d}\right)$$

Using the Taylor series approximation $e^{-x} \approx 1 - x$ for small $x$:

$$P(n, d) \approx \prod_{i=0}^{n-1} e^{-i / d} = e^{-\sum_{i=0}^{n-1} i / d} = e^{-n(n-1) / 2d}$$

We want to find the number of attempts $n$ required for the probability of a collision to reach 50% ($P(n, d) = 0.5$):

$$e^{-n^2 / 2d} \approx 0.5 \implies -\frac{n^2}{2d} \approx \ln(0.5) \implies n \approx \sqrt{2 \ln(2) \cdot d} \approx 1.177 \sqrt{d}$$

Since $d = 2^H$:

$$n \approx 1.177 \cdot \sqrt{2^H} = 1.177 \cdot 2^{H/2}$$

For a 128-bit hash ($H=128$), a collision is expected with approximately $1.177 \cdot 2^{64}$ attempts. This mathematical reduction mandates that to achieve a 128-bit security margin, your hash functions must have an output size of at least 256 bits (e.g., SHA-256).

---

## Robust Python Simulation of the Birthday Paradox

The following highly optimized Python script demonstrates the Birthday Paradox by attacking a truncated SHA-256 hash. It evaluates a simulated output space of 32 bits and 40 bits, illustrating how collisions emerge within the precise boundaries predicted by the mathematical model.

```python
import hashlib
import time

def find_hash_collision(bit_length):
    """
    Simulates a Birthday attack on a truncated SHA-256 hash.
    Finds any two distinct inputs that yield the same truncated hash output.
    """
    seen_hashes = {}
    attempts = 0
    hex_chars_to_keep = (bit_length + 3) // 4  # Convert bits to hex character count
    
    # Calculate target theoretical collision bound
    theoretical_bound = int(1.177 * (2 ** (bit_length / 2)))
    print(f"\n[*] Target space: {bit_length}-bit hash ({2**bit_length} output states).")
    print(f"[*] Expected average attempts for collision: ~{theoretical_bound}")

    start_time = time.time()
    while True:
        attempts += 1
        # Generate random message
        message = f"token_attempt_{attempts}_{time.time_ns()}".encode()
        
        # Compute SHA-256 hash
        digest = hashlib.sha256(message).hexdigest()
        
        # Truncate hash to simulate the specific bit length
        truncated_hash = digest[:hex_chars_to_keep]
        
        if truncated_hash in seen_hashes:
            # Collision found!
            end_time = time.time()
            original_message = seen_hashes[truncated_hash]
            
            print(f"[+] Collision Found in {end_time - start_time:.4f} seconds!")
            print(f"    Attempts: {attempts}")
            print(f"    Message 1: {original_message.decode()}")
            print(f"    Message 2: {message.decode()}")
            print(f"    Shared Hash (Truncated): {truncated_hash}")
            return attempts
            
        seen_hashes[truncated_hash] = message

# Execution Sandbox
if __name__ == "__main__":
    print("[*] Running Birthday Paradox Simulations...")
    
    # Run 1: 32-bit output space (Expected attempts ~ 77,135)
    attempts_32 = find_hash_collision(32)
    
    # Run 2: 40-bit output space (Expected attempts ~ 1,234,175)
    attempts_40 = find_hash_collision(40)
