# JWT Signature Stripping: Defeating the 'none' Algorithm

JSON Web Tokens (JWTs) are the standard mechanism for stateless authentication in modern web APIs. A standard JWT contains three Base64URL-encoded components separated by dots: a Header (metadata and algorithm), a Payload (claims), and a Signature (verifying integrity). 

The Achilles' heel of early JWT implementations—and a recurring vulnerability in bespoke authentication systems—is the **JWT Signature Stripping** attack, also known as the `none` algorithm exploit. By exploiting naive library behaviors, an attacker can bypass cryptographic signature checks entirely, allowing them to forge identity claims and escalate privileges at will.

---

## The Problem: Stateless Authentication without Verification

In a stateless JWT architecture, the application trusts the information in the payload because it has verified the signature using a shared secret or public key. The server’s verification engine relies on the `alg` header parameter inside the JWT to determine *which* algorithm to use (e.g., HS256, RS256, or ES256) to verify the payload.

However, the JWT specification (RFC 7519) includes a controversial mandatory-to-implement feature: the `none` algorithm. The `none` algorithm represents an un-signed token, designed for environments where security is handled externally (e.g., inside an IPSec tunnel). When the `alg` parameter is set to `none`, the signature portion of the token is left empty. 

If a backend application's verification engine naively trusts the `alg` header of the incoming token, it can be tricked into accepting a self-signed or unsigned token, completely undermining the integrity of stateless authentication.

---

## Attack Vectors: Stripping and Forgery

The signature stripping attack operates by transforming a cryptographically signed JWT into a raw, unsigned token that the target application accepts as valid.

### 1. Converting a Signed Token to 'none'
Consider a legitimate user with the following token:
* **Header:** `{"alg": "HS256", "typ": "JWT"}`
* **Payload:** `{"user": "alice", "role": "user"}`
* **Signature:** `[Valid Cryptographic Signature]`

An attacker intercepts this token and wants to escalate their role to `admin`. The attacker performs the following steps:
1. Decode the Base64URL header and change the `"alg"` value to `"none"`.
2. Decode the payload and modify the claims, e.g., changing `"user": "alice"` to `"user": "admin"`.
3. Re-encode both components back to Base64URL.
4. Reconstruct the JWT by joining the header and payload with a dot, followed by a trailing dot representing the empty signature: `header.payload.` (e.g., `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoidXNlciJ9.`).

If the library is vulnerable, it reads `alg: none` from the header, assumes no signature verification is required, ignores any residual cryptographic check, and trusts the forged `"user": "admin"` payload.

### 2. Naive Algorithm Acceptance and Variation Vulnerabilities
Many developers write code that looks like this:
```javascript
// VULNERABLE CODE EXAMPLE
const token = req.headers.authorization.split(' ')[1];
const decoded = jwt.decode(token); // Decodes without verifying signature!

// Naive verification where the library dynamically selects algorithm from header
const verified = jwt.verify(token, secretKey); 
```
If the underlying verification library does not explicitly disallow the `none` algorithm during `verify()` calls, it dynamically switches to `none` mode. Furthermore, many implementations have been vulnerable to casing variations (such as `None`, `NONE`, `nOnE`) or trailing whitespaces that bypassed primitive string matches but were still treated as `none` by the parser.

---

## Defenses: Enforcing Cryptographic Rigor

Defeating signature stripping requires restricting the parser's runtime behavior, separating token decoding from verification, and enforcing cryptographic boundaries.

### 1. Hard-Code Allowed Algorithms
Never let the token's header dynamically determine the cryptographic algorithm used for verification. Instead, explicitly pass the list of expected algorithms to your library's verification function:

```javascript
// SECURE CODE EXAMPLE (Node.js using jsonwebtoken)
const jwt = require('jsonwebtoken');

try {
    const token = req.headers.authorization.split(' ')[1];
    
    // Explicitly enforce that only HS256 is accepted.
    // The library will throw an error if "alg" is "none" or anything else.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'] 
    });
    
    req.user = decoded;
} catch (err) {
    res.status(401).send("Invalid or unauthenticated token");
}
```

### 2. Use Established, Maintained Libraries
Avoid rolling your own JWT parsing or validation logic. Use hardened, highly vetted open-source libraries that have explicitly disabled `none` by default in their verification paths (e.g., standard libraries in Go, Python's `PyJWT`, or Java's `Nimbus-JWT`).

### 3. Verify Signature Before Parsing Payload
Your application flow must follow a strict validation pipeline:
1. Parse the token structure (must have exactly 3 parts separated by dots).
2. Validate the signature against your key/secret using your statically defined algorithm.
3. Only if the signature is validated successfully should the application process the claims inside the payload.

---

## Developer Takeaways

* **Stateless does not mean unverified:** A JWT payload is completely public and readable. It must never be trusted unless its signature has been cryptographically validated against a known-good secret/key.
* **Disable `none` globally:** Explicitly block the `none` algorithm in all backend security configurations.
* **Statically define your algorithms:** Always pass an explicit list of accepted signature algorithms (e.g., `['RS256']`) to the verification function of your JWT library.
* **Enforce strict key validation:** Ensure signature verification keys (public or symmetric) cannot be manipulated by the token's header (such as the JWT Key Confusion attack, which tricks libraries into verifying asymmetric RS256 tokens with the public key treated as an HS256 symmetric secret).
