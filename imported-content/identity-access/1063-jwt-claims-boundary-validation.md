# JWT Claim Validation: Enforcing Issuer (iss) and Audience (aud) Boundaries

Cryptographic signature verification is only half of the validation lifecycle of JSON Web Tokens (JWTs). A token can be perfectly signed by a trusted Certificate Authority or Identity Provider (IdP), yet remain completely invalid for the specific application environment attempting to process it. Failing to strictly enforce Issuer (`iss`) and Audience (`aud`) boundaries is one of the most common causes of cross-tenant privilege escalation and environment confusion.

---

## The Problem: Trust Boundary Violations

Consider a microservice-based enterprise network utilizing a centralized authentication system. The IdP mints tokens for multiple systems (e.g., Client Portal, Internal Billing, Admin Control).

If a resource server (microservice) validates a token *only* by checking its signature against the shared JWKS public keys, it becomes vulnerable to:

1. **Audience Hijacking:** A client obtains a token containing limited privileges for the benign Client Portal (`aud: "client-portal"`). The client then sends this token to the sensitive Billing microservice (`aud: "billing-admin"`). Because the signature is valid, the Billing service processes the request, resulting in unauthorized administrative access.
2. **Environment/Issuer Leakage:** A development or staging IdP signs tokens using the same generic key set as production, or shares a public certificate chain. An attacker takes a valid developer token from staging (`iss: "https://dev-auth.company.com"`) and replays it against the production API gateway (`iss: "https://auth.company.com"`).
3. **Open-Ended Trust Chains:** Accepting arbitrary issuers because "they are signed by a trusted root" without explicit verification lists allows federated partners to bypass tenancy boundaries.

---

## Technical Architecture: Trust Boundary Verification Pipeline

A secure token verification engine must treat signature validation and claim boundary checks as two separate sequential filters. The token is rejected the instant *either* check fails.

```
       Incoming HTTP Request (Authorization: Bearer <JWT>)
                             |
                             v
              +------------------------------+
              |   Step 1: Parse JWT Header   |
              |   - Extract 'kid' and 'alg'  |
              +------------------------------+
                             |
                             v
              +------------------------------+
              | Step 2: Cryptographic Check  |
              | - Verify Signature           | ---> [FAIL] -> Reject 401 (Invalid Signature)
              | - Enforce RS256/ES256 only   |
              +------------------------------+
                             |
                             v
              +------------------------------+
              |   Step 3: Timing Envelope    |
              |   - Check exp (Expiration)   | ---> [FAIL] -> Reject 401 (Token Expired)
              |   - Check nbf (Not Before)   |
              +------------------------------+
                             |
                             v
              +------------------------------+
              | Step 4: Claim Boundary Check |
              | - Check expected 'iss'       | ---> [FAIL] -> Reject 403 (Issuer/Audience Breach)
              | - Check expected 'aud'       |
              +------------------------------+
                             |
                             v
               Forward to Business Logic (200 OK)
```

---

## Production-Grade Code: Strict PyJWT Validator (Python)

Below is a robust Python implementation utilizing `PyJWT` that demonstrates high-severity trust boundary validation. It enforces strict issuer matching, audience verification, expiration thresholds, and custom claim boundaries (e.g., tenant containment).

```python
import time
from typing import Dict, Any, List
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError, InvalidIssuerError, InvalidAudienceError

class SecurityBoundaryValidator:
    def __init__(
        self, 
        expected_issuer: str, 
        expected_audiences: List[str], 
        allowed_algorithms: List[str] = None
    ):
        self.expected_issuer = expected_issuer
        self.expected_audiences = expected_audiences
        self.allowed_algorithms = allowed_algorithms or ["RS256", "ES256"]

    def validate_and_extract_claims(self, raw_token: str, public_key: str, required_tenant: str = None) -> Dict[str, Any]:
        """
        Validates signature, time constraints, issuer boundaries, audience constraints, and custom claims.
        """
        try:
            # Decode performs signature verification, expiration checks, 
            # and enforces matching of expected issuer/audiences.
            payload = jwt.decode(
                raw_token,
                public_key,
                algorithms=self.allowed_algorithms,
                audience=self.expected_audiences,
                issuer=self.expected_issuer,
                options={
                    "require": ["exp", "iss", "aud", "sub"], # Reject tokens missing standard metadata
                    "verify_signature": True,
                }
            )
            
            # Enforce Custom Tenant Containment Claim
            if required_tenant:
                token_tenant = payload.get("tenant_id")
                if not token_tenant:
                    raise InvalidTokenError("Security breach: Token is missing mandatory 'tenant_id' payload.")
                
                # Use constant-time comparison to prevent timing attacks on tenant checking
                if not self._constant_time_compare(token_tenant, required_tenant):
                    raise InvalidTokenError(f"Access denied: Token tenant '{token_tenant}' does not match context '{required_tenant}'.")

            return payload

        except ExpiredSignatureError as e:
            raise PermissionError("Access Denied: The presented token is expired.") from e
        except InvalidIssuerError as e:
            raise PermissionError("Security Violation: Token issuer trust mismatch.") from e
        except InvalidAudienceError as e:
            raise PermissionError("Security Violation: Target audience mismatch for this resource.") from e
        except InvalidTokenError as e:
            raise PermissionError(f"Unauthorized: Token structural or claim violation: {str(e)}") from e

    @staticmethod
    def _constant_time_compare(val1: str, val2: str) -> bool:
        """
        Prevents timing-analysis side-channel attacks when verifying tenant strings.
        """
        if len(val1) != len(val2):
            return False
        result = 0
        for x, y in zip(val1.encode('utf-8'), val2.encode('utf-8')):
            result |= x ^ y
        return result == 0

# Example usage
if __name__ == "__main__":
    # Define production deployment trust anchors
    validator = SecurityBoundaryValidator(
        expected_issuer="https://auth.serenya-prod.com",
        expected_audiences=["https://api.serenya.com/billing", "https://api.serenya.com/reporting"]
    )
    
    # Simulating standard public verification keys (e.g. from JWKS)
    # This is a sample key structure for demonstrative validation flow
    mock_public_key = "--- PUBLIC KEY GOES HERE ---"
    
    # Developer Note: Always pass strict target tenant IDs to the validator
    # to protect multi-tenant cloud storage structures.
```

---

## Defensive Strategy: Critical Checks for Claim Integrity

- **Decline Wildcard Audiences:** Do not support wildcard matchers (e.g., `aud: "*"`) in production code. Audiences must be explicit, literal URLs or unique URN resource identifiers.
- **Reject Array Aud Abuse:** Standard JWT specifications allow `aud` to be a string or an array of strings. If the audience parameter is an array, ensure the verification library iterates through the list and requires an *exact* match on at least one registered client identifier.
- **Implicit Validation Flags:** When calling libraries, ensure automatic checking flags are explicitly set (e.g., do not pass `verify_aud=False` or disable issuer checking).
