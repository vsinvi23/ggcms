# AES-CBC Padding Oracles: How POODLE and Lucky13 Exploit Block Padding

The Cipher Block Chaining (CBC) mode of operation for block ciphers like AES has historically been the backbone of encrypted communication. However, its reliance on padding to ensure plaintexts align with block boundaries introduced a class of vulnerabilities known as padding oracle attacks. Exploits like POODLE (Padding Oracle On Downgraded Legacy Encryption) and Lucky13 devastated CBC mode in SSL/TLS by turning the decryption mechanism itself into an unintended side-channel oracle.

## The Core Problem: PKCS#7 Padding and Decryption Order

Block ciphers process data in fixed-size blocks (16 bytes for AES). If a plaintext is not a multiple of 16 bytes, it must be padded. The widely used PKCS#7 standard pads the block by appending $N$ bytes, each with the value $N$. If 4 bytes are needed, the padding is `0x04 0x04 0x04 0x04`.

In CBC mode, the decryption of ciphertext block $C_i$ involves decrypting $C_i$ with the key, and then XORing the result with the previous ciphertext block $C_{i-1}$ to yield plaintext $P_i$:
$P_i = Decrypt_K(C_i) \oplus C_{i-1}$

The fatal flaw in legacy TLS implementation was the **MAC-then-Encrypt** construction. The server would:
1. Decrypt the block.
2. Check and strip the PKCS#7 padding.
3. Validate the Message Authentication Code (MAC).

If an attacker intercepts a ciphertext and modifies $C_{i-1}$, the modified $C'_{i-1}$ directly alters the resulting plaintext $P'_i$ after the XOR operation. The server then attempts to strip the padding. If the resulting padding is invalid, the server immediately throws a decryption error. If valid, it proceeds to MAC validation (which subsequently fails, but takes longer or returns a different error). The server's differential response—whether explicit or via timing—creates a "padding oracle."

## Mental Model: The Mastermind and the Vault

Imagine you are trying to guess a combination to a vault. You can't see the dials, but you can hear the vault's internal mechanisms. If you turn a dial and hear a loud click immediately, you know the pin didn't fit the groove (Invalid Padding). If you hear a delayed buzzer, you know the pin fit the groove, but the final sequence was wrong (Valid Padding, Invalid MAC). By carefully manipulating the inputs and listening to the clicks, you can deduce the shape of every pin without ever seeing the key.

## Visualizing the Attack

```text
Attacker intercepts C[0] and C[1]. Wants to decrypt C[1].

1. Modifies last byte of C[0] -> C'[0]
2. Sends (IV, C'[0], C[1]) to Server.
3. Server computes: P'[1] = Decrypt(C[1]) XOR C'[0]

[Server Padding Check]
  |
  +--> INVALID PADDING -> TCP RST / Alert (Fast) --> Attacker learns P'[1][-1] != 0x01
  |
  +--> VALID PADDING (Ends in 0x01) -> MAC fails (Slow) --> Attacker learns P'[1][-1] == 0x01!
```

Once the attacker finds the byte in $C'[0]$ that yields a valid `0x01` padding, the math is trivial:
$P'[1][-1] = 0x01$
$Decrypt(C[1])[-1] \oplus C'[0][-1] = 0x01$
$Decrypt(C[1])[-1] = 0x01 \oplus C'[0][-1]$
$Original\_P[1][-1] = Decrypt(C[1])[-1] \oplus Original\_C[0][-1]$

The attacker has successfully decrypted the last byte of the ciphertext. By iterating this process, byte by byte, they recover the entire plaintext.

## From POODLE to Lucky13

**POODLE (CVE-2014-3566)** exploited this in SSLv3. SSLv3 did not specify the contents of padding bytes, only the final length byte, making it remarkably easy to manipulate the block and force a valid padding response. An attacker executing a Man-in-the-Middle (MitM) attack injected malicious JavaScript into a browser to force thousands of targeted requests, effectively decrypting secure cookies byte by byte.

**Lucky13 (CVE-2013-0169)** was a more insidious variant. Even after TLS 1.1 and 1.2 mandated uniform padding bytes (e.g., `0x03 0x03 0x03`) and unified the error messages to prevent explicit oracles, the time taken to process the MAC created a timing channel. Valid padding resulted in the server calculating the HMAC, while invalid padding bypassed HMAC calculation entirely. The minute timing difference—observable over the network—was enough to recreate the oracle.

## Code Demonstration: Exploiting the Oracle

Here is a simplified Python abstraction showing how an attacker extracts the intermediate state (the output of the block cipher before XOR).

```python
def find_intermediate_byte(oracle, c_prev, c_target, known_intermediate):
    pad_val = len(known_intermediate) + 1
    # Craft the prefix of the manipulated C_prev block
    prefix = c_prev[:16 - pad_val]
    # Craft the suffix using known intermediate bytes to force padding
    suffix = bytes([val ^ pad_val for val in known_intermediate])
    
    for guess in range(256):
        c_prev_mod = prefix + bytes([guess]) + suffix
        if oracle(c_prev_mod, c_target): # Returns True if padding is valid
            # We found the guess that resulted in pad_val
            intermediate_byte = guess ^ pad_val
            return intermediate_byte
    raise Exception("No valid padding found")
```

## The Final Nail in the CBC Coffin

The cryptographic community responded to these devastating attacks by abandoning CBC mode in favor of Authenticated Encryption with Associated Data (AEAD) ciphers like **AES-GCM** and **ChaCha20-Poly1305**. AEAD inherently follows an **Encrypt-then-MAC** paradigm, verifying the integrity of the ciphertext *before* attempting any decryption or padding inspection. By TLS 1.3, CBC mode was completely removed from the specification, permanently closing the vault on padding oracle attacks in modern web traffic.
