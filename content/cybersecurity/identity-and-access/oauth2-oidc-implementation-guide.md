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

## 3. Generating the PKCE Code Verifier & Challenge

The sequence diagram's step 1 ("Generate Code Verifier & Code Challenge") is what actually prevents authorization code interception — it must happen client-side, before the redirect to the authorization server, using a cryptographically random value the client never transmits until the final token exchange.

```go
package pkce

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// GenerateVerifier creates a cryptographically random 43-128 character string,
// kept ONLY in client memory (never sent in the initial redirect).
func GenerateVerifier() (string, error) {
	buf := make([]byte, 32) // 32 random bytes -> 43-char base64url string
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// DeriveChallenge computes the S256 challenge sent in the /oauth/authorize
// redirect — a one-way hash, so intercepting it doesn't reveal the verifier.
func DeriveChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
```

```text
  Why interception alone isn't enough to steal the session:
  ───────────────────────────────────────────────────────────
  1. Client generates verifier (kept in memory) + challenge = SHA256(verifier)
  2. /oauth/authorize?code_challenge=<challenge>  ──► attacker CAN see this
  3. Auth server stores challenge, returns authorization code via redirect
  4. Attacker intercepts the authorization code ──► tries to redeem it
  5. POST /oauth/token (code + code_verifier)  ──► attacker does NOT have
                                                     the verifier (never
                                                     transmitted until now)
  6. Auth server: SHA256(submitted_verifier) != stored_challenge ──► REJECTED
```

---

## 4. Production Go JWT Verification Middleware with JWKS

The header in Section 2 declares `"alg": "RS256"` and a `kid` (key ID) — that means the token is signed with the authorization server's RSA **private** key and must be verified with its corresponding **public** key, fetched from the server's JWKS (JSON Web Key Set) endpoint, not a shared secret. A middleware that checks for `jwt.SigningMethodHMAC` and verifies against a local `[]byte` secret — a mistake that's easy to make by copying an HMAC example — would reject every correctly-signed RS256 token, or worse, be vulnerable to an `alg: none` downgrade if the check is dropped instead of fixed.

```go
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3" // JWKS fetch + cache + auto-refresh on kid miss
	"github.com/golang-jwt/jwt/v5"
)

type ContextKey string
const UserClaimsKey ContextKey = "user_claims"

type CustomClaims struct {
	Email string   `json:"email"`
	Roles []string `json:"roles"`
	jwt.RegisteredClaims
}

// NewJWKSKeyfunc fetches the authorization server's public keys once at
// startup and caches them in memory, refreshing automatically when a
// token references a "kid" not yet in the cache (key rotation).
func NewJWKSKeyfunc(jwksURL string) (jwt.Keyfunc, error) {
	k, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS from %s: %w", jwksURL, err)
	}
	return k.Keyfunc, nil
}

// JWTAuthMiddleware validates incoming Authorization Bearer tokens against
// the cached JWKS public keys — never against a locally-held secret.
func JWTAuthMiddleware(keyfunc jwt.Keyfunc, issuer, audience string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, `{"error":"missing authorization bearer header"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims := &CustomClaims{}

			token, err := jwt.ParseWithClaims(tokenStr, claims, keyfunc,
				jwt.WithValidMethods([]string{"RS256"}), // reject alg:none & HMAC confusion attacks outright
				jwt.WithIssuer(issuer),
				jwt.WithAudience(audience),
			)

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

`jwt.WithValidMethods([]string{"RS256"})` is the line that closes the algorithm-confusion hole: without it, a library that blindly trusts the token's own `alg` header can be tricked into verifying an attacker-forged HMAC token using the server's **public** RSA key (which is, by definition, publicly known) as the HMAC secret — pinning the expected algorithm server-side removes the attacker's ability to choose it.

---

## 5. The Scenario: A Stolen Refresh Token Outlives the Session That Issued It

### Why Short Access Tokens Aren't Enough on Their Own

Section 4's Key Takeaways (in the original guide) already recommend short-lived access tokens — but a refresh token, by design, lives much longer (days to weeks) so users aren't forced to re-authenticate constantly. If a refresh token is exfiltrated (XSS, a compromised device, a logged request) and reused by an attacker, a short access-token lifespan only limits the blast radius of any *single* stolen access token — it does nothing to stop the attacker from minting fresh ones indefinitely with the stolen refresh token.

```text
  Refresh Token Rotation with reuse detection:
  ─────────────────────────────────────────────────────────────
  Legitimate client:  refresh_token_A ──► new access_token +
                                            refresh_token_B (A is now REVOKED)
                       refresh_token_B ──► new access_token +
                                            refresh_token_C (B is now REVOKED)

  Attacker steals refresh_token_A (already used, but attacker doesn't know that):
                       refresh_token_A ──► Auth server sees A was ALREADY
                                            redeemed once before ──► REUSE
                                            DETECTED ──► entire token FAMILY
                                            (A, B, C, ...) revoked immediately,
                                            legitimate user forced to re-login
```

Each refresh token is single-use: redeeming it issues a new access token AND a new refresh token, immediately invalidating the one just used. If the *same* refresh token is ever presented a second time, the authorization server knows with certainty that either the legitimate client or an attacker has a copy it shouldn't — and since it can't tell which, the only safe response is to revoke the whole chain and force fresh authentication.

💡 **Interactive Takeaway**: Short access-token lifespans and refresh token rotation solve different problems — one limits how long a single stolen credential remains useful, the other detects theft of the longer-lived credential that mints those short-lived ones. Neither is a substitute for the other; production systems need both.

---

## 6. Key Security Takeaways

1. **Always Use PKCE for SPA & Mobile Apps**: Public clients cannot securely store client secrets; the code verifier/challenge pair prevents a stolen authorization code from being redeemed by anyone but the client that started the flow.
2. **Verify RS256 Tokens Against Cached JWKS, Never a Shared Secret**: A `kid` in the header means the server signs with a private key and expects verification against the matching public key fetched from its JWKS endpoint.
3. **Pin the Expected Signing Algorithm Server-Side**: Use `jwt.WithValidMethods(...)` to reject algorithm-confusion attacks that try to trick the verifier into treating a public RSA key as an HMAC secret.
4. **Validate `iss`, `aud`, and `exp` Claims**: Ensure tokens were issued by your trusted auth server and intended for your specific API.
5. **Keep Access Token Lifespans Short, and Rotate Refresh Tokens With Reuse Detection**: Short-lived access tokens limit exposure from a single stolen token; single-use refresh token rotation lets the server detect theft of the longer-lived credential and revoke the entire token family.
