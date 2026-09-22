---
title: "ChaCha20-Poly1305: Constant-Time AEAD for Software-Only Hardware"
description: "Why ARX-based stream ciphers outperform software AES on devices without hardware acceleration, how ChaCha20's quarter-round diffuses state, and how Poly1305 authenticates without a MAC key exchange."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "chacha20-poly1305"
  - "aead"
  - "stream-cipher"
  - "constant-time-cryptography"
  - "mobile-security"
  - "tls-1-3"
---

# ChaCha20-Poly1305: Constant-Time AEAD for Software-Only Hardware

## The Problem: AES Needs Hardware Help It Doesn't Always Get

AES-GCM is the default AEAD cipher across TLS, SSH, and most enterprise infrastructure — but its performance and safety both quietly depend on **AES-NI**, dedicated CPU instructions that most modern server and desktop chips include. When that silicon support isn't present — a budget smartphone, an IoT sensor, a legacy embedded controller — AES has to run in *software*, and software AES has two problems at once:

- **It's slow.** Table-lookup-based S-box operations without hardware acceleration cost real CPU cycles at scale.
- **It's a side-channel risk.** Those same table lookups access memory addresses that depend on the secret key. An attacker who can observe CPU cache timing (a well-documented, practical attack class) can, in principle, infer key bits from *how long* those lookups take — without ever touching the ciphertext.

What software-only environments need is a cipher that's fast *and* inherently immune to timing side-channels — one built entirely from operations that always take the same amount of time regardless of the data.

## The Solution: ARX Ciphers and Stream-Cipher Construction

**ChaCha20-Poly1305**, designed by Daniel J. Bernstein, answers both problems. It pairs a stream cipher (ChaCha20) with a polynomial message authentication code (Poly1305) into a single AEAD construction.

ChaCha20 avoids table lookups entirely, using an **ARX** design — **A**ddition, **R**otation, **X**OR — three integer operations that essentially every CPU architecture executes natively, in constant time, with no key-dependent memory access pattern to leak through cache timing.

## The ChaCha20 State Matrix

ChaCha20 initializes a 512-bit state as a 4×4 matrix of 32-bit words:

```text
[ "expa", "nd 3", "2-by", "te k" ]  // 4 constant words (fixed magic string)
[ Key0  , Key1  , Key2  , Key3   ]  // 8 words: the 256-bit key
[ Key4  , Key5  , Key6  , Key7   ]
[ Count , Nonce0, Nonce1, Nonce2 ]  // 32-bit block counter + 96-bit nonce
```

This matrix is scrambled through 20 rounds of a **quarter-round** function, each round mixing four of the sixteen words:

```c
// A C-like representation of the ChaCha quarter-round
void quarter_round(uint32_t *a, uint32_t *b, uint32_t *c, uint32_t *d) {
    *a += *b; *d ^= *a; *d = rotl32(*d, 16);
    *c += *d; *b ^= *c; *b = rotl32(*b, 12);
    *a += *b; *d ^= *a; *d = rotl32(*d, 8);
    *c += *d; *b ^= *c; *b = rotl32(*b, 7);
}
```

Applying this across the matrix's columns, then its diagonals, alternately, over 20 total rounds, fully diffuses the initial state — a small change to the key, nonce, or counter produces a completely different, unpredictable output. The final scrambled state is added back to the original state (preventing the mixing from being trivially reversible), producing a 64-byte keystream block. Just like AES-CTR, that keystream is XORed with the plaintext to produce ciphertext — ChaCha20 is a stream cipher, not a block cipher, so there's no padding to manage at all.

## Authentication: Poly1305

Encryption alone is still vulnerable to bit-flipping — an attacker who can't read the plaintext can still corrupt it predictably in transit. **Poly1305** closes this gap as a one-time, unforgeable authenticator.

Poly1305 derives its one-time 32-byte key from the very first ChaCha20 keystream block generated for a given message (so no separate key exchange step is needed). It treats the ciphertext as coefficients of a polynomial evaluated at a secret point $r$, reduced modulo the prime $2^{130} - 5$:

$$\text{Tag} = \left( (C_1 r^n + C_2 r^{n-1} + \dots + C_n r) \bmod (2^{130} - 5) \right) + s$$

where $C_i$ are 16-byte chunks of ciphertext, and $r, s$ are the two halves of the derived Poly1305 key. Because polynomial evaluation over a prime field is pure integer arithmetic — no lookup tables — Poly1305 matches ChaCha20's software speed while providing a provable, information-theoretic bound on how likely a forged tag is to be accepted.

## Code: ChaCha20-Poly1305 in Python

```python
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
import os

key = os.urandom(32)      # 256-bit key
nonce = os.urandom(12)    # 96-bit nonce — same uniqueness rule as AES-GCM
aad = b"header metadata"  # authenticated but not encrypted
plaintext = b"Sensitive payload for mobile transmission"

chacha = ChaCha20Poly1305(key)
ciphertext = chacha.encrypt(nonce, plaintext, aad)

# decrypt() authenticates both the AAD and the ciphertext before
# returning any plaintext — a failed tag raises InvalidTag, no partial data leaks
decrypted = chacha.decrypt(nonce, ciphertext, aad)
assert decrypted == plaintext
```

Exactly like AES-GCM, **the nonce must never repeat under the same key** — ChaCha20-Poly1305 inherits the identical nonce-reuse failure mode (keystream reuse breaks confidentiality; reused Poly1305 keys can leak the authenticator). Nothing about ChaCha20's software-friendliness changes that rule.

## Practical Deployment in TLS 1.3

`TLS_CHACHA20_POLY1305_SHA256` is a mandatory-to-implement cipher suite in TLS 1.3. In a real handshake, an older Android device without ARMv8 Cryptography Extensions will typically prioritize ChaCha20-Poly1305 over AES-GCM — it decrypts and authenticates the connection faster, uses less battery, and carries none of the cache-timing risk a software AES fallback would introduce on that same hardware.

## Key Takeaways

- ChaCha20-Poly1305 exists specifically for the gap AES-GCM leaves on hardware without AES-NI: software AES is both slow and a timing side-channel risk, while ChaCha20's ARX design is constant-time by construction.
- ChaCha20 is a stream cipher (no padding, no block alignment) using 20 rounds of addition/rotation/XOR to diffuse a 4×4 state matrix seeded with the key, nonce, and counter.
- Poly1305 derives its one-time authentication key from the cipher's own first keystream block, avoiding a separate MAC key exchange, and authenticates via polynomial evaluation over $GF(2^{130}-5)$.
- The nonce-uniqueness requirement is identical to AES-GCM's — ChaCha20-Poly1305's software-friendliness does not relax that rule at all.
