---
title: "PBKDF2 vs scrypt: From CPU-Hard Iteration to Memory-Hard Key Derivation"
description: "Why PBKDF2's pure iteration count fails against GPU/ASIC parallelism, how scrypt's ROMix algorithm forces memory-bound password hashing, and runnable Python/Node code for both KDFs."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "pbkdf2"
  - "scrypt"
  - "key-derivation-function"
  - "password-hashing"
  - "memory-hard"
  - "argon2"
---

# PBKDF2 vs scrypt: From CPU-Hard Iteration to Memory-Hard Key Derivation

## The Problem: The Speed of Cryptographic Hashes

A common misconception among junior developers is that cryptographic hash functions like SHA-256 are suitable for storing user passwords. This is a critical security flaw.

Functions like SHA-256 or MD5 were explicitly designed to be **fast and efficient**. They are optimized for checking file integrity or processing network packets at gigabytes per second. If a database is breached and attackers steal SHA-256 hashed passwords, they can leverage custom hardware to crack them with terrifying speed.

A modern GPU cluster can compute billions of SHA-256 hashes per second. With an offline dictionary attack, a GPU can brute-force every word in the English language, appending numbers and symbols, in mere minutes. To defend against this, we need to intentionally slow down the hashing process using **Key Derivation Functions (KDFs)**.

## CPU-Hard KDFs: PBKDF2

The initial solution was to make the hashing process computationally expensive.

**PBKDF2 (Password-Based Key Derivation Function 2, RFC 8018)** accomplishes this through iteration. Instead of hashing the password once, it hashes the password, then hashes the resulting hash, repeating this loop thousands of times (e.g., 600,000 iterations for PBKDF2-HMAC-SHA256, per OWASP's current guidance).

```text
Hash_1 = HMAC-SHA256(Password, Salt)
Hash_2 = HMAC-SHA256(Hash_1, Salt)
...
Hash_N = HMAC-SHA256(Hash_{N-1}, Salt)
```

While PBKDF2 slows down a legitimate server's login check to ~100 milliseconds, it forces the attacker's GPU to do the same. However, attackers quickly found a workaround: **parallelism**.

GPUs possess thousands of tiny Arithmetic Logic Units (ALUs). While a single iteration loop is slow, an attacker can load 10,000 different guessed passwords into a GPU and run the 600,000 iterations for all of them *simultaneously*. For state-sponsored actors, creating Application-Specific Integrated Circuits (ASICs) — chips hardwired exclusively to compute PBKDF2 loops — shattered the security margin entirely, because PBKDF2's iteration loop needs almost no memory: it is pure, embarrassingly parallel arithmetic.

### PBKDF2 in Practice

```python
import hashlib
import os

def hash_password_pbkdf2(password: str, iterations: int = 600_000) -> tuple[bytes, bytes]:
    salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
        dklen=32,
    )
    return salt, derived_key

def verify_password_pbkdf2(password: str, salt: bytes, expected_key: bytes, iterations: int = 600_000) -> bool:
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
    return hashlib.compare_digest(candidate, expected_key)
```

```javascript
// Node.js equivalent using the built-in crypto module
const crypto = require('crypto');

function hashPasswordPbkdf2(password, iterations = 600_000) {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return { salt, derivedKey };
}
```

## Memory-Hard KDFs: The scrypt Architecture

To defeat GPUs and ASICs, Colin Percival introduced **scrypt** in 2009. The genius of scrypt lies in shifting the bottleneck. Instead of making the function CPU-bound (which hardware parallelizes easily), scrypt makes the function **memory-bound**.

While an ASIC can pack thousands of ALUs onto a millimeter of silicon, it cannot pack gigabytes of high-speed RAM. Memory relies on physical space and bandwidth, which are extremely expensive to scale.

### The ROMix Function

At the heart of scrypt is the `ROMix` algorithm, which forces the hardware to allocate a massive block of memory, write pseudorandom data to it, and then perform unpredictable, random reads from it.

Here is the simplified mental model of scrypt:

1. **Initialization** — run a fast hash (like PBKDF2) to generate an initial block of data.
2. **The Memory Fill (Write Phase)** — create an array $V$ of size $N$ (e.g., $N = 1024 \times 1024$, taking hundreds of megabytes). Iteratively hash the data and store each intermediate result sequentially in the array.
   $$ V[0] = Hash(Data) $$
   $$ V[1] = Hash(V[0]) $$
   $$ \dots $$
   $$ V[N-1] = Hash(V[N-2]) $$
3. **The Random Read Phase** — take the last block, derive a pseudo-random integer $j$ from it, jump to that index in the array $V$, XOR the data, and hash it again. Repeat this random jumping process $N$ times.
   $$ j = \text{Integer}(Data) \pmod N $$
   $$ Data = Hash(Data \oplus V[j]) $$

### Why This Defeats ASICs and GPUs

Because the read phase uses a *pseudo-random* index $j$ derived from the previous step, the hardware cannot predict which memory address it will need next.

- **The Caching Problem** — GPUs rely on predictable memory access patterns (fetching blocks of data sequentially) to mask slow memory latency. Random jumps cause constant "cache misses," stalling the GPU cores while they wait for RAM.
- **The Die Space Problem** — to run 10,000 parallel password guesses, an ASIC would need to allocate 10,000 independent massive memory arrays (e.g., 10,000 $\times$ 128 MB = 1.2 Terabytes of ultra-fast onboard SRAM). This is physically impossible on a single chip.
- **The Time-Memory Tradeoff** — if an ASIC designer tries to save memory by *not* storing the array $V$ and instead recalculating $V[j]$ on the fly whenever it is needed, the computational cost skyrockets exponentially, completely defeating the purpose of the ASIC.

### scrypt in Practice

```python
import hashlib
import os

def hash_password_scrypt(password: str, n: int = 2**17, r: int = 8, p: int = 1) -> tuple[bytes, bytes]:
    salt = os.urandom(16)
    # n = CPU/memory cost, r = block size, p = parallelization factor
    derived_key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)
    return salt, derived_key
```

```javascript
// Node.js equivalent using the built-in crypto module
const crypto = require('crypto');

function hashPasswordScrypt(password) {
    const salt = crypto.randomBytes(16);
    // N=2^17 (~128MB working set), r=8, p=1 — tune N to your server's available RAM
    const derivedKey = crypto.scryptSync(password, salt, 32, { N: 2 ** 17, r: 8, p: 1 });
    return { salt, derivedKey };
}
```

## Conclusion

By binding cryptographic derivation to memory capacity and bandwidth rather than raw arithmetic speed, scrypt fundamentally changes the economics of password cracking. PBKDF2 remains an acceptable, FIPS-approved baseline when a memory-hard KDF is unavailable, but wherever the runtime allows it, scrypt (or its refinement, Argon2, which additionally resists cache-timing side channels) is the stronger choice. The memory-hard paradigm scrypt introduced remains the definitive defense against the immense parallel processing power of modern GPU and ASIC cracking hardware.
