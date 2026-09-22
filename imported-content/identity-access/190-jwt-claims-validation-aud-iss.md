# JWT Claim Validation: Enforcing Issuer (iss) and Audience (aud) Boundaries

## The Problem
Cryptographic validation is only half of the story when securing JSON Web Tokens (JWTs). A common and severe mistake developers make is validating the cryptographic signature of an inbound token while neglecting to verify its structural metadata. If your service validates the signature using a shared JSON Web Key Set (JWKS) but fails to enforce issuer (`iss`) and audience (`aud`) boundaries, it is highly vulnerable to privilege escalation and authorization bypasses.

Without explicit claim validation, any valid token minted by the same Identity Provider (IdP) for *any* application in your ecosystem—or sometimes any tenant in a multi-tenant environment—can be used to authenticate against your specific API. This transforms your service into a "Confused Deputy," blindly trusting a cryptographically sound token that was never intended for your system.

## The Mental Model
Consider a distributed microservices architecture where Service A and Service B trust the same central Authorization Server (AS). 

```
                                  +-------------------+
                                  |   Authorization   |
                                  |    Server (AS)    |
                                  +-------------------+
                                     /             \
                   Issues Token for /               \ Issues Token for
                  Audience "Service A"             Audience "Service B"
                                  /                 \
                                 v                   v
                          +-----------+         +-----------+
                          | Service A |         | Service B |
                          +-----------+         +-----------+
                                |
                     Attacker replays token
                     with aud="Service A"
                                v
                          +-------------------------+
                          |       Service B         |
                          | (If aud is not checked, |
                          |  this request succeeds!)|
                          +-------------------------+
```

If Service B only validates the signature of the incoming token, an attacker can steal a token intended for Service A and replay it against Service B. Since the token's cryptographic signature is completely valid, Service B will process the request.

## Attack Vectors
1. **The Confused Deputy (Cross-Service Replay)**: In this scenario, an attacker obtains a token minted for a low-privilege public client (e.g., a mobile companion app). They replay this token against a high-privilege backend administrative API. If the administrative API does not assert that `aud` matches its own identifier, it accepts the client's request.
2. **Cross-Tenant Authorization Bypass**: In SaaS environments using multi-tenant identity providers (like Azure AD or Auth0), multiple tenants share the same signing keys. If a service verifies the signature but fails to validate that the `iss` claim contains the exact tenant identifier (e.g., `https://login.example.com/tenant-123/`), a user from `tenant-456` can present their valid token to access `tenant-123` data.
3. **Algorithm Confusion (Key Substitution)**: Attackers alter the JWT header alg parameter from asymmetric (e.g., `RS256`) to symmetric (e.g., `HS256`), signing the token with the public key of the service. If the library doesn't strictly enforce algorithm constraints during validation, it will use the public key as an HMAC secret, validating the signature.

## Defensive Architecture
To completely eliminate claim-based vulnerabilities, every JWT validator must perform strict assertion checks immediately after cryptographic verification.

### Python-Based Strict JWT Validation Implementation
Below is an enterprise-grade Python implementation using the `PyJWT` library. This code showcases how to enforce cryptographic algorithms, issuer bounds, audience limits, and temporal constraints (`exp` and `nbf`).

```python
import os
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidIssuerError, InvalidAudienceError, InvalidSignatureError

# Configuration loaded from secure environment variables
EXPECTED_ISSUER = os.getenv("JWT_ISSUER") # e.g., "https://auth.serenya.com/oauth/v2"
EXPECTED_AUDIENCE = os.getenv("JWT_AUDIENCE") # e.g., "https://api.serenya.com/v1"
PUBLIC_SIGNING_KEY = os.getenv("JWT_PUBLIC_KEY") # PEM-encoded RSA public key

def validate_and_decode_token(token: str) -> dict:
    """
    Decodes and rigorously validates an inbound JWT.
    Enforces issuer, audience, and algorithm boundaries.
    """
    try:
        # We explicitly define the allowed algorithm to prevent algorithm confusion attacks
        decoded_payload = jwt.decode(
            token,
            PUBLIC_SIGNING_KEY,
            algorithms=["RS256"],
            audience=EXPECTED_AUDIENCE,
            issuer=EXPECTED_ISSUER,
            options={
                "require": ["exp", "iss", "aud", "nbf"],
                "verify_signature": True,
            }
        )
        return decoded_payload

    except ExpiredSignatureError as e:
        raise ValueError("Token has expired. Please authenticate again.") from e
    except InvalidIssuerError as e:
        raise ValueError(f"Issuer mismatch. Expected {EXPECTED_ISSUER}") from e
    except InvalidAudienceError as e:
        raise ValueError(f"Audience mismatch. Expected {EXPECTED_AUDIENCE}") from e
    except InvalidSignatureError as e:
        raise ValueError("Cryptographic signature validation failed.") from e
    except Exception as e:
        raise ValueError("Token is invalid or malformed.") from e
```

## Best Practices
- **Define Custom Audiences per Service**: Never use a single, global audience for all your APIs. Give every microservice a unique URI or identifier as its audience value.
- **Always Validate Temporal Claims**: Enforce the presence of `exp` (expiration time) and `nbf` (not before) claims, ensuring that tokens cannot be replayed outside their explicit lifetime.
- **Never Disable Default Validation**: Always rely on established, maintained cryptographic libraries, and never bypass built-in validation routines with manual string parsing.
