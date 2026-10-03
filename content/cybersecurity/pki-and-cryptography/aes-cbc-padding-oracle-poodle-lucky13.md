---
title: "AES-CBC Padding Oracles: How POODLE and Lucky13 Broke TLS"
description: "How PKCS#7 padding checks in AES-CBC mode became a byte-by-byte decryption oracle, why POODLE and Lucky13 exploited it differently, and why AEAD ciphers close the hole for good."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "aes-cbc"
  - "padding-oracle"
  - "poodle"
  - "lucky13"
  - "pkcs7"
  - "aead"
  - "tls"
---

# AES-CBC Padding Oracles: How POODLE and Lucky13 Broke TLS

## The Problem: Block Ciphers, PKCS#7 Padding, and MAC-then-Encrypt

AES in Cipher Block Chaining (CBC) mode processes data in fixed 16-byte blocks. When a plaintext isn't an exact multiple of 16 bytes, it must be padded to fill the final block. The standard scheme, **PKCS#7**, pads with bytes whose *value* equals the *number* of bytes added:

- 1 byte needed → `0x01`
- 4 bytes needed → `0x04 0x04 0x04 0x04`
- Exact multiple of 16 → an entire extra block of `0x10 0x10 ... 0x10` (16 bytes)

On decryption, the receiver decrypts the final block, reads the last byte to determine how much padding was appended, and strips it before handing the plaintext to the application.

Older protocols (SSLv3, TLS 1.0/1.1) combined this with a flawed construction called **MAC-then-Encrypt**:

1. Compute a Message Authentication Code (MAC) over the plaintext.
2. Append the MAC to the plaintext.
3. Apply PKCS#7 padding.
4. Encrypt the whole structure with AES-CBC.

On the receiving end, the server has to reverse this: decrypt, strip padding, *then* verify the MAC. That ordering is the fatal flaw. If the stripped padding is invalid (e.g., the block ends in `0x04 0x04 0x03 0x04` — not a consistent PKCS#7 pattern), the server throws an error immediately, before ever computing the MAC. If the padding happens to be valid but the MAC doesn't match, the server takes a different path — often a different error code, and always at least a little more processing time (because it actually computed the MAC).

That distinguishable difference in server behavior — explicit error message or subtle timing — is a **padding oracle**: a yes/no answer to "was this ciphertext's padding valid?" that an attacker can query repeatedly and use to decrypt data without ever knowing the key.

## Why This Is Exploitable: The CBC Decryption Equation

In CBC mode, decrypting ciphertext block $C_i$ involves decrypting it with the block cipher and then XORing the result with the *previous* ciphertext block $C_{i-1}$:

$$P_i = \text{Decrypt}_K(C_i) \oplus C_{i-1}$$

Because $C_{i-1}$ travels over the wire, an attacker who intercepts it can **modify it directly**. Changing a byte of $C_{i-1}$ deterministically changes the corresponding byte of the *decrypted* $P_i$ once it's XORed — without needing the key at all.

```text
    Intercepted Ciphertext Blocks
    +----------------+  +----------------+
    |     C[i-1]     |  |       C[i]     |
    +-------+--------+  +-------+--------+
            |                   |
        (Attacker mutates      (Decrypt with key —
         one byte here)         attacker can't do this)
            |                   |
            +-----> (XOR) <-----+
                      |
              +-------v--------+
              |  Modified P[i] | -> Server checks PKCS#7 padding
              +----------------+    Returns: "Invalid Padding" (fast)
                                     or "Valid Padding" (slower, MAC checked)
```

### The Byte-by-Byte Attack

To recover the last byte of the real plaintext, the attacker:

1. Crafts a mutated $C'_{i-1}$ and sends `(IV, C'_{i-1}, C_i)` to the server.
2. Iterates the last byte of $C'_{i-1}$ through all 256 possible values.
3. For 255 of those values, the server rejects the message: "Invalid Padding" (fast failure).
4. For exactly one value, the server accepts the padding as valid `0x01` (it may still fail the MAC afterward, but the padding oracle has already leaked its answer via the differential response or timing).

Once the attacker finds the byte that produces a valid `0x01` padding, the algebra is trivial:

$$P'_i[-1] = 0x01 = \text{Decrypt}_K(C_i)[-1] \oplus C'_{i-1}[-1]$$
$$\Rightarrow \text{Decrypt}_K(C_i)[-1] = 0x01 \oplus C'_{i-1}[-1]$$

And because $\text{Decrypt}_K(C_i)$ is the same regardless of which block precedes it, XORing that intermediate value against the *original, unmodified* $C_{i-1}$ recovers the real plaintext byte:

$$\text{Original } P_i[-1] = \text{Decrypt}_K(C_i)[-1] \oplus \text{Original } C_{i-1}[-1]$$

Repeating this for `0x02 0x02`, `0x03 0x03 0x03`, and so on recovers the entire block, then the entire message, one byte at a time — all without ever recovering the AES key itself.

### Vulnerable Code Pattern

This is the exact shape of the bug in real, deployed server code:

```python
# VULNERABLE SERVER CODE — do not use

