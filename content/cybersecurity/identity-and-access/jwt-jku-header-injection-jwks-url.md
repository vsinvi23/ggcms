---
title: "JWT JKU Header Injection: When the Token Tells the Server Which Key to Trust"
description: "How an attacker-controlled jku header can make a resource server fetch and trust a forged public key, and how to lock JWKS resolution down to a static, whitelisted domain set."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "jwt"
  - "jku"
  - "jwks"
  - "ssrf"
  - "key-injection"
---

# JWT JKU Header Injection: When the Token Tells the Server Which Key to Trust

## The Problem: The Header Parsing Paradox

A JWT is `HEADER.PAYLOAD.SIGNATURE`, and validating that signature requires first reading the header to learn which algorithm and which key were used. That means the resource server necessarily parses and acts on attacker-controlled metadata *before* it has any cryptographic guarantee about that metadata's integrity — a chicken-and-egg problem that every JWT verification library has to navigate carefully.

```
[ Auth Service ] ---> Issues signed JWT ---> [ Client ]
                                                  |
[ Payment Service ] <--- validates signature in memory <---/
```

Downstream microservices trust everything inside a JWT purely because the signature checks out. If an attacker can influence *which key* is used to check that signature, they control the outcome of the check itself.

## The Attack: JKU (JWK Set URL) Header Injection

Modern JWT deployments publish rotating public keys via a JWKS endpoint, e.g. `https://auth.mycompany.com/.well-known/jwks.json`. The JWT spec allows a token's header to carry a `jku` claim naming the URL where the verifying key lives:

```json
{
  "alg": "RS256",
  "jku": "https://auth.mycompany.com/.well-known/jwks.json",
  "kid": "key-1"
}
```

If the validating service naively fetches whatever URL the `jku` header names, an attacker can supply their own:

```
  Attacker ---> crafts JWT with 'jku: https://attacker.com/keys.json' ---> [ Target API ]
                                                                                |
  Target API <--- fetches public key from attacker's URL <----------------------/
```

1. The attacker hosts a JWKS file containing a key pair they control, at a URL they control.
2. They sign a forged token (any claims they want) with their own private key, and set `jku` to point at that hosted file.
3. The vulnerable service reads `jku` from the header, fetches the attacker's public key, and uses it to verify the signature.
4. The signature matches — because the attacker generated both the signature and the key it's checked against — and the forged token is accepted as fully valid, admin claims included.

This is functionally identical in spirit to the `kid` path-traversal and SQL-injection attacks covered elsewhere: the header field determines *which key material the server trusts*, and if that field is attacker-controlled with no boundary, the attacker chooses the trust anchor.

## Why This Also a Server-Side Request Forgery (SSRF) Risk

Beyond the signature-forgery angle, an unrestricted `jku` fetch is itself an SSRF primitive: an attacker can point `jku` at an internal-only URL (a cloud metadata endpoint, an internal admin API) purely to make the server issue a request there, independent of whether the "JWKS" response even parses as valid keys. Any hardening for `jku` needs to close both the signature-trust hole and the SSRF surface at once.

## The Fix: Whitelist the JWKS Domain, Enforce HTTPS, Never Follow the Token's URL Blindly

```python
import jwt  # PyJWT
import urllib.parse

class HardenedJWTValidator:
    def __init__(self, allowed_issuer: str, allowed_audience: str, trusted_jwks_domains: list[str]):
        self.allowed_issuer = allowed_issuer
        self.allowed_audience = allowed_audience
        self.trusted_jwks_domains = trusted_jwks_domains

    def is_domain_trusted(self, url: str) -> bool:
        """Restrict JKU resolution to a static, pre-approved domain allow-list."""
        try:
            parsed_url = urllib.parse.urlparse(url)
            if parsed_url.scheme != "https":
                return False
            return parsed_url.hostname in self.trusted_jwks_domains
        except Exception:
            return False

    def secure_verify(self, token: str, public_key_pem: str) -> dict:
        try:
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg")

            # Reject 'none' outright and pin the expected algorithm explicitly.
            if alg is None or alg.lower() == "none":
                raise jwt.InvalidAlgorithmError("Alg 'none' is strictly prohibited.")
            if alg != "RS256":
                raise jwt.InvalidAlgorithmError(f"Unsupported algorithm: {alg}")

            jku = unverified_header.get("jku")
            if jku:
                # Never fetch a JKU URL the server doesn't already trust.
                if not self.is_domain_trusted(jku):
                    raise PermissionError(f"Untrusted JKU endpoint: {jku}")

            decoded_claims = jwt.decode(
                token,
                public_key_pem,   # resolved from YOUR static configuration, not the fetched JKU blindly
                algorithms=["RS256"],
                audience=self.allowed_audience,
                issuer=self.allowed_issuer,
            )
            return {"status": "VALID", "claims": decoded_claims}

        except jwt.ExpiredSignatureError:
            return {"status": "INVALID", "reason": "Token signature expired"}
        except jwt.InvalidAlgorithmError as e:
            return {"status": "INVALID", "reason": f"Algorithm blocked: {e}"}
        except jwt.InvalidTokenError as e:
            return {"status": "INVALID", "reason": f"Cryptographic failure: {e}"}
        except PermissionError as e:
            return {"status": "INVALID", "reason": str(e)}
```

```python
validator = HardenedJWTValidator(
    allowed_issuer="auth.company.com",
    allowed_audience="billing-api",
    trusted_jwks_domains=["auth.company.com", "secure-jwks.company.com"],
)

validator.is_domain_trusted("https://auth.company.com/keys.json")     # True  — trusted host, HTTPS
validator.is_domain_trusted("https://attacker.com/keys.json")         # False — not on the allow-list
validator.is_domain_trusted("http://auth.company.com/keys.json")      # False — HTTP rejected, HTTPS required
```

The realistic production posture goes further than an allow-list check at verify time: fetch and cache JWKS from your *own statically configured* endpoint on a schedule, and ignore the `jku`/`x5u` header entirely rather than resolving it dynamically per request. A dynamic per-token fetch, even whitelisted, adds latency and a live network dependency to every verification; a background-refreshed cache removes both while still supporting key rotation.

## Common Misconceptions

**"Encrypting JWTs (JWE) is required for authentication."** Standard JWTs (JWS) are signed, not encrypted — the payload is only Base64URL-encoded and fully readable by anyone who has the token. JWS protects against tampering, not disclosure. Reach for JWE only if the token must carry genuinely sensitive data that shouldn't be human-readable even to the token's own bearer.

**"A short expiration means I don't need revocation."** A stolen token remains valid until `exp`, no matter how short that window is — during a 5-minute window an attacker can still fire thousands of automated requests. Short lifetimes reduce blast radius; they don't replace a revocation mechanism (see the companion article on Redis-backed JWT blacklisting).

**"If the API gateway checks the JWT, downstream services don't need to."** In a zero-trust internal network, they still do. If a single internal service is ever compromised, an attacker who only needs to forge or replay tokens *internally* — past a gateway that already did its one check — can move laterally unopposed. Every trust boundary should verify the signature independently.

## Key Takeaways

- Treat `jku` and `x5u` exactly like the `kid` header: attacker-controlled metadata read before any signature verification has occurred.
- Never let a token's header decide which URL your server fetches keys from — resolve keys from a statically configured source, whitelisted at minimum, ignored by preference.
- An unrestricted `jku` fetch is both a signature-forgery vector and an SSRF vector; closing one without the other is incomplete.
- Combine this with explicit algorithm pinning (reject `none`, don't dynamically trust the token's `alg`) — the two defenses are usually broken together by the same naive verification code.
