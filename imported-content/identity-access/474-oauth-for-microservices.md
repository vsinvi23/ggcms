# OAuth for Microservices: Token Relay and Validation Gating

## The Problem
When shifting from monoliths to microservices, identity context propagation becomes a massive challenge. A client request reaches an API Gateway, which then calls Service A, which calls Service B, and so on. If the gateway simply strips the OAuth token and forwards arbitrary headers (e.g., `X-User-Id`), the downstream services blindly trust the gateway, violating the Zero Trust paradigm.

Conversely, passing the raw, original edge-facing JSON Web Token (JWT) deep into the service mesh exposes too much scope. If an internal service is compromised, the attacker extracts a broad-scoped token that can be used anywhere in the architecture.

## The Architecture: Token Relay and Validation Gating

The secure approach consists of two mandates:
1. **Validation Gating**: Every service validates the identity context; trust is never implicitly assumed based on network location.
2. **Token Relay (or Token Exchange)**: Services negotiate downstream tokens with strictly scoped permissions rather than propagating the edge token globally.

### Scenario 1: JWT Propagation (Simple Relay)
For internal meshes with low lateral-movement risk, services can pass the JWT forward, but *each service must cryptographically validate the JWT*.

```text
[ Client ] -> [ API Gateway ] -> [ Service A ] -> [ Service B ]
     (1. Bearer JWT)       (2. Bearer JWT)      (3. Bearer JWT)
```
*Requirement: Service A and Service B must both fetch the IdP's JWKS (JSON Web Key Set) and validate the token's signature, expiry, and audience.*

### Scenario 2: Token Exchange (RFC 8693)
For high-security meshes, Service A should not pass the edge JWT to Service B. Instead, it exchanges the edge token for an internal token scoped explicitly for Service B.

```text
                     [ Authorization Server ]
                             ^    |
                             |    | 3. Returns Scoped JWT (Aud: Service B)
 2. POST /token/exchange     |    |
    (Subject Token: EdgeJWT) |    V
[ Client ] -> [ Gateway ] -> [ Service A ] ------------------> [ Service B ]
     (1. Bearer EdgeJWT)                   4. (Bearer ScopedJWT)
```

## Implementation: Validation Gating in Go
To enforce Zero Trust, every microservice should implement a middleware/interceptor that cryptographically verifies the JWT.

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "strings"
    "github.com/MicahParks/keyfunc/v2"
    "github.com/golang-jwt/jwt/v5"
)

// Global JWKS cache
var jwks *keyfunc.JWKS

func init() {
    var err error
    // Fetch and cache the public keys from the Identity Provider
    jwksURL := "https://idp.example.com/.well-known/jwks.json"
    jwks, err = keyfunc.Get(jwksURL, keyfunc.Options{})
    if err != nil {
        panic(fmt.Sprintf("Failed to get JWKS: %v", err))
    }
}

// Middleware to Gate Access
func JWTValidationMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if !strings.HasPrefix(authHeader, "Bearer ") {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        tokenString := strings.TrimPrefix(authHeader, "Bearer ")

        // Parse and validate the token signature using the JWKS
        token, err := jwt.Parse(tokenString, jwks.Keyfunc)
        if err != nil || !token.Valid {
            http.Error(w, "Invalid Token", http.StatusUnauthorized)
            return
        }

        // Validate Audience (Aud) and Scope for this specific microservice
        if claims, ok := token.Claims.(jwt.MapClaims); ok {
            aud := claims["aud"].(string)
            if aud != "service-a-audience" {
                http.Error(w, "Invalid Audience", http.StatusForbidden)
                return
            }
            
            // Inject claims into context for downstream handlers
            ctx := context.WithValue(r.Context(), "userClaims", claims)
            next.ServeHTTP(w, r.WithContext(ctx))
        } else {
            http.Error(w, "Invalid Claims", http.StatusUnauthorized)
        }
    })
}
```

## Token Exchange (RFC 8693) Implementation Logic
When Service A needs to call Service B, it uses the OAuth 2.0 Token Exchange grant type.

```bash
# Service A requests a new token for Service B
curl -X POST https://idp.example.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=<EDGE_JWT_HERE>" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:jwt" \
  -d "resource=urn:service-b" \
  -d "client_id=service-a-client-id" \
  -d "client_secret=service-a-secret"
```
Service A receives a new token containing only the scopes necessary for Service B, drastically reducing the blast radius of token theft within the microservice mesh.