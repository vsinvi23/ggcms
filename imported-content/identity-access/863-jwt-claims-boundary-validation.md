# JWT Claim Validation: Enforcing Issuer (iss) and Audience (aud) Boundaries

## The Problem: The Confused Deputy Attack via Trust Boundary Bleed

A common security anti-pattern in distributed architectures is trusting a signed JSON Web Token (JWT) based *solely* on cryptographic signature verification. When a microservice imports a public key from a shared identity provider and verifies a token's signature, it has only proven that the token was signed by a trusted authority. It has **not** proven that the token was meant for *that specific service*.

Consider a corporate ecosystem with two distinct internal services:
1. **Billing Service:** Handles financial ledger calculations (`aud: corporate-billing`).
2. **Support Forums:** Stores internal documentation and general discussion threads (`aud: employee-forums`).

If both systems trust the same shared Identity Provider (IdP) but fail to validate the Audience (`aud`) and Issuer (`iss`) claims, they fall victim to the **Confused Deputy Problem**:

```
+------------------+         1. Logs in securely          +-------------------+
|  Malicious Support| ----------------------------------> | Identity Provider |
|     Employee     |                                      +-------------------+
+------------------+                                                |
         |                                                          | 2. Issues valid JWT
         |                                                          |    with aud: employee-forums
         |                                                          v
         |               3. Submits support token                   |
         +----------------------------------------------------------+
         |
         v
+------------------+
| Billing Service  | (Verifies signature successfully using shared public keys.
| (aud: billing)   |  Fails to check aud claim -> Grants admin Billing access!)
+------------------+
```

An employee with low-privilege support forum access can extract their valid token, replay it to the Billing Service, and gain unauthorized administrative access. Because the signature is valid, the Billing Service blindly parses the claims.

---

## Technical Architecture

The following diagram represents the trust boundaries that must be enforced during the JWT claims processing phase:

```
               [ Incoming JWT Payload ]
                          |
                          v
               +----------------------+
               | Signature Validation | ---> Invalid? -> REJECT (401)
               +----------------------+
                          | Valid
                          v
               +----------------------+
               |  Issuer (iss) Match  | ---> Mismatch? -> REJECT (401)
               +----------------------+
                          | Matches expected
                          v
               +----------------------+
               | Audience (aud) Match | ---> Mismatch? -> REJECT (401)
               +----------------------+
                          | Matches expected
                          v
               +----------------------+
               | Temporal Bounds Check| ---> Expired/Not Active? -> REJECT (401)
               |  (exp, nbf, iat)     |
               +----------------------+
                          | Valid
                          v
               +----------------------+
               | Tenancy (tid) Isolation| -> Tenant mismatch? -> REJECT (403)
               +----------------------+
                          | Matches context
                          v
                  [ Process Request ]
```

---

## Core Security Assertions

### 1. The Issuer (`iss`) Claim
Identifies the principal that issued the JWT. The validation layer must compare this string against a strict config-defined string. Regular expression matching on issuers should be avoided as minor typos can allow attackers to bypass domains (e.g., matching `https://auth.serenya.io.attacker.com` if using a naive substring check).

### 2. The Audience (`aud`) Claim
Identifies the recipients that the JWT is intended for. Each service must reject tokens where the `aud` claim does not contain its specific, unique identifier.

### 3. Temporal Validation (`exp`, `nbf`, `iat`)
* `exp` (Expiration Time): Must be strictly greater than the current time, accounting for a minor clock skew (typically 1-2 minutes).
* `nbf` (Not Before): The token must not be accepted prior to this timestamp.
* `iat` (Issued At): Rejects tokens issued in the future, detecting massive system clock drift.

---

## Code Implementation: Go

The following Go package demonstrates strict claims verification using the `github.com/golang-jwt/jwt/v5` framework, emphasizing audience array unpacking and multi-tenant boundary checks.

```go
package main

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type SecureClaims struct {
	TenantID string `json:"tid"` // Custom corporate tenant identifier claim
	jwt.RegisteredClaims
}

type TokenValidator struct {
	ExpectedIssuer   string
	ExpectedAudience string
	SigningKey       []byte
	MaxClockSkew     time.Duration
}

func NewTokenValidator(issuer, audience string, key []byte) *TokenValidator {
	return &TokenValidator{
		ExpectedIssuer:   issuer,
		ExpectedAudience: audience,
		SigningKey:       key,
		MaxClockSkew:     1 * time.Minute,
	}
}

/**
 * Parses and strictly verifies all JWT claim boundaries.
 */
func (v *TokenValidator) ValidateToken(tokenString string, expectedTenantID string) (*SecureClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &SecureClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Enforce signature method constraints (Mitigate Alg:None attacks)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return v.SigningKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("cryptographic parse failed: %w", err)
	}

	claims, ok := token.Claims.(*SecureClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token format or claims cast failed")
	}

	// 1. Enforce Issuer (iss) Boundary
	if claims.Issuer != v.ExpectedIssuer {
		return nil, fmt.Errorf("security error: issuer mismatch. Got %s, expected %s", claims.Issuer, v.ExpectedIssuer)
	}

	// 2. Enforce Audience (aud) Boundary
	// The aud claim can technically be a string or array of strings. jwt/v5 handles this natively.
	hasAudience := false
	for _, aud := range claims.Audience {
		if aud == v.ExpectedAudience {
			hasAudience = true
			break
		}
	}
	if !hasAudience {
		return nil, fmt.Errorf("security error: audience mismatch. Token not targeted for %s", v.ExpectedAudience)
	}

	// 3. Temporal Validation (exp, nbf, iat)
	now := time.Now()
	
	if claims.ExpiresAt == nil || claims.ExpiresAt.Before(now.Add(-v.MaxClockSkew)) {
		return nil, errors.New("security error: token is expired")
	}

	if claims.NotBefore != nil && claims.NotBefore.After(now.Add(v.MaxClockSkew)) {
		return nil, errors.New("security error: token is not active yet")
	}

	// 4. Enforce Tenancy Boundary
	if claims.TenantID == "" || claims.TenantID != expectedTenantID {
		return nil, fmt.Errorf("security error: tenant isolation breach. Expected tenant %s, token claims %s", expectedTenantID, claims.TenantID)
	}

	return claims, nil
}
```

---

## Operational Verification

To verify claims boundaries in your integration tests:
- Attempt authentication using a JWT signed with the correct key but possessing a different `aud` string; the validation pipeline must reject it with an explicit audience mismatch error.
- Verify that expired tokens or tokens with future `nbf` values are caught, and that custom tenant isolation rules enforce separation between multi-tenant routing paths.
