# AES-CBC Padding Oracles: How POODLE and Lucky13 Exploit Block Padding

## The Problem: Block Ciphers and PKCS#7 Padding

Advanced Encryption Standard (AES) in Cipher Block Chaining (CBC) mode is a block cipher. It operates on fixed-size blocks of data—specifically 16 bytes (128 bits) for AES. If an application needs to encrypt a plaintext message that is not an exact multiple of 16 bytes, the message must be padded.

The standard padding scheme is **PKCS#7**. In PKCS#7, the value of each added padding byte is the number of bytes added. 
- If 1 byte is needed, the padding is `0x01`.
- If 4 bytes are needed, the padding is `0x04 0x04 0x04 0x04`.
- If the message is exactly a multiple of 16 bytes, an entire 16-byte block of `0x10` (16) is added.

Upon decryption, the receiver decrypts the block, looks at the last byte to determine the padding length, and strips it off. 

### The Flaw: MAC-then-Encrypt and Oracle Feedback

Older protocols like TLS 1.0 and SSLv3 used a fundamentally flawed architecture known as **MAC-then-Encrypt**. 
1. Calculate a Message Authentication Code (MAC) over the plaintext.
2. Append the MAC to the plaintext.
3. Apply PKCS#7 padding.
4. Encrypt the whole structure using AES-CBC.

When a server decrypts this, it performs operations in reverse. Crucially, if the padding is mathematically invalid (e.g., ending in `0x04 0x04 0x03 0x04`), the server throws a "Padding Error." If the padding is valid but the MAC doesn't match, it throws a "MAC Error." 

This difference in error responses—whether via distinct HTTP codes, distinct TLS alerts, or simply timing differences (as in the Lucky13 attack)—creates a **Padding Oracle**. An attacker can use this oracle to decrypt the entire ciphertext byte-by-byte without ever knowing the encryption key.

## Technical Architecture: The Padding Oracle Attack

In CBC mode, the decryption of a ciphertext block ($C_N$) is XORed with the preceding ciphertext block ($C_{N-1}$) to produce the final plaintext block ($P_N$):
$P_N = Decrypt(C_N) \oplus C_{N-1}$

Because the attacker controls $C_{N-1}$ (it was intercepted over the wire), they can mutate it to manipulate the resulting plaintext $P_N$ as interpreted by the server.

```text
    Intercepted Ciphertext Blocks
    +----------------+  +----------------+
    |     C_{N-1}    |  |       C_N      |
    +-------+--------+  +-------+--------+
            |                   |
        (Mutate!)          (Decrypt(Key))
            |                   |
            +-----> (XOR) <-----+
                      |
              +-------v--------+
              | Modified P_N   | -> Server checks padding
              +----------------+    Returns: "Invalid Padding" or "Valid"
```

### The Byte-by-Byte Decryption Process

To decipher the last byte of $C_N$, the attacker wants the server to think the modified plaintext ends with valid 1-byte padding (`0x01`).

1. The attacker creates a mutated block $C'_{N-1}$, filling it with random data.
2. They iterate the last byte of $C'_{N-1}$ from `0x00` to `0xFF`, sending the modified ciphertexts to the server.
3. 255 times, the server will encounter invalid padding (e.g., the last byte becomes `0x8A`) and reject it.
4. Exactly 1 time, the server will encounter valid padding (the last byte becomes `0x01`) and accept it (potentially throwing a MAC error later, but the padding check succeeded).

When the server accepts the padding, the attacker knows:
$P'_{N}[15] = 0x01$
$0x01 = Decrypt(C_N)[15] \oplus C'_{N-1}[15]$
Therefore, the intermediate decrypted state is:
$Decrypt(C_N)[15] = 0x01 \oplus C'_{N-1}[15]$

Finally, the attacker calculates the *real* original plaintext byte by XORing the intermediate state with the *original* intercepted block:
$Original\_P_N[15] = Decrypt(C_N)[15] \oplus Original\_C_{N-1}[15]$

The attacker repeats this process for `0x02 0x02`, `0x03 0x03 0x03`, working backwards until the entire block—and subsequently the entire message—is decrypted.

## Implementation: Spotting the Vulnerability

The following pseudo-code demonstrates the exact vulnerability exploited by POODLE and Lucky13. The server inadvertently leaks information through its response path.

```python
# VULNERABLE SERVER CODE

def decrypt_and_verify(ciphertext, key, mac_key):
    # 1. Decrypt using AES-CBC
    raw_padded_data = aes_cbc_decrypt(ciphertext, key)
    
    # 2. Check and strip padding
    pad_length = raw_padded_data[-1]
    
    # VULNERABILITY: If padding is invalid, the function throws an immediate error
    # This acts as an oracle to the attacker!
    if not is_valid_pkcs7(raw_padded_data, pad_length):
        return HttpError(500, "Padding Error") 
        
    plaintext = raw_padded_data[:-pad_length]
    message_mac = plaintext[-32:] # Assuming HMAC-SHA256
    message_body = plaintext[:-32]
    
    # 3. Verify MAC
    expected_mac = hmac(mac_key, message_body)
    if not constant_time_compare(message_mac, expected_mac):
        return HttpError(500, "MAC Error")
        
    return message_body
```

### Timing Attacks (Lucky13)

Even if the server returns a generic "500 Decryption Failed" for both padding and MAC errors, it still takes *longer* to compute the HMAC than it does to fail the padding check. The Lucky13 attack proved that this minute timing discrepancy (measured in microseconds) is sufficient to act as a padding oracle over a network.

## The Solution: Encrypt-then-MAC and AEAD

To eliminate padding oracles entirely, modern cryptography abandoned MAC-then-Encrypt and CBC mode. 

The industry standard is **Authenticated Encryption with Associated Data (AEAD)**, specifically algorithms like **AES-GCM** (Galois/Counter Mode) or **ChaCha20-Poly1305**. These ciphers act as stream ciphers (requiring no padding) and simultaneously encrypt and authenticate data. If a ciphertext is tampered with, the mathematical authentication tag fails immediately, entirely circumventing the possibility of an oracle. TLS 1.3 strictly mandates AEAD ciphers, permanently closing the door on POODLE and Lucky13.