def decrypt_and_verify(ciphertext, key, mac_key):
    # 1. Decrypt using AES-CBC
    raw_padded_data = aes_cbc_decrypt(ciphertext, key)

    # 2. Check and strip padding
    pad_length = raw_padded_data[-1]

    # VULNERABILITY: an immediate, distinguishable error on bad padding
    # acts as an oracle to the attacker.
    if not is_valid_pkcs7(raw_padded_data, pad_length):
        return HttpError(500, "Padding Error")

    plaintext = raw_padded_data[:-pad_length]
    message_mac = plaintext[-32:]   # Assuming HMAC-SHA256
    message_body = plaintext[:-32]

    # 3. Verify MAC — only reached if padding happened to be valid
    expected_mac = hmac(mac_key, message_body)
    if not constant_time_compare(message_mac, expected_mac):
        return HttpError(500, "MAC Error")

    return message_body
```

A working proof-of-concept oracle query, abstracted:

```python
def find_intermediate_byte(oracle, c_prev, c_target, known_intermediate):
    """oracle(c_prev_mod, c_target) -> True if the server accepted the padding."""
    pad_val = len(known_intermediate) + 1
    prefix = c_prev[:16 - pad_val]
    # Force previously-recovered bytes to produce the next padding value
    suffix = bytes([val ^ pad_val for val in known_intermediate])

    for guess in range(256):
        c_prev_mod = prefix + bytes([guess]) + suffix
        if oracle(c_prev_mod, c_target):
            return guess ^ pad_val  # the intermediate decrypted byte
    raise Exception("No valid padding found — check block alignment")
```

## POODLE vs. Lucky13: Two Different Oracles

**POODLE (CVE-2014-3566)** targeted SSLv3 specifically. SSLv3's padding specification only mandated the *final* byte to encode the padding length — every other padding byte could be arbitrary garbage. This made it trivially easy for a man-in-the-middle to manipulate a block until it happened to end in a value the server accepted as valid padding. Attackers combined this with malicious JavaScript injected into a victim's browser to force thousands of automated requests, decrypting secure cookies (like session tokens) byte by byte.

**Lucky13 (CVE-2013-0169)** was more insidious because it worked even after TLS 1.1/1.2 tightened the padding rules (requiring every padding byte to match, e.g. `0x03 0x03 0x03`) and unified error responses to remove the *explicit* oracle. The remaining leak was **timing**: computing an HMAC over the message takes measurably longer than immediately rejecting invalid padding. That microsecond-scale difference, measured repeatedly over the network, was still enough to reconstruct the same oracle.

## The Fix: Encrypt-then-MAC and AEAD

The structural fix isn't a smarter padding check — it's removing the ordering flaw entirely. Modern cryptography abandoned MAC-then-Encrypt in favor of **Authenticated Encryption with Associated Data (AEAD)** ciphers like **AES-GCM** and **ChaCha20-Poly1305**, which:

- Verify a cryptographic authentication tag over the ciphertext **before** any decryption or padding logic runs.
- Use stream-cipher constructions that require **no padding at all**, eliminating the PKCS#7 attack surface entirely.
- Fail closed: an invalid tag means the function returns an error and *no* plaintext, full stop — there's no intermediate "padding valid, MAC invalid" state to leak information through.

TLS 1.3 mandates AEAD ciphers and removes CBC-mode cipher suites from the specification entirely, permanently closing the door on POODLE- and Lucky13-style attacks in modern web traffic. If you're still supporting TLS 1.0/1.1 or CBC-mode cipher suites for legacy client compatibility, that compatibility tail is exactly where this vulnerability class still lives.

## Key Takeaways

- A padding oracle exists whenever a system's response to decryption **distinguishes** "padding invalid" from "padding valid, integrity check failed" — via explicit error, HTTP status, or timing.
- The vulnerability isn't in AES itself; it's in the **MAC-then-Encrypt** ordering and CBC's malleability, which lets an attacker manipulate ciphertext blocks to control decrypted output.
- Timing side-channels (Lucky13) mean that even "identical error messages" don't fully close the oracle — constant-time comparison and constant-time padding checks matter.
- The durable fix is architectural: move to AEAD ciphers (AES-GCM, ChaCha20-Poly1305) that authenticate before decrypting and require no padding, and disable CBC-mode TLS cipher suites where possible.
