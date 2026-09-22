# AES-CBC Padding Oracles: How POODLE and Lucky13 Exploit Block Padding

## The Problem: Malleability and Validation Leakage in CBC Mode

The Cipher Block Chaining (CBC) mode of operation for symmetric encryption (such as AES-CBC) requires the input plaintext to be a multiple of the cipher's block size (16 bytes for AES). To achieve this, cryptographic libraries use a padding scheme, most commonly **PKCS#7**.

Under PKCS#7, if $N$ bytes of padding are needed to fill the last block, the value of each padding byte is set exactly to $N$. For example, if 3 bytes of padding are required, the block ends with `0x03 0x03 0x03`.

The fatal flaw of CBC is its mathematical malleability combined with validation logic. If an application decrypts a ciphertext and returns an error—or leaks timing information—indicating whether the padding was structurally valid, it acts as a **Padding Oracle**. An active MitM (Man-in-the-Middle) attacker can exploit this oracle to decrypt intercepted ciphertexts byte-by-byte, or even forge arbitrary messages, without ever learning the secret key.

---

## Architectural Vulnerability: CBC Decryption Mechanics

In CBC decryption, the plaintext block $P_i$ is computed by passing the current ciphertext block $C_i$ through the raw block cipher decryption engine $D_K$ and then XORing the result with the *previous* ciphertext block $C_{i-1}$ (or the Initialization Vector $IV$ for $C_1$):

$$P_i = D_K(C_i) \oplus C_{i-1}$$

```
           [ Ciphertext Block C_{i-1} ]        [ Ciphertext Block C_i ]
                        |                                |
                        | (Manipulated by Attacker)      v
                        |                         +--------------+
                        |                         | Decryption D |
                        |                         +--------------+
                        |                                |
                        +------------> (XOR) <-----------+
                                        |
                                        v
                            [ Plaintext Block P_i ]
```

Because of this structure, modifying the $k$-th byte of $C_{i-1}$ directly and predictably changes the $k$-th byte of the decrypted plaintext $P_i$. By systematically altering $C_{i-1}$ and sending the modified ciphertexts to the server, the attacker forces the server to decrypt the block and check the PKCS#7 padding.

* **POODLE (Padding Oracle On Downgraded Legacy Encryption)**: Exploited SSL 3.0's loose padding structure (where the value of padding bytes was undefined, except for the last byte). Attackers forced TLS downgrades to SSL 3.0 and executed padding oracle queries over secure cookie headers.
* **Lucky 13**: A highly sophisticated timing side-channel attack targeting TLS 1.1/1.2. Even if servers don't return an explicit padding error, they take slightly longer to process MAC computations (like HMAC-SHA1) when the padding is correct vs. incorrect. This microscopic CPU time differential is enough to leak plaintext bytes.

---

## Python Implementation: Simulating a CBC Padding Oracle Attack

