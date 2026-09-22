# OAuth 2.0 Client Credentials Grant: Securing Machine-to-Machine APIs

## The Problem: Hardcoded Secrets and Indefinite Trust in M2M Networks
In modern microservices architectures, back-end services frequently communicate with other services without any human user context. Historically, developers secured these machine-to-machine (M2M) interfaces using static API keys, basic authentication, or shared credentials stored in configuration files. 

This creates severe security vulnerabilities. First, static credentials possess indefinite lifetimes, meaning a single compromised service exposes its target system indefinitely until the key is manually rotated. Second, these keys often lack access boundaries, giving the client service broad, administrative privileges (the "blast radius" problem). Third, hardcoding secrets in application code or container environment variables exposes them to leakage through git repositories, log dumps, server SSRF vulnerabilities, or container compromises. When Service A needs to fetch reporting data from Service B, passing an all-powerful, static admin key is a fundamental violation of the principle of least privilege.

## The Mental Model: Decentralized Token-Based Delegation
To mitigate the risks of static credentials, we must decouple credential verification from resource access. The OAuth 2.0 Client Credentials Grant (defined in RFC 6749, Section 4.4) acts as a dynamic mediator. Instead of presenting a long-lived credential directly to the target API (the Resource Server), the client service presents its credentials to an independent, central Authorization Server. Upon validation, the Authorization Server issues a cryptographically signed, short-lived Access Token (typically a JSON Web Token, or JWT).

```
+------------------+                 +-----------------------+
|  Client Service  |--(1) Secret/JWT| Authorization Server  |
|  (e.g., Worker)  |  (Authenticate) | (Identity Provider)   |
+------------------+                 +-----------------------+
        |  ^                                     |
        |  | (2) Short-lived Access Token        |
        |  +-------------------------------------+
        |
        | (3) Request + Access Token
        v
+------------------+
| Resource Server  | (4) Cryptographic Verification of Signature
|   (Target API)   |     Claims (iss, aud, exp, scope)
+------------------+
```

Under this model, the Resource Server (RS) never sees or stores the client’s secret. The RS only needs to trust the public key of the Authorization Server (AS) to cryptographically verify the signature, lifetime (`exp`), audience (`aud`), and permissions (`scope`) of the incoming token.

## Protocol Exchange and Implementation Details
The client service authenticates with the AS using its credentials. The protocol supports basic shared secrets as well as more secure asymmetric methods.

### 1. HTTP Token Request
The client makes a `POST` request to the token endpoint of the Authorization Server:

```http
POST /oauth/token HTTP/1.1
Host: identity.serenya.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic dGVzdC1jbGllbnQtaWQ6c3VwZXItc2VjcmV0LWNsaWVudC1zZWNyZXQ=

grant_type=client_credentials&scope=read:reports
```

### 2. Token Response
If valid, the AS returns an access token with a limited validity window (e.g., 3600 seconds):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:reports"
}
```

## Attack Vectors in Machine-to-Machine Grants
1. **Token Replay Attacks:** If an attacker intercepts a valid M2M token, they can present it to any API that accepts the same issuer. Without audience checking, a token intended for the "Reporting Service" could be replayed against the "Billing Service."
2. **Secret Harvesting:** Storing the client secret in container environment variables or plain text configuration files. In a container breakout or SSRF scenario, these credentials are easily leaked.
3. **Privilege Creep:** Giving a machine identity a wide, unrestricted scope of actions. If the token's scope is not strictly bounded, a compromise of a minor worker daemon could allow full database write access.

## Advanced Defenses and Hardening
To secure the Client Credentials flow beyond the basics, developers should implement these critical patterns:

### 1. Asymmetric Client Assertions (RFC 7523)
Completely eliminate client secrets. Instead, register the client's public key with the AS. The client authenticates by signing a self-issued JWT assertion with its private key.

### 2. Mutual TLS (mTLS) Sender-Constrained Tokens (RFC 8705)
Bind the issued token cryptographically to the client’s client-certificate used during the TLS handshake. If the token is stolen, it is useless to an attacker because they cannot present the matching TLS private key.

### 3. Resource Server Claim Validation (Go Example)
The Resource Server must validation token claims. Here is a Go pattern:

```go
package main

import (
	"errors"
	"github.com/golang-jwt/jwt/v5"
)

type M2MClaims struct {
	Scope string `json:"scope"`
	jwt.RegisteredClaims
}

func ValidateM2MToken(tokenStr string, expectedAud string, expectedScope string) (*M2MClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &M2MClaims{}, func(t *jwt.Token) (interface{}, error) {
		return getASPublicKey(), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(*M2MClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}

	if !claims.VerifyAudience(expectedAud, true) || claims.Scope != expectedScope {
		return nil, errors.New("unauthorized")
	}

	return claims, nil
}
```

By decoupling M2M authorization, using private key JWT client assertions, and enforcing strict audience restrictions on the resource servers, developers can fully protect internal APIs from lateral movement and credential exposure.
