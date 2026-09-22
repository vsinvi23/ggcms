# Deep Dive into JSON Web Tokens (JWTs): Signature Stripping, Header Injections, and JKU Attacks

> Explore the security architecture of JSON Web Tokens, analyze critical implementation flaws like the "None" algorithm vulnerability, and learn how to defend your microservices against JKU header injection attacks.

---

## What We Are Going to Learn

In this deep-dive guide, we will step inside the structure of **JSON Web Tokens (JWTs)** to understand how authentication state is securely passed across microservices.

Specifically, we will cover:
1. **The stateless session model of JWTs** and why they represent a massive target for attackers.
2. **The "None" Algorithm vulnerability** (Signature Stripping) and why naive libraries fail.
3. **JKU (JWK Set URL) Header Injection attacks** and how attackers forge valid JWT signatures.
4. **Writing a hardened JWT verification class in Python** that enforces strict header and signature boundaries.

---

## The Problem: The Stateless Trust Delusion

When building microservices, checking a session database on every API call is a performance bottleneck. To solve this, developers use **stateless JWTs**:

```
  [ Auth Service ] ---> Issues Cryptographically Signed JWT ---> [ Client Browser ]
                                                                       |
  [ Payment Service ] <--- Validates Signature in Memory <-------------/
```

The server signs the payload using its private key, and downstream microservices validate the signature using the corresponding public key. 

### The Security Risk
Because the validation happens entirely in memory, downstream microservices **completely trust the data inside the JWT** as long as the signature is valid. This stateless trust is a massive target. If an attacker can bypass the signature verification or manipulate the public key used for validation, they can forge any claim (such as role or user ID) and gain full administrative access.

---

## Why the Problem Is Hard: The Header Parsing Paradox

A JSON Web Token consists of three base64url-encoded parts separated by periods:

```
  HEADER (Meta-data) . PAYLOAD (User Claims) . SIGNATURE (Cryptographic Proof)
```

To validate the signature, the validating microservice must first read the **Header** to know *which* algorithm was used (e.g., `alg: "RS256"`) and *which* key was used (e.g., `kid: "key-1"`).

### The Paradox
The validating service must parse and trust the metadata inside the Header **before** it can verify the cryptographic signature of the token. This creates a classic "chicken-and-egg" vulnerability. If the library naively trusts the parameters in the unverified header, an attacker can manipulate them to bypass verification entirely.

---

## Under the Hood: Critical JWT Vulnerability Vectors

Let's dissect the two most common architectural flaws in JWT validation.

### 1. The "None" Algorithm Vulnerability (Signature Stripping)
The JWT specification (RFC 7519) supports an algorithm called `"none"`. This was designed for local testing or secure backend environments where signatures are redundant.
If an attacker takes an administrator JWT:

```json
// Original Header
{ "alg": "RS256", "typ": "JWT" }
// Original Payload
{ "sub": "usr_102", "role": "user" }
```

And modifies it to:
```json
// Attack Header
{ "alg": "none", "typ": "JWT" }
// Attack Payload
{ "sub": "usr_102", "role": "admin" }
```

The attacker strips the signature entirely (sending `HEADER.PAYLOAD.`). If the downstream microservice uses a naive library that parses the `"alg"` header and dynamically executes verification, it will see `"alg": "none"`, assume no signature is required, and **approve the forged token instantly**.

---

### 2. JKU (JWK Set URL) Header Injection
In modern distributed systems, public keys are hosted on a JSON Web Key Set (JWKS) endpoint (e.g., `https://auth.mycompany.com/.well-known/jwks.json`). 
The JWT specification allows the token header to contain a `"jku"` claim, specifying the URL where the public key resides.

```json
// Vulnerable Header
{
  "alg": "RS256",
  "jku": "https://auth.mycompany.com/.well-known/jwks.json",
  "kid": "key-1"
}
```

If the validating microservice naively fetches the JWKS from whatever URL is specified in the `"jku"` header, an attacker can execute a **JKU Injection Attack**:

```
  Attacker ---> Crafts JWT with 'jku: https://attacker.com/keys.json' ---> [ Target API ]
                                                                                |
  Target API <--- Fetches Public Key <-----------------------------------------/
```

1. The attacker hosts a malicious JWKS file containing their own public key on their server: `https://attacker.com/keys.json`.
2. The attacker signs a forged administrative JWT using their private key and inserts `"jku": "https://attacker.com/keys.json"` into the header.
3. The vulnerable microservice receives the token, reads the JKU header, downloads the attacker's public key, and uses it to verify the signature. 
4. The signature matches perfectly! The server authorizes the attacker as an administrator.

---

## Code Example: Hardened JWT Validation Engine

Below is a complete, production-grade Python class demonstrating how to securely validate JWTs, block `"none"` algorithm attacks, and enforce strict domain boundaries on JKU headers to defeat injection attacks.

