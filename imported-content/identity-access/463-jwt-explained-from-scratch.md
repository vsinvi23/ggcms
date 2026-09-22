# Demystifying the Black Box: JWT Explained from Scratch

## The Problem: The Cryptographic Illusion
To many developers, JSON Web Tokens (JWTs) look like encrypted blobs of high-security ciphertext. This misconception is dangerous. 

Standard JWTs are **not encrypted**; they are merely **encoded** using Base64URL. Anyone who intercepts a JWT can read its contents instantly by running a simple decoding function. The security of a JWT relies entirely on its **Signature**. If developers do not understand how this signature is constructed, verified, and parsed, they cannot secure their APIs against tampering, payload hijacking, or cryptographic bypass.

Let’s dismantle the JWT and rebuild it from absolute first principles using nothing but standard programming primitives.

---

## Technical Architecture: Structure of a JWT
A JSON Web Token consists of three distinct parts separated by dots (`.`):

```
      HEADER                    PAYLOAD                   SIGNATURE
[ base64Url(JSON) ] . [ base64Url(JSON) ] . [ base64Url(HMAC-SHA256) ]
```

1.  **Header:** Dictates how the token is signed and serialized. It contains the token type (`typ`) and the algorithm (`alg`) used to construct the signature.
2.  **Payload:** Contains the claims—statements about the user (the subject, `sub`), token expiration (`exp`), and other custom metadata.
3.  **Signature:** Cryptographically proves that the header and payload have not been altered in transit. If even a single byte of the header or payload changes, the signature becomes invalid.

### The Lifecycle of JWT Verification
When a resource server receives a token:
1.  It splits the token by the dot character into three strings: `Header`, `Payload`, and `Signature`.
2.  It re-computes the signature using the received `Header` and `Payload` plus its own locally stored, secret cryptographic key.
3.  It compares the newly computed signature with the signature that came with the token.
4.  If they match perfectly, and the claims (such as `exp`) are valid, it trusts the identity.

---

## Execution: JWT Serialization and Sign Flow

```
+--------------------------------------+
|       JSON Header & Payload          |
+--------------------------------------+
  { "alg": "HS256" }   { "sub": "123" }
          |                    |
          v                    v
  Base64URL Encode     Base64URL Encode
          |                    |
          v                    v
  "eyJhbGciOiJIUzI1NiJ9" . "eyJzdWIiOiIxMjMifQ"
  +-------------------------------------------+
                        |
                        v (Joined by a dot)
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ" <---- Input to HMAC
                        |
                        + <--- Secret Key: "my-ultra-secure-key"
                        |
                        v (HMAC-SHA256)
               [ Raw Signature Bytes ]
                        |
                        v (Base64URL Encode)
             "_w7fK0M_D1jWwX7Y8v3Y..."
                        |
                        v (Joined to form final JWT)
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ._w7fK0M_D1jWwX7Y8v3Y..."
```

---

## Implementation: Building and Verifying JWTs from Scratch
Below is a clean, robust TypeScript implementation that implements Base64URL encoding, manual JWT signing, and manual verification using only Node.js’s native `crypto` module. No external npm libraries like `jsonwebtoken` are used.

```typescript
import crypto from 'crypto';

/**
 * Base64URL standard helpers.
 * Standard Base64 uses '+', '/' and '=', which are not safe to use in URLs or headers.
 */
function toBase64URL(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64URL(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Creates a signed JWT using HMAC-SHA256
 */
export function createJWT(payload: object, secret: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = toBase64URL(Buffer.from(JSON.stringify(header)));
  const encodedPayload = toBase64URL(Buffer.from(JSON.stringify(payload)));

  // Join parts to create the signing input
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Generate signature
  const signatureBuffer = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  const encodedSignature = toBase64URL(signatureBuffer);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Parses and verifies a JWT using HMAC-SHA256 from scratch
 */
export function verifyJWT(token: string, secret: string): object {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: Token must have exactly 3 parts');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Re-generate signature from the received header and payload
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const computedSignatureBuffer = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  const decodedSignatureBuffer = fromBase64URL(encodedSignature);

  // Use timingSafeEqual to prevent timing attacks
  const isSignatureValid = crypto.timingSafeEqual(
    computedSignatureBuffer,
    decodedSignatureBuffer
  );

  if (!isSignatureValid) {
    throw new Error('Cryptographic signature verification failed');
  }

  // Parse header to verify algorithm
  const headerJSON = fromBase64URL(encodedHeader).toString('utf8');
  const header = JSON.parse(headerJSON);
  if (header.alg !== 'HS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Decode and check payload
  const payloadJSON = fromBase64URL(encodedPayload).toString('utf8');
  const payload = JSON.parse(payloadJSON);

  // Validate expiration if present
  if (payload.exp && typeof payload.exp === 'number') {
    const currentTimeSec = Math.floor(Date.now() / 1000);
    if (payload.exp < currentTimeSec) {
      throw new Error('Token has expired');
    }
  }

  return payload;
}
```

## Critical Takeaways
1.  **JWTs are completely visible:** Treat JWTs as publicly readable. Placing raw passwords, database connection strings, or personally identifiable information (PII) inside a JWT is a major security breach.
2.  **Timing Attack Vector:** When comparing signatures, never use standard string comparisons (`===`). Standard comparisons return `false` as soon as they find a mismatching byte, exposing execution time differences that allow attackers to guess signatures byte-by-byte. Always use `crypto.timingSafeEqual`.
3.  **Enforce Algorithm Verification:** The verification logic must explicitly validate that the token's algorithm matches your system's expected signature verification mechanism, bypassing forged tokens that manipulate the header.
