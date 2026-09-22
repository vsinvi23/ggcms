# JWT Key ID (KID) Injections: Exploiting Header Metadata

### The Problem: Implicit Trust in Header Values
JSON Web Tokens (JWTs) are the standard for stateless session representation. Developers understand that the token *payload* must not be trusted until the signature is verified. However, a common architectural blind spot lies in the JWT *header*. The header contains the metadata necessary to verify the token, including the algorithm (`alg`) and the Key ID (`kid`). 

The `kid` header indicates which key in a multi-key environment should be used to verify the signature. Crucially, the application must read the `kid` header *before* verifying the signature, because it needs the specified key to run the cryptographic verification. This creates a chicken-and-egg paradox: the application must process user-supplied input (the `kid`) to verify the integrity of the token. If the application handles this header parameter unsafely, it opens the door to high-impact vulnerabilities such as SQL Injection, Path Traversal, and Command Injection.

### Mental Model: The Untrusted Metadata Vector
Treat the JWT header as a standard, unauthenticated HTTP request parameter. Just like an un-sanitized query parameter in a GET request, any value inside the JWT header is fully controlled by the attacker and must be validated under strict zero-trust assumptions.

```
[ Attacker JWT ]
  ├── Header:  {"alg": "HS256", "kid": "../../../etc/passwd"}  <-- Malicious Input!
  ├── Payload: {"user": "admin"}
  └── Signature: [ Crafted to match public/empty key ]
```

### Attack Vector Profiles

When an application receives a token, it parses the `kid` and queries its key store to retrieve the verification key. This retrieval mechanism is the primary target.

#### 1. SQL Injection (SQLi)
If the application stores signing keys in a relational database and retrieves them via dynamic SQL queries, a malicious `kid` can trigger SQL injection.
*   **The Vulnerability:**
    `SELECT public_key FROM keys WHERE key_id = '` + `jwt.header.kid` + `'`
*   **The Exploit:** An attacker sets `kid` to `' UNION SELECT 'secret_symmetric_key' --`. The database returns `'secret_symmetric_key'` as the verification key. The attacker can then sign the JWT payload with this known symmetric key, completely bypassing authorization.

#### 2. Directory Traversal & Key Pinning to `/dev/null`
If the application stores keys as files on disk and retrieves them using the `kid` as a filename, an attacker can traverse the file system.
*   **The Vulnerability:**
    `fs.readFile("/var/keys/" + jwt.header.kid)`
*   **The Exploit:** The attacker sets `kid` to `../../../../dev/null`. On Unix-like systems, reading `/dev/null` returns an empty string (zero bytes). The application retrieves an empty string as the HMAC secret. The attacker then signs a malicious JWT using an empty string (HS256 signature generated with key `""`), which successfully validates against the empty string returned by the file system.

```
       Attacker                  Auth Server                  File System
          |                           |                            |
          |-- 1. Send JWT with ------->|                            |
          |   kid: "../../../../dev/null"                           |
          |                           |-- 2. Read File with Path ->|
          |                           |<-- 3. Return Empty ("") ---|
          |                           |                            |
          |                           |-- 4. Cryptographic Check --|
          |                           |      Signature matches ""  |
          |<-- 5. Access Granted -----|                            |
```

#### 3. Command Injection
In complex enterprise systems, a custom shell utility or command-line tool might be used to retrieve certificates or verify keys. If the `kid` is concatenated into a system command without sanitization (e.g., `exec("get_key.sh " + kid)`), the attacker can execute arbitrary commands with the privileges of the web application.

### Defensive Hardening Strategies

Securing JWT processing requires treating the `kid` parameter with the same level of input sanitization as any database query input.

#### 1. Avoid Dynamic Resource Generation
The most robust defense is to avoid dynamic SQL queries or file system lookups based on the `kid`. Instead, maintain an immutable, hardcoded in-memory map of valid Key IDs to their respective public keys or certificates.
```javascript
// Secure Look-Up Pattern
const keyStore = {
  "key_v1": "-----BEGIN PUBLIC KEY-----\n...",
  "key_v2": "-----BEGIN PUBLIC KEY-----\n..."
};

const kid = jwt.header.kid;
if (!keyStore.hasOwnProperty(kid)) {
  throw new Error("Invalid Key ID");
}
const verificationKey = keyStore[kid];
```

#### 2. Input Validation and Allow-listing
If a dynamic lookup is unavoidable, strictly validate the format of the `kid`. Enforce an alphanumeric or UUID-only regular expression.
*   **Regex Constraint:** `^[a-zA-Z0-9_-]{1,64}$`
This prevents path traversal characters (e.g., `/`, `\`, `.`) and SQL special characters (e.g., `'`, `;`, `--`).

#### 3. Use Standard JWKS (JSON Web Key Sets)
Standardize key rotation using JWKS endpoints. Ensure the library used to fetch JWKS restricts lookup to verified, trusted cryptographic endpoints and performs local caching with strict URL origin checks.
