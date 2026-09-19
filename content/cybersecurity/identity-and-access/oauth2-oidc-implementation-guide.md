---
title: "OAuth 2.0 & OpenID Connect (OIDC) Implementation Architecture"
description: "A practical security engineering guide to implementing OAuth 2.0 authorization code flow with PKCE, JWT validation, JWKS caching, and Go middleware."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "oauth-2"
  - "openid-connect"
  - "jwt"
---

# OAuth 2.0 & OpenID Connect (OIDC) Implementation Architecture

Modern web and mobile applications require decentralized, secure authentication and authorization protocols. **OAuth 2.0** handles authorization (granting third-party apps limited access to user resources), while **OpenID Connect (OIDC)** extends OAuth 2.0 to provide identity authentication (verifying *who* the user is).

This guide covers the OAuth 2.0 Authorization Code Flow with PKCE, JWT structure, JWKS key management, and production Go middleware.

---

## 1. Authorization Code Flow with PKCE Sequence

Proof Key for Code Exchange (PKCE) is mandatory for public clients (Single Page Applications and mobile apps) to prevent authorization code interception attacks.

```text
 ┌──────────────┐         ┌──────────────────────┐         ┌─────────────────────┐
 │ User Browser │         │ OAuth Authorization  │         │ Resource Server     │
 │ / SPA Client │         │ Server (Identity)    │         │ (Go Backend API)    │
 └──────┬───────┘         └──────────┬───────────┘         └──────────┬──────────┘
        │                            │                                │
        │ 1. Generate Code Verifier  │                                │
        │    & Code Challenge        │                                │
        │                            │                                │
        │ 2. GET /oauth/authorize    │                                │
        │    ?code_challenge=...     │                                │
        ├───────────────────────────►│                                │
        │                            │                                │
        │ 3. User Logins & Approves  │                                │
        │ 4. Redirect with Auth Code │                                │
        │◄───────────────────────────┤                                │
        │                            │                                │
        │ 5. POST /oauth/token       │                                │
        │    (code + code_verifier)  │                                │
        ├───────────────────────────►│                                │
        │                            │                                │
        │ 6. Validates Verifier      │                                │
        │    Returns Access Token    │                                │
        │    & ID Token (JWT)        │                                │
        │◄───────────────────────────┤                                │
        │                            │                                │
        │ 7. GET /api/v1/protected   │                                │
        │    Header: Bearer <JWT>    │                                │
        ├────────────────────────────────────────────────────────────►│
        │                            │                                │
        │                            │ 8. Validates JWT Signature via │
        │                            │    Cached JWKS Public Key      │
        │                            │                                │
        │ 9. HTTP 200 OK + JSON Data │                                │
        │◄────────────────────────────────────────────────────────────┤
```

---

## 2. JWT Tokens & Claims Structure

JSON Web Tokens (JWT) consist of three base64url-encoded parts separated by dots (`.`): `Header.Payload.Signature`.

```json
// Header
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "gg-key-2026"
}

// Payload (Claims)
{
  "iss": "https://auth.geekgully.local",
  "sub": "usr_9918231a",
  "aud": "gg-cms-api",
  "exp": 1774000000,
  "iat": 1773996400,
  "email": "dev@geekgully.com",
  "roles": ["ADMIN", "AUTHOR"]
}
```

---

## 3. Production Go JWT Verification Middleware

```go
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type ContextKey string
const UserClaimsKey ContextKey = "user_claims"

type CustomClaims struct {
	Email string   `json:"email"`
	Roles []string `json:"roles"`
	jwt.RegisteredClaims
}

// JWTAuthMiddleware validates incoming Authorization Bearer tokens
func JWTAuthMiddleware(jwtSecret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"missing authorization bearer header"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims := &CustomClaims{}

			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return jwtSecret, nil
			})

			if err != nil || !token.Valid {
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
```

---

## 4. Key Security Takeaways

1. **Always Use PKCE for SPA & Mobile Apps**: Public clients cannot securely store client secrets; PKCE prevents authorization code theft.
2. **Validate `iss`, `aud`, and `exp` Claims**: Ensure tokens were issued by your trusted auth server and intended for your specific API.
3. **Keep Access Token Lifespans Short**: Limit access tokens to 15-60 minutes and use refresh tokens for continuous sessions.
