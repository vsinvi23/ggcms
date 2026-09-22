# AES-CBC Padding Oracles: How POODLE and Lucky13 Exploit Block Padding

## The Problem: The Cryptographic Decrypt-then-MAC Trap

Many legacy applications and implementations of TLS 1.2 rely on symmetric encryption using **AES in Cipher Block Chaining (CBC) mode**. Because block ciphers operate on discrete blocks of fixed sizes (typically 16 bytes), arbitrary plaintexts must be padded to fit these block boundaries prior to encryption. PKCS#7 is the standard scheme used for this purpose.

Historically, protocols used the **MAC-then-Encrypt (MtE)** design pattern:
1. Compute the MAC of the plaintext.
2. Append the MAC to the plaintext.
3. Pad the combined block to a multiple of 16 bytes.
4. Encrypt the result with AES-CBC.

During decryption, the server reverses this sequence: it decrypts the ciphertext, parses the padding, and checks the MAC. If the decryption engine behaves differently when the padding is malformed versus when the padding is valid but the MAC check fails (either by throwing explicit errors or by processing the MAC check on different code paths, which alters processing timing), it acts as a **Padding Oracle**. This vulnerability allows an offline or active on-path attacker to decrypt arbitrary blocks byte-by-byte.

---

## Architectural Blueprint: The Padding Oracle Decryption Sequence

```
+-------------------------------------------------------------------------------+
|                      Padding Oracle Decryption Block                          |
|                                                                               |
|  Decrypted Byte = D_k(C_i)[last_byte] ^ C_i-1[last_byte]                      |
|                                                                               |
|  1. Attacker intercepts Ciphertext blocks C_i-1 and C_i                        |
|  2. Attacker modifies last byte of C_i-1 to value X                           |
|  3. Attacker submits tampered ciphertext [C_i-1 || C_i] to Oracle             |
|                                                                               |
|  IF Oracle says "VALID PADDING" (no error / normal timing):                   |
|     We know the decrypted byte is 0x01 (PKCS#7 padding of length 1)           |
|     Formula: D_k(C_i)[last_byte] ^ X = 0x01                                   |
|     Therefore: Plaintext[last_byte] = 0x01 ^ X ^ Original_C_i-1[last_byte]    |
+-------------------------------------------------------------------------------+
```

---

## Historic Exploits: POODLE and Lucky13

### POODLE (Padding Oracle On Downgraded Legacy Encryption)
POODLE targeted SSLv3, which did not enforce the content of the padding bytes—only the value of the final padding length byte. This weakness allowed an attacker to shift ciphertext blocks so that the padding byte aligned with targeted cookie bytes, recovering session cookies in a few hundred requests.

### Lucky 13 (Timing Side-Channels)
When implementations tried to fix padding oracles by returning a generic decryption failure error, they neglected processing time. If the padding is valid, the MAC calculation must run over the parsed plaintext. If the padding is invalid, the MAC calculation is either skipped or executed on mock data. This timing discrepancy (amounting to less than a microsecond) allowed the Lucky13 attack to recover plaintexts over local networks.

---

## Robust Python Simulation of a Padding Oracle Attack

The following complete, runnable Python script implements a cryptographic simulation. It includes:
1. A secure server containing a secret key, conducting AES-CBC PKCS#7 decryption, and acting as a padding oracle.
2. An automated attacker client that systematically decrypts a ciphertext block byte-by-byte without access to the key.

```python
import os
import secrets
from cryptography.crypto.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

class PaddingOracleServer:
    def __init__(self):
        self._key = secrets.token_bytes(16)
        self._iv = secrets.token_bytes(16)

    def get_encrypted_data(self):
        """Returns encrypted test data with valid PKCS#7 padding."""
        plaintext = b"SEC_TOKEN=A942F8C"  # Target plaintext (17 bytes -> 2 blocks)
        # Apply PKCS#7 padding
        pad_len = 16 - (len(plaintext) % 16)
        padded_pt = plaintext + bytes([pad_len] * pad_len)
        
        encryptor = Cipher(
            algorithms.AES(self._key),
            modes.CBC(self._iv),
            backend=default_backend()
        ).encryptor()
        return self._iv + encryptor.update(padded_pt) + encryptor.finalize()

    def is_padding_valid(self, ciphertext):
        """
        The Padding Oracle.
        Decrypts the ciphertext and returns True if PKCS#7 padding is valid, False otherwise.
        """
        if len(ciphertext) < 32:
            return False
        
        iv = ciphertext[:16]
        ct = ciphertext[16:]
        
        decryptor = Cipher(
            algorithms.AES(self._key),
            modes.CBC(iv),
            backend=default_backend()
        ).decryptor()
        
        try:
            pt = decryptor.update(ct) + decryptor.finalize()
        except Exception:
            return False
        
        # Validate PKCS#7 Padding
        pad_len = pt[-1]
        if pad_len < 1 or pad_len > 16:
            return False
        for i in range(len(pt) - pad_len, len(pt)):
            if pt[i] != pad_len:
                return False
        return True

# Exploit Automation
def crack_block(server, c0, c1):
    """Decrypts block c1 using modified c0 through padding oracle inquiries."""
    intermediate_state = [0] * 16
    decrypted_plaintext = [0] * 16
    
    # Iterate backwards from byte 15 down to 0
    for byte_index in range(15, -1, -1):
        target_pad = 16 - byte_index
        
        # Construct tampered prefix block
        c_prime = bytearray(c0)
        for i in range(byte_index + 1, 16):
            c_prime[i] = intermediate_state[i] ^ target_pad
            
        # Brute force byte_index to trigger valid padding
        found = False
        for val in range(256):
            c_prime[byte_index] = val
            test_payload = bytes(c_prime) + c1
            
            if server.is_padding_valid(test_payload):
                # Calculate intermediate byte
                intermediate_state[byte_index] = val ^ target_pad
                decrypted_plaintext[byte_index] = intermediate_state[byte_index] ^ c0[byte_index]
                found = True
                break
                
        if not found:
            raise RuntimeError(f"Failed to find valid padding for byte index {byte_index}")
            
    return bytes(decrypted_plaintext)

# Execution Sandbox
if __name__ == "__main__":
    server = PaddingOracleServer()
    raw_payload = server.get_encrypted_data()
    
    print("[*] Intercepted Ciphertext from target wire:")
    print(f"    Raw bytes: {raw_payload.hex()}")
    
    # Segment blocks (16-byte boundaries)
    iv = raw_payload[:16]
    c0 = raw_payload[16:32]
    c1 = raw_payload[32:48]
    
    print("[*] Launching padding oracle decryption against Block 2...")
    decrypted_block_2 = crack_block(server, c0, c1)
    
    print(f"[+] Decrypted Plaintext Block 2: {decrypted_block_2}")
    print(f"    Stripped ASCII: {decrypted_block_2.decode('ascii', errors='ignore')}")
