# Why You Should Never Put Secrets Inside JWTs (and How to Encrypt Them via JWE)

## The Problem: The Signing vs. Encryption Fallacy
A staggering number of developers treat standard JSON Web Tokens (JWTs) as a secure vault for confidential information. They store internal database IDs, third-party API keys, system IP addresses, or Personally Identifiable Information (PII) like email addresses, phone numbers, and department roles within the JWT payload.

The critical mistake is **confusing a cryptographically signed token (JWS) with an encrypted token (JWE)**. 

A standard JWT is a **JSON Web Signature (JWS)**. Its contents are merely serialized and Base64URL-encoded. There is zero confidentiality protection. Anyone who intercepts the token—whether it’s a browser extension, a proxy logger, a CDN, or an attacker sniffing local traffic—can decode the payload in a single line of code. Storing sensitive data in a JWS violates privacy regulations (such as GDPR and CCPA) and exposes your internal systems to severe mapping and reverse-engineering attacks.

---

## Technical Architectures: JWS (Signed) vs. JWE (Encrypted)

### Standard JWS (JSON Web Signature) - Readable
The payload is fully visible to anyone in the middle. The signature only guarantees *integrity* (it hasn't been altered).

```
[ HEADER: alg=RS256 ] . [ PAYLOAD: { "email": "admin@corp.internal" } ] . [ SIGNATURE ]
           |                                     |
           v (Base64 Decode)                     v (Base64 Decode)
     Readable JSON!                        Readable JSON! (PII Exposed!)
```

### JWE (JSON Web Encryption) - Confidential
The payload is encrypted into unreadable ciphertext before serialization. The token guarantees both *integrity* and *confidentiality*.

```
[ PROTECTED HEADER ] . [ ENCRYPTED KEY ] . [ IV ] . [ CIPHERTEXT (Encrypted Payload) ] . [ TAG ]
                                                        |
                                                        v (Attempt Base64 Decode)
                                                 Garbage / Ciphertext (Safe)
```

---

## Technical Flow of JWE (Direct Encryption with Symmetric Key)

```
+--------------------+
|  Plaintext Payload |
+--------------------+ { "ssn": "999-00-1234", "role": "SuperAdmin" }
          |
          v <---- Encrypted using AES-256-GCM + Content Encryption Key (CEK)
+--------------------+
|     Ciphertext     | ---> Completely scrambled bytes
+--------------------+
          |
          v <---- Combined with Initialization Vector (IV) and Auth Tag
+--------------------+
|    Compact JWE     | ---> BASE64URL(Header) . "" . BASE64URL(IV) . BASE64URL(Ciphertext) . BASE64URL(Tag)
+--------------------+
```

---

## Code: Proving JWS Exposure vs. Implementing Secure JWE
Below is a Node.js/TypeScript example illustrating (1) how trivial it is to extract "secrets" from a standard signed JWT, and (2) how to implement a secure, encrypted token from scratch using Node's native `crypto` module with authenticated encryption (AES-256-GCM).

```typescript
import crypto from 'crypto';

// 1. THE EXPLOIT: Parsing a standard JWS is trivial
export function exposeJwsSecrets(token: string): void {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Not a standard 3-part JWT');
  }

  // Base64URL decode the payload chunk
  const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf8');

  console.log('--- LEAKED PAYLOAD DATA ---');
  console.log(decodedPayload); 
  // Outputs: {"userId": 10582, "internalIP": "10.0.4.82", "clearance": "TopSecret"}
}

// 2. THE SOLUTION: Implementing JSON Web Encryption (JWE) with AES-256-GCM
// Generates a 256-bit symmetric key for encryption (store this securely on backend)
const SHARED_ENCRYPTION_SECRET = crypto.createHash('sha256').update('my-server-side-confidential-key').digest();

/**
 * Encrypts a payload into a secure, opaque JWE-like format.
 */
export function encryptPayload(payload: object): string {
  const plaintext = JSON.stringify(payload);
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  
  const cipher = crypto.createCipheriv('aes-256-gcm', SHARED_ENCRYPTION_SECRET, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  
  const tag = cipher.getAuthTag();

  // Construct JWE-like compact structure: Header.IV.Ciphertext.Tag
  const header = Buffer.from(JSON.stringify({ alg: 'dir', enc: 'A256GCM' })).toString('base64url');
  const encodedIv = iv.toString('base64url');
  const encodedCiphertext = Buffer.from(ciphertext, 'base64').toString('base64url');
  const encodedTag = tag.toString('base64url');

  return `${header}.${encodedIv}.${encodedCiphertext}.${encodedTag}`;
}

/**
 * Decrypts and validates the encrypted token.
 */
export function decryptPayload(token: string): object {
  const parts = token.split('.');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted token format');
  }

  const [headerB64, ivB64, ciphertextB64, tagB64] = parts;

  // Verify Header indicates expected algorithm
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  if (header.enc !== 'A256GCM' || header.alg !== 'dir') {
    throw new Error('Unsupported encryption configuration');
  }

  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(ciphertextB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', SHARED_ENCRYPTION_SECRET, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext.toString('base64'), 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
```

---

## Architectural Rules of Thumb
1.  **Assume Public Visibility:** If you are using standard signed JWTs (JWS), always assume that the client, all intermediate proxies, and anyone capturing network traffic can read the contents. **Zero secrets allowed.**
2.  **Use Reference Tokens for Sensitive Claims:** Instead of storing high-risk details in a JWT, store them in a secure backend database or session cache (e.g., Redis). Put only a random, high-entropy database record ID (the subject claim) in the JWT, and retrieve the details server-side during request processing.
3.  **Deploy JWE When Transmission is Required:** If you *must* pass highly confidential claims over the wire in a stateless manner, wrap them inside a proper JWE implementation using AES-256-GCM.
4.  **Enforce TLS:** Even with secure tokens, never transmit any authorization headers over unencrypted HTTP. Enforce TLS 1.3 across all endpoints.
