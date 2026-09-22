# Insecure Direct Object References (IDOR): Obfuscating Database Primary Keys using AES-GCM

## The Problem: Predictable Resource Identifiers

Insecure Direct Object References (IDOR) occur when an application exposes a reference to an internal implementation object, such as a database primary key, without enforcing strict authorization checks. 

Consider an API endpoint that retrieves a user's invoice:
`GET /api/v1/invoices/1042`

If the application relies solely on the ID (`1042`) provided in the URL to fetch the record, it is vulnerable. An attacker can simply iterate the ID (e.g., `1043`, `1044`, `1045`) to view invoices belonging to other users.

The foundational fix for IDOR is robust authorization (verifying that the currently authenticated user *owns* invoice 1042). However, relying entirely on authorization checks can be fragile; a single missed check in a complex API leads to a breach. A powerful defense-in-depth strategy is to eliminate predictable, sequential identifiers entirely, replacing auto-incrementing integers with opaque, unguessable references.

## Architectural Flaw: The Auto-Incrementing Key

Relational databases traditionally rely on auto-incrementing integer IDs (`1, 2, 3...`) for primary keys. They are highly efficient for indexing and foreign key relationships. 

```text
[ Database Table: Invoices ]
ID (PK) | UserID | Amount | Data
---------------------------------
1042    | 99     | $500   | ...
1043    | 12     | $200   | ...
```

Exposing these IDs in the API creates two severe risks:
1.  **Enumeration:** Attackers can easily guess valid IDs.
2.  **Information Disclosure:** Competitors can track the volume of your business (e.g., if you process invoice `1000` on Monday and `1500` on Friday, they know you processed 500 orders).

## Defense Strategies: UUIDs vs. Cryptographic Obfuscation

There are two primary methods to remove predictable IDs from the API layer.

### Approach 1: UUIDs (Universally Unique Identifiers)

The most common approach is to add a `UUID` column (e.g., UUIDv4) to the database table and use it exclusively for external API routing.

`GET /api/v1/invoices/f47ac10b-58cc-4372-a567-0e02b2c3d479`

*   **Pros:** Cryptographically random, impossible to enumerate, standard implementation.
*   **Cons:** Requires database schema migrations, creates massive secondary indexes (UUIDs are 128-bit and non-sequential, which fractures B-Tree indexes and hurts database write performance at high scale).

### Approach 2: Cryptographic Obfuscation (The High-Performance Alternative)

If altering the database schema to support UUIDs is unfeasible, or if performance is paramount, you can encrypt the integer IDs at the application boundary. 

The application uses an authenticated encryption cipher (like AES-GCM) to encrypt the integer ID before sending it to the client, and decrypts it when the client sends it back. The database continues to use highly efficient sequential integers internally; the client only ever sees an opaque, Base64-encoded token.

```text
[ Database ] (ID: 1042) ---> [ API Layer: Encrypt(1042) ] ---> (Client sees: "vX9z...==")
[ Database ] <--- [ API Layer: Decrypt("vX9z...==") ] <--- (Client requests: "vX9z...==")
```

## Implementing AES-GCM Obfuscation

AES-GCM (Galois/Counter Mode) is crucial because it provides both **confidentiality** (hiding the ID) and **authenticity** (detecting if the attacker tampered with the encrypted token).

**Security Requirements:**
*   **The Key:** Must be a robust, 256-bit symmetric key kept securely on the backend (e.g., via AWS KMS or environment variables).
*   **The IV/Nonce:** Must be unique for *every single encryption operation*. Reusing an IV with AES-GCM destroys the cipher's security entirely.

**Node.js Implementation Example:**

```javascript
const crypto = require('crypto');

// Load from secure environment variable. MUST be exactly 32 bytes (256 bits).
const SECRET_KEY = Buffer.from(process.env.ID_OBFUSCATION_KEY, 'hex'); 

class IDObfuscator {
    
    // Encrypts an integer ID into a URL-safe Base64 string
    static encode(id) {
        // GCM requires a unique Initialization Vector for every encryption
        const iv = crypto.randomBytes(12); 
        
        const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);
        
        let encrypted = cipher.update(id.toString(), 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        // GCM generates an auth tag to detect tampering
        const authTag = cipher.getAuthTag().toString('base64');
        
        // Combine IV, Encrypted Data, and Auth Tag into a single string
        // Format: IV:AuthTag:Ciphertext
        const token = `${iv.toString('base64')}:${authTag}:${encrypted}`;
        
        // Make URL-safe (replace + and /)
        return Buffer.from(token).toString('base64url');
    }

    // Decrypts the token back to an integer
    static decode(safeToken) {
        try {
            const token = Buffer.from(safeToken, 'base64url').toString('utf8');
            const [b64Iv, b64AuthTag, b64Encrypted] = token.split(':');
            
            const iv = Buffer.from(b64Iv, 'base64');
            const authTag = Buffer.from(b64AuthTag, 'base64');
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, iv);
            decipher.setAuthTag(authTag); // Verifies the payload wasn't tampered with
            
            let decrypted = decipher.update(b64Encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            return parseInt(decrypted, 10);
        } catch (error) {
            // Decryption failed or tag mismatched (Attacker tampering)
            throw new Error("Invalid or tampered object reference.");
        }
    }
}
```

### How this Defeats IDOR

If the API uses this mechanism, the URL becomes:
`GET /api/v1/invoices/dVh...W9z`

1.  **Enumeration is impossible:** An attacker cannot guess the encrypted representation of ID 1043.
2.  **Tampering is impossible:** If an attacker alters a single character of the Base64 string to see what happens, the AES-GCM `AuthTag` verification will fail, and the `decode` function will throw an error before the database is ever queried.

## Conclusion

While stringent, resource-level authorization checks are mandatory for preventing IDOR, exposing auto-incrementing database keys provides attackers with the exact roadmap they need to probe for authorization failures. Obfuscating direct references—either by migrating to UUIDs or implementing AES-GCM authenticated encryption at the API boundary—neutralizes enumeration vectors and adds a crucial layer of defense-in-depth to the application architecture.
