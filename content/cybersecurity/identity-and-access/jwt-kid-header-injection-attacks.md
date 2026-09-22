---
title: "JWT `kid` Header Injection: SQLi, Path Traversal, and Secure Key Lookup"
description: "How an unsanitized JWT kid header turns key lookup into a SQL injection, path traversal, or command injection vector — and how to defend it with a hardened JWKS cache in Python and JavaScript."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "jwt"
  - "kid-header"
  - "jwks"
  - "path-traversal"
  - "sql-injection"
  - "key-management"
---

# JWT `kid` Header Injection: SQLi, Path Traversal, and Secure Key Lookup

A payments API team rotates their JWT signing keys quarterly. To support rotation without breaking in-flight tokens, they publish a JWKS (JSON Web Key Set) endpoint and stamp every token's header with a `kid` (Key ID) so the resource server knows which public key verified it. Six months later, a penetration test report lands on their desk: an attacker forged an admin token by setting `kid` to `../../../dev/null`. The verification code did nothing wrong with the signature algorithm — it trusted the wrong input to decide *which key* to check the signature against.

This is the recurring blind spot in JWT security: developers know the payload is untrusted until the signature verifies, but forget the **header is read before the signature is checked** — and the header is exactly as attacker-controlled as the payload.

## The Problem: Implicit Trust in Header Values

JWTs are signed to guarantee integrity, but signature verification requires knowing *which key* to check against. That's what `kid` is for:

```json
{
  "alg": "RS256",
  "kid": "key-2026-09"
}
```

The resource server must read `kid` from the header **before** it can verify the signature — there's no way around this chicken-and-egg problem. That means `kid` is, functionally, an unauthenticated request parameter: exactly as trustworthy as a query string value on an anonymous GET request, and it must be validated under the same zero-trust assumptions.

```
[ Attacker JWT ]
  ├── Header:  {"alg": "HS256", "kid": "../../../etc/passwd"}   <-- attacker-controlled
  ├── Payload: {"user": "admin"}
  └── Signature: [ crafted to match whatever key the header points to ]
```

## Attack Vector 1: SQL Injection via Key Lookup

If signing keys live in a relational database and the lookup is built with string concatenation:

```sql
SELECT public_key FROM keys WHERE key_id = '<kid>'
```

An attacker sets `kid` to `' UNION SELECT 'attacker_known_secret' --`. The query now returns a value the attacker chose — say, the literal string `attacker_known_secret`. The attacker signs their forged JWT with that same value as an HMAC key, and it validates.

## Attack Vector 2: Directory Traversal to a Predictable File

If keys are stored as files on disk and retrieved by filename:

```
key = readFile("/keys/" + kid)
```

Setting `kid` to `../../../../dev/null` causes the server to read zero bytes from `/dev/null`. If the verification path is HS256 (symmetric), the "key" the server just loaded is an empty string — and an attacker can trivially forge an HS256 signature using the empty string as the HMAC secret.

```
       Attacker                  Auth Server                  File System
          |                           |                            |
          |-- 1. Send JWT with ------>|                            |
          |   kid: "../../../../dev/null"                          |
          |                           |-- 2. readFile(path+kid) -->|
          |                           |<-- 3. Return "" (0 bytes)--|
          |                           |                            |
          |                           |-- 4. Verify HMAC(kid="")   |
          |                           |    Signature matches ""    |
          |<-- 5. Access granted -----|                            |
```

Windows/Unix targets that expose a predictable static asset (`/public/style.css`, a well-known config file) are equally exploitable if their exact byte contents are known to the attacker — the file doesn't need to be empty, just predictable.

## Attack Vector 3: Command Injection

Some enterprise systems shell out to a CLI tool to fetch or verify certificates:

```
exec("get_key.sh " + kid)
```

An unsanitized `kid` concatenated into a shell command gives the attacker arbitrary command execution with the privileges of the web application — a JWT header field turning directly into RCE.

## The Solution: Explicit Key Mapping, Never Dynamic I/O

