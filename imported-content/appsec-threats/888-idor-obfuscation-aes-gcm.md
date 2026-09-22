# Insecure Direct Object References: Obfuscating Primary Keys with AES-GCM

## The Problem: The Danger of Predictable Identifiers

Relational databases traditionally use auto-incrementing integers (1, 2, 3, 4...) as primary keys. When these primary keys are exposed in URLs or API endpoints (e.g., `GET /api/invoices/1042`), two severe risks emerge:

1. **Insecure Direct Object Reference (IDOR):** An attacker can trivially iterate the integer (`1043`, `1044`, `1045`) to access or modify records belonging to other users if robust object-level authorization (BOLA defenses) are missing.
2. **Business Intelligence Leakage:** An attacker or competitor can create a new account, note their user ID (e.g., `5000`), wait exactly one week, create another account (`5100`), and definitively deduce that your application acquires exactly 100 new users a week. The same applies to invoice volumes, order numbers, and ticket counts.

While fixing the authorization flaw is the primary requirement to prevent IDOR, **ID Obfuscation** is the required architectural defense to prevent enumeration and business data leakage.

## The Mechanics: UUIDs vs Cryptographic Obfuscation

Many developers solve this by migrating database primary keys to UUIDv4. While UUIDs are cryptographically random and un-guessable, they incur massive performance penalties in high-volume relational databases due to index fragmentation (UUIDs are not sequential, causing constant B-Tree rebalancing). 

A superior architecture for read-heavy applications is to keep fast, sequential integers as primary keys in the database, but **never expose them to the client**. Instead, the backend transparently encrypts the integer into an opaque, URL-safe string before sending it to the frontend, and decrypts it upon receiving a request.

**Warning:** Base64 encoding or Hashids (e.g., `hashids.org`) are *not* encryption. They are easily reversed. You must use authenticated symmetric encryption like AES-GCM.

### ASCII Architecture: The ID Transformation Layer

```text
[ Client / React ]
       |
  (Requests Invoice ID: "v7x9qZ_p2A") <--- (Opaque, URL-Safe Ciphertext)
       |
       v
[ API Gateway / Express Controller ]
       |
  (Decrypts "v7x9qZ_p2A" using AES-GCM Secret Key)
       |
  (Yields Integer: 1042)
       |
       v
[ PostgreSQL Database ]
  (Executes fast index seek: SELECT * FROM invoices WHERE id = 1042)
```

## Implementation: AES-GCM Obfuscator

AES-GCM is an authenticated encryption mode. It not only encrypts the ID, but attaches an authentication tag. If an attacker tampers with the ciphertext to guess other IDs, the decryption will fail cryptographic validation.

### Robust Code: Python AES-GCM ID Obfuscator

```python
import os
import struct
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class IDObfuscator:
    def __init__(self, hex_key: str):
        # The key MUST be 32 bytes (256-bit) and stored securely in environment variables
        self.key = bytes.fromhex(hex_key)
        self.aesgcm = AESGCM(self.key)

    def obfuscate_id(self, db_id: int) -> str:
        """
        Encrypts an integer ID into a URL-safe Base64 string.
        """
        # Pack the 64-bit integer into bytes
        id_bytes = struct.pack(">Q", db_id)
        
        # AES-GCM requires a unique 12-byte nonce (Initialization Vector) per encryption
        nonce = os.urandom(12)
        
        # Encrypt the ID bytes. The result includes the ciphertext and the auth tag.
        ciphertext = self.aesgcm.encrypt(nonce, id_bytes, None)
        
        # Prepend the nonce to the ciphertext (needed for decryption)
        payload = nonce + ciphertext
        
        # Return URL-safe base64, stripping padding for cleaner URLs
        return base64.urlsafe_b64encode(payload).decode('utf-8').rstrip('=')

    def deobfuscate_id(self, obfuscated_id: str) -> int:
        """
        Decrypts a URL-safe Base64 string back into an integer ID.
        Raises ValueError if tampering is detected.
        """
        try:
            # Restore padding if necessary
            padding = '=' * (-len(obfuscated_id) % 4)
            payload = base64.urlsafe_b64decode(obfuscated_id + padding)
            
            # Extract the 12-byte nonce and the rest as ciphertext
            nonce = payload[:12]
            ciphertext = payload[12:]
            
            # Decrypt (will throw InvalidTag exception if tampered)
            id_bytes = self.aesgcm.decrypt(nonce, ciphertext, None)
            
            # Unpack bytes back to integer
            db_id = struct.unpack(">Q", id_bytes)[0]
            return db_id
            
        except Exception:
            # Catching generic exceptions (InvalidTag, struct errors) to prevent info leakage
            raise ValueError("Invalid or tampered ID")


# --- Usage Example ---
if __name__ == "__main__":
    # Generate this once securely: os.urandom(32).hex()
    SECRET_KEY = "b24d7f5a89e3a3...<32 bytes hex>...2f1c" 
    
    obfuscator = IDObfuscator(SECRET_KEY)
    
    # Send this to the client
    safe_id = obfuscator.obfuscate_id(1042)
    print(f"URL Safe ID: {safe_id}")  # e.g., 'a8B3_k91LpqR...'
    
    # Receive this from the client and resolve to DB ID
    real_id = obfuscator.deobfuscate_id(safe_id)
    print(f"Database ID: {real_id}")  # 1042
```

## Conclusion

Coupling strict object-level authorization with AES-GCM ID obfuscation creates a dual-layered defense. You retain the microsecond query performance of sequential B-Tree database indexes while mathematically preventing attackers from mapping your application's growth metrics or iterating through your user base via IDOR enumeration.
