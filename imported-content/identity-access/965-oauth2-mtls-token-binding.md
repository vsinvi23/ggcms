# OAuth 2.0 mTLS: Binding Access Tokens to Client Certificates (RFC 8705)

## The Problem
Standard OAuth 2.0 Bearer tokens are vulnerable to theft. If a malicious actor intercepts a token (via network sniffing, log leaks, or Cross-Site Scripting), they can replay it against the Resource Server from any location. The token itself carries no proof of possession. To secure high-value APIs (e.g., Open Banking, financial services), we must bind the access token to the specific client that requested it.

## Architectural Architecture: Mutual TLS (mTLS) Binding
RFC 8705 introduces Mutual TLS for OAuth 2.0. It requires the client to present an X.509 certificate during the TLS handshake with both the Authorization Server (when requesting the token) and the Resource Server (when using the token). The Authorization Server hashes the client's certificate and embeds this hash directly into the Access Token.

```text
+--------+   1. mTLS Handshake (Client Cert A)  +-------------------+
|        |=====================================>|                   |
| Client |   2. Token Request                   | Auth Server       |
|        |<-------------------------------------| (Embeds Cert Hash)|
+--------+   3. Access Token (Bound to Cert A)  +-------------------+
    ||
    ||       4. mTLS Handshake (Client Cert A)
    ||========================================> +-------------------+
    ||       5. API Request + Access Token      |                   |
    +------------------------------------------>| Resource Server   |
             6. Validate Token Hash == Cert     |                   |
                                                +-------------------+
```

## How It Works: The `cnf` Claim
When the Authorization Server issues the token via the mTLS connection, it computes the SHA-256 thumbprint of the client's certificate and places it in the `cnf` (Confirmation) claim of the JWT.

```json
{
  "iss": "https://auth.bank.com",
  "aud": "https://api.bank.com",
  "sub": "user_123",
  "exp": 1690000000,
  "cnf": {
    "x5t#S256": "b64-encoded-sha256-thumbprint-of-client-cert"
  }
}
```

## Implementation: Resource Server Validation (Go)
When the Resource Server receives the API request, it must perform two checks:
1. Standard JWT validation (signature, exp, iss, aud).
2. Compute the hash of the client certificate used in the current mTLS connection and ensure it matches the `x5t#S256` value in the token.

```go
package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"github.com/golang-jwt/jwt/v5"
)

func ValidateMTLSToken(r *http.Request, tokenString string, secret []byte) error {
	// 1. Ensure the connection is mTLS and a client cert was provided
	if len(r.TLS.PeerCertificates) == 0 {
		return errors.New("missing client certificate in mTLS connection")
	}
	clientCert := r.TLS.PeerCertificates[0]

	// 2. Parse the JWT
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil || !token.Valid {
		return errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return errors.New("invalid claims")
	}

	// 3. Extract the 'cnf' claim
	cnf, ok := claims["cnf"].(map[string]interface{})
	if !ok {
		return errors.New("missing confirmation (cnf) claim")
	}
	expectedThumbprint, ok := cnf["x5t#S256"].(string)
	if !ok {
		return errors.New("missing x5t#S256 in cnf claim")
	}

	// 4. Compute the thumbprint of the presented certificate
	hash := sha256.Sum256(clientCert.Raw)
	actualThumbprint := base64.RawURLEncoding.EncodeToString(hash[:])

	// 5. Compare
	if expectedThumbprint != actualThumbprint {
		return errors.New("Proof of Possession failed: certificate mismatch")
	}

	return nil
}
```

## Operational Considerations
- **API Gateway Termination**: If TLS terminates at a Load Balancer or API Gateway, the Gateway must extract the client certificate and forward it to the internal microservices via a secure header (e.g., `X-Forwarded-Client-Cert`).
- **Certificate Rotation**: Because the binding relies on the exact certificate thumbprint, when a client rotates its certificate, it must obtain a new access token bound to the new certificate.
- **DPoP Alternative**: If mTLS is operationally too difficult (e.g., in browser-based SPAs where managing X.509 certs is impossible), consider Demonstrating Proof-of-Possession at the Application Layer (DPoP), which uses application-level signing keys instead of transport-level certificates.