Below is a complete Python implementation demonstrating how an attacker can decrypt a ciphertext byte-by-byte using only a boolean padding oracle (which returns `True` if the decrypted payload has valid PKCS#7 padding, and `False` otherwise).

```python
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

BLOCK_SIZE = 16

class CryptographicServerOracle:
    """Simulates a secure server that decrypts ciphertexts and leaks padding validity."""
    def __init__(self):
        self._key = os.urandom(32) # AES-256 key

    def encrypt(self, plaintext: bytes) -> bytes:
        iv = os.urandom(BLOCK_SIZE)
        # Apply PKCS#7 padding manually
        pad_len = BLOCK_SIZE - (len(plaintext) % BLOCK_SIZE)
        padded_text = plaintext + bytes([pad_len] * pad_len)
        
        cipher = Cipher(algorithms.AES(self._key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        return iv + encryptor.update(padded_text) + encryptor.finalize()

    def check_padding_oracle(self, ciphertext: bytes) -> bool:
        """The Padding Oracle: returns True if padding is valid PKCS#7, False otherwise."""
        iv = ciphertext[:BLOCK_SIZE]
        actual_ct = ciphertext[BLOCK_SIZE:]
        
        cipher = Cipher(algorithms.AES(self._key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        try:
            decrypted = decryptor.update(actual_ct) + decryptor.finalize()
            # Validate PKCS#7 padding structure
            pad_len = decrypted[-1]
            if pad_len < 1 or pad_len > BLOCK_SIZE:
                return False
            for val in decrypted[-pad_len:]:
                if val != pad_len:
                    return False
            return True
        except Exception:
            return False

def padding_oracle_decrypt_block(oracle: CryptographicServerOracle, c_prev: bytes, c_curr: bytes) -> bytes:
    """Decrypts a single block c_curr using c_prev and the padding oracle."""
    decrypted_intermediates = [0] * BLOCK_SIZE
    plaintext = [0] * BLOCK_SIZE

    # Work backwards from the last byte (index 15) to the first byte (index 0)
    for byte_idx in range(BLOCK_SIZE - 1, -1, -1):
        target_pad_val = BLOCK_SIZE - byte_idx
        
        # We need to construct a mutated previous block c_prime
        c_prime = bytearray(c_prev)
        
        # Fill in already discovered bytes to match the target padding value
        for i in range(byte_idx + 1, BLOCK_SIZE):
            c_prime[i] = decrypted_intermediates[i] ^ target_pad_val

        found = False
        for candidate_byte in range(256):
            c_prime[byte_idx] = candidate_byte
            # Query the oracle
            payload = bytes(c_prime) + c_curr
            if oracle.check_padding_oracle(payload):
                # Double check to prevent false positives in edge cases
                if byte_idx == BLOCK_SIZE - 1:
                    c_prime[byte_idx - 1] ^= 1
                    payload_double_check = bytes(c_prime) + c_curr
                    if not oracle.check_padding_oracle(payload_double_check):
                        continue
                
                # Intermediate byte represents: D_K(C_i)[byte_idx]
                decrypted_intermediates[byte_idx] = candidate_byte ^ target_pad_val
                plaintext[byte_idx] = decrypted_intermediates[byte_idx] ^ c_prev[byte_idx]
                found = True
                break
                
        if not found:
            raise RuntimeError(f"Decryption failed at byte index {byte_idx}")
            
    return bytes(plaintext)

# --- Verification ---
if __name__ == "__main__":
    server = CryptographicServerOracle()
    secret_message = b"CONFIDENTIAL_PAYMENT_DATA_TOKEN"
    ciphertext = server.encrypt(secret_message)

    print(f"Intercepted Ciphertext (Hex): {ciphertext.hex()}")
    
    # Split ciphertext into blocks
    blocks = [ciphertext[i:i+BLOCK_SIZE] for i in range(0, len(ciphertext), BLOCK_SIZE)]
    decrypted_plaintext = b""
    
    # Decrypt block by block
    for idx in range(1, len(blocks)):
        decrypted_block = padding_oracle_decrypt_block(server, blocks[idx-1], blocks[idx])
        decrypted_plaintext += decrypted_block
        print(f"Decrypted block {idx}: {decrypted_block}")

    # Strip PKCS#7 padding manually to display final output
    final_pad_len = decrypted_plaintext[-1]
    recovered_text = decrypted_plaintext[:-final_pad_len]
    print(f"\nSuccessfully Recovered Message: {recovered_text.decode('utf-8')}")
    assert recovered_text == secret_message, "Recovery mismatch!"
```

---

## The Ultimate Mitigation: AEAD (Authenticated Encryption)

To eliminate padding oracle vulnerabilities completely, systems must abandon CBC mode and migrate to **AEAD (Authenticated Encryption with Associated Data)** schemes:

1. **AES-GCM**: Integrates symmetric encryption with a GMAC authentication tag. The decryption engine validates the tag *before* attempting any decryption, rejecting tampered ciphertext blocks immediately and operating in constant time.
2. **ChaCha20-Poly1305**: An exceptionally fast, hardware-independent alternative that combines the ChaCha20 stream cipher with the Poly1305 authenticator, inherently immune to block padding exploits.
