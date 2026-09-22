# Insecure Direct Object References: Obfuscating Database Primary Keys using AES-GCM

## The Problem

Insecure Direct Object References (IDOR) remain one of the most widespread and severe web vulnerability patterns. The core flaw lies in exposing internal sequential database primary keys (e.g., auto-incrementing integers) directly to client applications in URLs or API bodies:

`/api/v1/download-invoice?id=12543`

By simply changing the `id` parameter sequentially (`12544`, `12545`), an attacker can easily enumerate and download the invoices of all other users on the platform.

While many engineering teams attempt to resolve IDOR by migrating database schemas to UUIDv4, this solution has major drawbacks. UUIDv4 is index-inefficient in relational databases (creating high page fragmentation in indexes like InnoDB B+ Trees) and requires altering legacy database schemas, which might contain hundreds of tables. Another common approach, Hashids or base64 encoding, is easily decoded and offers zero security/integrity guarantees.

A highly secure, elegant, and stateless alternative is to encrypt the database integer IDs before serializing them to the client, and decrypting/verifying them upon incoming API requests. By employing **AES-256-GCM**, the application generates URL-safe, authenticated tokens. These tokens cannot be guessed, sequentially manipulated, or tampered with, completely neutralizing IDOR.

---

## Cryptographic Identifier Lifecycle

By encrypting keys symmetrically at the API boundary, internal database systems remain fast and index-optimized while the public API exposes only cryptographic tokens.

### Identifier Obfuscation Flow
```
  [ DB Query ] ──► ID: 1042 ──► [ AES-256-GCM Encryptor ] ──► Token: "eyJpdiI6Ik..." ──► [ Client View ]
                                                                                              │
                                                                                              ▼
  [ DB Execution ] ◄── ID: 1042 ◄── [ AES-256-GCM Decryptor ] ◄── Token: "eyJpdiI6Ik..." ◄── [ API Request ]
```

---

## Production-Grade AES-GCM ID Obfuscator

Below is a robust Python utility class that encrypts and decrypts integer IDs into tamper-proof, authenticated, URL-safe Base64 strings.

```python
import base64
import json
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

class IdCryptor:
    def __init__(self, master_key: bytes):
        """
        Initializes the ID Cryptor with a 256-bit symmetric key.
        
        :param master_key: A cryptographically strong 32-byte key.
        """
        if len(master_key) != 32:
            raise ValueError("Master key must be exactly 32 bytes for AES-256.")
        self.master_key = master_key

    def encrypt_id(self, internal_id: int) -> str:
        """
        Encrypts an integer ID into an authenticated URL-safe base64 string.
        """
        # Generate a unique 12-byte initialization vector (IV)
        iv = os.urandom(12)
        
        # Serialize integer to binary
        data = str(internal_id).encode('utf-8')
        
        # Initialize AES-GCM Cipher
        encryptor = Cipher(
            algorithms.AES(self.master_key),
            modes.GCM(iv),
            backend=default_backend()
        ).encryptor()
        
        ciphertext = encryptor.update(data) + encryptor.finalize()
        tag = encryptor.tag  # Authentication tag (protects against tampering)
        
        # Pack components into a compact JSON package
        packet = {
            "iv": base64.b64encode(iv).decode('utf-8'),
            "tag": base64.b64encode(tag).decode('utf-8'),
            "ciphertext": base64.b64encode(ciphertext).decode('utf-8')
        }
        
        # Convert packet to URL-safe base64
        serialized_packet = json.dumps(packet).encode('utf-8')
        return base64.urlsafe_b64encode(serialized_packet).decode('utf-8').rstrip('=')

    def decrypt_id(self, obfuscated_token: str) -> int:
        """
        Decrypts and validates the authentication tag of an obfuscated token.
        Raises SecurityError if tampering is detected or the token is invalid.
        """
        try:
            # Re-pad base64 string if necessary
            missing_padding = len(obfuscated_token) % 4
            if missing_padding:
                obfuscated_token += '=' * (4 - missing_padding)
                
            decoded_packet_bytes = base64.urlsafe_b64decode(obfuscated_token.encode('utf-8'))
            packet = json.loads(decoded_packet_bytes.decode('utf-8'))
            
            iv = base64.b64decode(packet["iv"])
            tag = base64.b64decode(packet["tag"])
            ciphertext = base64.b64decode(packet["ciphertext"])
            
            # Initialize AES-GCM Decryptor
            decryptor = Cipher(
                algorithms.AES(self.master_key),
                modes.GCM(iv, tag),
                backend=default_backend()
            ).decryptor()
            
            decrypted_data = decryptor.update(ciphertext) + decryptor.finalize()
            return int(decrypted_data.decode('utf-8'))
            
        except Exception as e:
            # Catching integrity failure (InvalidTag) or decode errors
            raise SecurityError("Integrity Check Failed: Token is malformed or tampered with.") from e

class SecurityError(Exception):
    pass
```

---

## Architectural Guidelines

1. **Key Management**: Use a secure Hardware Security Module (HSM) or cloud key manager (AWS KMS, GCP KMS) to store and rotate the `master_key`. Never commit the key to version control or hardcode it in config files.
2. **Contextual Binding (Optional)**: To make IDOR even more difficult, bind the user's unique session identifier or user ID into the encryption payload (e.g., encrypt `f"{user_id}:{internal_id}"`). During decryption, verify that the active session user's ID matches the user context bound in the token. Even if an attacker intercepts another user's encrypted ID token, they cannot decrypt and use it because the context mismatch will reject the request.