The fix is architectural, not a sanitizer: **never let the `kid` value parameterize a database query, filesystem path, or shell command.** Instead:

1. Fetch the JWKS from the trusted Identity Provider on a schedule (and cache it).
2. Build an in-memory map of `kid -> public_key`.
3. On every token, look up `kid` in that map with a strict equality check. If it's not present, reject the token immediately — never fall back to any dynamic lookup.

```
      [Vulnerable]                              [Secure]
key = readFile("/keys/" + kid)          key = TrustedJwksCache.get(kid)
// attacker controls the path            // returns None for anything
// => path traversal / SQLi / RCE        //    not in the whitelist map
```

### Secure Lookup Pattern (JavaScript)

```javascript
// Secure Look-Up Pattern — no dynamic I/O parameterized by kid
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

### Production Implementation: Secure JWKS Caching (Python / FastAPI)

```python
import httpx
import jwt
from fastapi import FastAPI, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict

app = FastAPI()
security = HTTPBearer()

JWKS_URL = "https://auth.serenya.com/.well-known/jwks.json"
trusted_keys: Dict[str, str] = {}


def refresh_jwks():
    """Fetch and replace the trusted key map from the IdP's JWKS endpoint."""
    response = httpx.get(JWKS_URL, timeout=5.0)
    response.raise_for_status()
    jwks = response.json()

    global trusted_keys
    fresh: Dict[str, str] = {}
    for key_data in jwks.get("keys", []):
        kid = key_data.get("kid")
        if kid:
            # In production, use jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            # to build the PEM from the JWK's (n, e) parameters.
            fresh[kid] = extract_pem_from_jwk(key_data)
    trusted_keys = fresh


# Call on startup, and periodically on a background schedule.
refresh_jwks()


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # 1. Read ONLY the header — no signature check has happened yet.
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            raise HTTPException(status_code=401, detail="Missing 'kid' in header")

        # 2. SECURE: strict dictionary lookup. No I/O parameterized by kid.
        public_key = trusted_keys.get(kid)
        if not public_key:
            raise HTTPException(status_code=401, detail="Unknown Key ID")

        # 3. Decode the payload using the safely resolved key.
        # Algorithm is hardcoded, never read from the token's own header.
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience="api.serenya.com",
        )
        return payload

    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/api/secure-data")
def get_secure_data(user: dict = Security(verify_token)):
    return {"message": "Access Granted", "user": user["sub"]}
```

### If Dynamic Lookup Is Unavoidable: Strict Allow-listing

If you genuinely cannot move to a static in-memory map (e.g. a huge multi-tenant key store), the fallback is aggressive input validation *before* the value ever reaches a query, path, or command:

```
Regex Constraint: ^[a-zA-Z0-9_-]{1,64}$
```

This blocks path traversal characters (`/`, `\`, `.`), SQL metacharacters (`'`, `;`, `--`), and shell metacharacters in one pass — but treat it as defense-in-depth, not the primary control. The primary control is still: don't build dynamic queries/paths/commands from header input at all.

## Engineering Considerations

1. **Algorithm confusion is a sibling bug.** Never let the `alg` header dynamically select the verification algorithm either — hardcode `algorithms=["RS256"]` (or your chosen algorithm) in the verify call, so an attacker can't swap an asymmetric scheme for a symmetric one (RS256→HS256 key confusion).
2. **JWKS fetch integrity.** The connection used to refresh the trusted key cache must itself be strictly TLS-validated. An attacker who can MITM the JWKS fetch can inject their own keys into your "trusted" cache — this is a separate but related attack surface covered by JKU/`x5u` header hardening.
3. **Disable `jku`/`x5u` dynamic resolution.** Don't let a token's header tell your server which JWKS URL or X.509 URL to fetch keys from at verification time — rely exclusively on your own statically configured IdP endpoint.
4. **Fail closed.** Any lookup miss, cache staleness, or fetch error should reject the token, not fall back to a permissive default.
