# JWT Claim Validation: Enforcing Issuer (iss) and Audience (aud) Boundaries

## The Problem
A common vulnerability in microservice architectures is "Confused Deputy" attacks via token reuse. If Microservice A accepts a JWT intended for Microservice B, a compromised service can replay its tokens laterally. Validating the cryptographic signature and the `exp` (expiration) claim of a JWT is not enough. You must enforce strict boundaries by validating *who* issued the token (`iss`) and *who* the token is intended for (`aud`).

## Architectural Context
When an Identity Provider (IdP) mints a token, it explicitly stamps the intended recipient in the `aud` claim and its own identity in the `iss` claim.

```text
+-------+        +-------------+   Token intended for B   +-----------------+
|       | Token  |             | =======================> | Microservice B  |
| User  |=======>| API Gateway |                          | (Validates aud) |
|       |        |             |   Token intended for C   |                 |
+-------+        +-------------+ =======================> +-----------------+
                                                          | Microservice C  |
                                                          | (Rejects aud B) |
                                                          +-----------------+
```

## The Claims Mechanics
- **`iss` (Issuer)**: A URL representing the exact entity that created and signed the token.
- **`aud` (Audience)**: A string (or array of strings) identifying the recipients that the JWT is intended for.

If Microservice C receives a token where `aud: "microservice_b"`, it must reject it immediately, even if the signature is valid.

## Robust Validation Implementation (Go)

When validating JWTs, hardcode your expected boundaries. Never dynamically accept what is inside the token.

```go
package auth

import (
	"errors"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
)

// Hardcoded expectations for boundary enforcement
const (
	ExpectedIssuer   = "https://auth.company.com/"
	ExpectedAudience = "urn:microservice:billing-api"
)

func ValidateToken(tokenString string, secretKey []byte) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Ensure the signing method is exactly what we expect (prevent algorithm confusion)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretKey, nil
	}, jwt.WithValidMethods([]string{"HS256"}))

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		// 1. Enforce Issuer Boundary
		iss, _ := claims.GetIssuer()
		if iss != ExpectedIssuer {
			return nil, errors.New("invalid issuer: token not minted by trusted IdP")
		}

		// 2. Enforce Audience Boundary
		// jwt.MapClaims handles both string and []string audiences under the hood
		if !claims.VerifyAudience(ExpectedAudience, true) {
			return nil, errors.New("invalid audience: token not intended for this service")
		}

		// 3. Prevent Token Use Before Issued (NBF / IAT)
		// Handled automatically by jwt.Parse if claims are present, but good to note.

		return token, nil
	}

	return nil, errors.New("invalid token structure")
}
```

## Multi-Audience Edge Cases
Sometimes a token is minted for multiple audiences (e.g., an API gateway and a downstream service). The `aud` claim will be an array: `["api-gateway", "billing-api"]`.

Your validation logic must check if *your* specific service identifier is *present* in the array. It does not need to be the only element.

## Defense in Depth: Subject (sub) and Azp (Authorized Party)
- **`azp` (Authorized Party)**: Used in OpenID Connect. If an ID Token is issued to a client, but intended for a different backend, the `aud` is the backend, and the `azp` is the client ID that requested the token. If `azp` is present, verify it matches your expected client application.
- **`sub` (Subject)**: Never trust the `sub` claim for authorization mapping unless `iss` and `aud` are fully verified. An attacker can set up their own Auth0 instance, generate a token with `sub: admin_user`, and replay it against your API. Validating the `iss` ensures the `sub` actually belongs to *your* tenant.
