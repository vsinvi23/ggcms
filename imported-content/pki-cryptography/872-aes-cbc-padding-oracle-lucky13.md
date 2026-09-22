# AES-CBC Padding Oracles: How POODLE and Lucky13 Exploit Block Padding

## The Problem: Cryptographic Side-Channels in CBC Decryption

Cipher Block Chaining (CBC) has been a workhorse of symmetric encryption for decades. However, its decryption pipeline relies on a dangerous assumption: that decryption errors are handled uniformly. 

During CBC decryption, the ciphertext is processed block-by-block, and the resulting plaintext is verified against the PKCS#7 padding standard. If a block is decrypted, but the trailing padding bytes are structurally invalid (e.g., the padding indicates `0x03` but the last three bytes are not `0x03, 0x03, 0x03`), the decryptor throws a padding error. If the padding is valid, the decryptor strips the padding and verifies the Message Authentication Code (MAC) for data integrity.

The core vulnerability—exploited by attacks like POODLE (Padding Oracle On Downgraded Legacy Encryption) and Lucky13—occurs when an application leaks whether a decryption failure was due to **invalid padding** or a **bad MAC**. This leakage can happen explicitly via different error messages or implicitly through response-time discrepancies (timing side-channels). If an attacker can submit modified ciphertexts and learn whether the padding is valid, they can decrypt the payload byte-by-byte without knowing the key.

```text
    Ciphertext Block C_{i-1}              Ciphertext Block C_i
            |                                     |
            |                                     v
            |                            [Block Decryption]
            |                                     |
            |                                     v
            +------------> [ XOR ] <------- Decrypted Block
                             |
                             v
                    Plaintext Block P_i (Ends with PKCS#7 padding)
                             |
                             +--> Leaks "Valid Padding" vs "Invalid Padding"?
```

---

## The Mathematics of the Attack

The CBC decryption formula for block $i$ is:
$$P_i = D_K(C_i) \oplus C_{i-1}$$

To decrypt the last byte of plaintext block $P_i[15]$, the attacker clones the ciphertext and manipulates the last byte of the previous ciphertext block $C_{i-1}[15]$. By varying this byte from `0x00` to `0xff` and sending it to the oracle, the attacker looks for the one value that produces a valid padding format (specifically, a single padding byte of `0x01` at the end).

When the oracle returns "valid padding" for a modified ciphertext block $C'_{i-1}$:
$$P'_i[15] = D_K(C_i)[15] \oplus C'_{i-1}[15] = \text{0x01}$$

Since $D_K(C_i)[15] = P_i[15] \oplus C_{i-1}[15]$, we can substitute this back:
$$P_i[15] \oplus C_{i-1}[15] \oplus C'_{i-1}[15] = \text{0x01}$$
$$P_i[15] = C_{i-1}[15] \oplus C'_{i-1}[15] \oplus \text{0x01}$$

The attacker now knows the original plaintext byte $P_i[15]$! This process is then repeated from right to left for all 16 bytes of the block.

---

## Implementation: Decrypting AES-CBC in Python

The following Python script implements a local padding oracle simulation, showing how an attacker can systematically extract plaintext from a ciphertext block without the key.

```python
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

class VulnerableOracle:
    def __init__(self):
        self._key = os.urandom(16)
        self._backend = default_backend()

    def encrypt(self, plaintext: bytes) -> bytes:
        iv = os.urandom(16)
        # Apply PKCS#7 padding
        pad_len = 16 - (len(plaintext) % 16)
        padded_plaintext = plaintext + bytes([pad_len] * pad_len)
        
        cipher = Cipher(algorithms.AES(self._key), modes.CBC(iv), backend=self._backend)
        encryptor = cipher.encryptor()
        return iv + encryptor.update(padded_plaintext) + encryptor.finalize()

    def decrypt_and_validate_padding(self, ciphertext: bytes) -> bool:
        iv = ciphertext[:16]
        payload = ciphertext[16:]
        
        cipher = Cipher(algorithms.AES(self._key), modes.CBC(iv), backend=self._backend)
        decryptor = cipher.decryptor()
        try:
            padded_plaintext = decryptor.update(payload) + decryptor.finalize()
        except Exception:
            return False # Decryption failure
            
        # PKCS#7 padding validation (the Oracle leak)
        pad_len = padded_plaintext[-1]
        if pad_len < 1 or pad_len > 16:
            return False # Invalid padding length
            
        for i in range(len(padded_plaintext) - pad_len, len(padded_plaintext)):
            if padded_plaintext[i] != pad_len:
                return False # Invalid padding pattern
        return True # Padding is valid!

def padding_oracle_decrypt_block(oracle: VulnerableOracle, iv: bytes, block: bytes) -> bytes:
    decrypted_block = bytearray(16)
    cipher_block_manipulated = bytearray(iv)
    
    # Decrypt from the last byte (15) back to the first (0)
    for byte_index in range(15, -1, -1):
        target_padding = 16 - byte_index
        
        # Prepare previous bytes to match target padding level
        for p_idx in range(byte_index + 1, 16):
            cipher_block_manipulated[p_idx] = decrypted_block[p_idx] ^ target_padding ^ iv[p_idx]
            
        found = False
        for candidate_byte in range(256):
            cipher_block_manipulated[byte_index] = candidate_byte
            
            # Send the test ciphertext: [manipulated_iv_block] + [target_block]
            test_payload = bytes(cipher_block_manipulated) + block
            if oracle.decrypt_and_validate_padding(test_payload):
                # Calculate decrypted intermediate state
                decrypted_byte = candidate_byte ^ target_padding ^ iv[byte_index]
                decrypted_block[byte_index] = decrypted_byte
                found = True
                break
                
        if not found:
            raise RuntimeError(f"Failed to find valid padding candidate for byte {byte_index}")
            
    return bytes(decrypted_block)

if __name__ == "__main__":
    oracle = VulnerableOracle()
    secret_message = b"TopSecretAES_CBC" # Exactly 1 block
    ciphertext = oracle.encrypt(secret_message)
    
    iv = ciphertext[:16]
    target_block = ciphertext[16:32]
    
    print(f"Ciphertext (Hex): {ciphertext.hex()}")
    print("Initiating padding oracle decryption attack...")
    decrypted = padding_oracle_decrypt_block(oracle, iv, target_block)
    print(f"Decrypted Plaintext: {decrypted.decode('utf-8')}")
```

---

## Security Considerations and Mitigations

1. **Deprecated Cipher Suites**:
   The primary defense against CBC padding oracle vulnerabilities is migrating away from CBC mode entirely. TLS 1.3 completely removed CBC mode ciphers.
2. **Authenticated Encryption with Associated Data (AEAD)**:
   Always prefer AEAD modes like **AES-GCM** or **ChaCha20-Poly1305**. AEAD provides atomic decryption and MAC verification. If the MAC verification fails, the payload is never decrypted and no padding validation takes place, eliminating the side-channel.
3. **Encrypt-then-MAC (EtM)**:
   If CBC mode must be used for legacy systems, implement the Encrypt-then-MAC design (RFC 7366). Calculate the MAC over the ciphertext, not the plaintext. Validate the MAC first; if it is invalid, discard the packet immediately before checking padding.