```python
import jwt  # PyJWT library
import urllib.parse
from typing import Optional

class HardenedJWTValidator:
    def __init__(self, allowed_issuer: str, allowed_audience: str, trusted_jwks_domains: list[str]):
        self.allowed_issuer = allowed_issuer
        self.allowed_audience = allowed_audience
        self.trusted_jwks_domains = trusted_jwks_domains

    def is_domain_trusted(self, url: str) -> bool:
        """
        Validates if the provided URL belongs to a trusted whitelist domain
        to prevent JKU redirect and SSRF attacks.
        """
        try:
            parsed_url = urllib.parse.urlparse(url)
            # Enforce HTTPS strictly
            if parsed_url.scheme != "https":
                return False
                
            # Extract hostname and check against whitelist
            hostname = parsed_url.hostname
            return hostname in self.trusted_jwks_domains
        except Exception:
            return False

    def secure_verify(self, token: str, public_key_pem: str) -> dict:
        """
        Securely decodes and validates a JWT token.
        Blocks 'none' algorithm and validates audience and issuer claims.
        """
        try:
            # 1. Inspect the header WITHOUT verifying signature first
            # to validate cryptographic expectations
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg")
            
            # CRITICAL DEFENSE: Enforce symmetric/asymmetric algorithms.
            # Reject 'none' algorithm explicitly.
            if alg is None or alg.lower() == "none":
                raise jwt.InvalidAlgorithmError("Alg 'none' is strictly prohibited.")
                
            # Enforce that we only accept robust asymmetric signatures in this handler
            if alg != "RS256":
                raise jwt.InvalidAlgorithmError(f"Unsupported algorithm: {alg}")

            # 2. Check JKU Header if present
            jku = unverified_header.get("jku")
            if jku:
                # CRITICAL DEFENSE: Verify domain ownership before fetching keys
                if not self.is_domain_trusted(jku):
                    raise PermissionError(f"Security Alert: Untrusted JKU endpoint: {jku}")

            # 3. Perform Cryptographic Verification
            decoded_claims = jwt.decode(
                token,
                public_key_pem,
                algorithms=["RS256"],  # Hardcode the expected algorithm explicitly!
                audience=self.allowed_audience,
                issuer=self.allowed_issuer
            )
            return {
                "status": "VALID",
                "claims": decoded_claims
            }
            
        except jwt.ExpiredSignatureError:
            return {"status": "INVALID", "reason": "Token signature expired"}
        except jwt.InvalidAlgorithmError as e:
            return {"status": "INVALID", "reason": f"Algorithm blocked: {str(e)}"}
        except jwt.InvalidTokenError as e:
            return {"status": "INVALID", "reason": f"Cryptographic failure: {str(e)}"}
        except PermissionError as e:
            return {"status": "INVALID", "reason": str(e)}


if __name__ == "__main__":
    print("[*] Initializing Hardened JWT Validator...")
    
    # Configure boundaries
    validator = HardenedJWTValidator(
        allowed_issuer="auth.company.com",
        allowed_audience="billing-api",
        trusted_jwks_domains=["auth.company.com", "secure-jwks.company.com"]
    )

    # --- JKU URL DOMAIN VALIDATION TESTS ---
    print("\n--- Testing JKU Header Domain Whitelisting ---")
    
    # Test 1: Trusted Domain - Should pass
    trusted_jku = "https://auth.company.com/keys.json"
    print(f"URL: {trusted_jku} -> Trusted? {validator.is_domain_trusted(trusted_jku)}")

    # Test 2: Attacker Domain - Should be blocked
    malicious_jku = "https://attacker.com/keys.json"
    print(f"URL: {malicious_jku} -> Trusted? {validator.is_domain_trusted(malicious_jku)}")

    # Test 3: HTTP Attempt - Should be blocked (No SSL)
    http_jku = "http://auth.company.com/keys.json"
    print(f"URL: {http_jku} -> Trusted? {validator.is_domain_trusted(http_jku)}")
```

---

## Common Misconceptions

### Misconception 1: "Encrypting JWTs (JWE) is required for authentication."
**Reality:** Standard JWTs (JWS) are **signed**, not encrypted. The data inside a JWS is merely Base64URL encoded, meaning **anyone can read the claims**. JWS protects against *tampering*, not *read access*. Only use JWE (JSON Web Encryption) if you must store highly sensitive, non-public data (like a social security number or API key) directly inside the token. For standard user roles, JWS is the correct choice.

### Misconception 2: "If I set a short expiration (e.g., 5 mins), I don't need token revocation."
**Reality:** A compromised JWT is valid until its expiration (`exp`) timestamp passes. During those 5 minutes, an attacker can make thousands of automated API requests to drain funds or steal data. Short expirations reduce the window of vulnerability, but high-security systems must still implement a **Token Blacklist** cache (in Redis) to immediately revoke tokens during anomalies or logout events.

---

## Pause and Think

> **Critical Question:** If your API gateway validates JWTs, do downstream microservices still need to check JWT signatures?

### Answer
**Yes, in a Zero Trust environment.** 

If you rely *only* on the API Gateway's check, an attacker who manages to compromise a single internal microservice can easily spoof tokens internally and call other services without restriction. Enforcing lightweight JWT signature verification at every trust boundary prevents lateral movement.

---

## Key Takeaways

* **JWT payloads are readable by anyone;** they are signed to prevent tampering, not to encrypt data.
* **The "None" algorithm is a high-risk vulnerability;** libraries must explicitly reject it in production.
* **Validate JKU and JWK headers against a strict whitelist of trusted domains** to prevent key injection attacks.
* Always enforce **explicitly scoped algorithm lists** (e.g. `algorithms=["RS256"]`) in your verification calls.

---

## What to Learn Next

To expand your identity and application security expertise, explore:
* **Implementing JWKS (JSON Web Key Set) caching and background rotation.**
* **Configuring OAuth 2.0 Mutual TLS (mTLS) Client Certificates for token binding.**
* **Mitigating replay attacks using JWT Nonce and JTI (JWT ID) tracking.**
