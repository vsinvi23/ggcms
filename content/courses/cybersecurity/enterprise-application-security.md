---
title: "Enterprise Application Security Engineering"
description: "Master zero-trust security architecture, OWASP Web Top 10 mitigation, OAuth2/OIDC identity management, API rate-limiting, and microservice mTLS."
type: "COURSE"
categorySlug: "appsec-threats"
courseType: "TRACK"
tags:
  - "owasp-top-10"
  - "threat-modeling"
  - "zero-trust-architecture"
  - "identity-access"
---

Welcome to **Enterprise Application Security Engineering**! In this comprehensive track, you will learn to defend cloud-native web applications and microservice architectures against modern cyber threats.

---

## Section: Section 1: OWASP Web Top 10 & Threat Modeling

### Lesson: Lesson 1.1: Injection Defense & Prepared Statements
**The Scenario:** A legacy SQL query constructs database statements via string concatenation, leaving the endpoint vulnerable to SQL Injection (`' OR '1'='1`).

**The Fix: Parameterized Database Queries in Go:**
```go
// Secure parameterized SQL query
stmt := "SELECT id, email, role FROM users WHERE username = $1 AND status = $2"
row := db.QueryRow(ctx, stmt, username, "ACTIVE")
```

---

### Lesson: Lesson 1.2: Broken Access Control & ABAC Security Patterns
Ensure API endpoints enforce Attribute-Based Access Control (ABAC) to prevent Insecure Direct Object References (IDOR).

```go
func CanUserAccessDocument(userID string, docUserID string, userRole string) bool {
	if userRole == "ADMIN" {
		return true
	}
	return userID == docUserID
}
```

---

### Lesson: Lesson 1.3: API Rate-Limiting Against Brute Force & Credential Stuffing

**The Scenario:** Your login endpoint has no rate limit. An attacker with a list of ten million leaked username/password pairs from an unrelated breach runs a credential-stuffing script against it overnight — no single request looks abnormal, but the aggregate volume is thousands of login attempts per minute from a rotating pool of IPs. By morning, dozens of accounts that reused a leaked password are compromised.

**The Fix: A Token-Bucket Rate Limiter Keyed by Identity, Not Just IP**

Limiting by IP alone is easy to defeat with a botnet; combining an IP limit with a per-account limit catches both a single attacker hammering one IP and a distributed attack spread across many IPs targeting one account.

```go
package ratelimit

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// SlidingWindowLimiter enforces a max request count per key within a time window,
// backed by Redis so the limit is shared correctly across every backend replica.
type SlidingWindowLimiter struct {
	redis  *redis.Client
	limit  int
	window time.Duration
}

func NewSlidingWindowLimiter(rdb *redis.Client, limit int, window time.Duration) *SlidingWindowLimiter {
	return &SlidingWindowLimiter{redis: rdb, limit: limit, window: window}
}

// Allow returns false once `key` has been called `limit` times within `window`.
func (l *SlidingWindowLimiter) Allow(ctx context.Context, key string) (bool, error) {
	pipe := l.redis.TxPipeline()
	count := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, l.window)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, err
	}
	return count.Val() <= int64(l.limit), nil
}

func LoginRateLimitMiddleware(ipLimiter, accountLimiter *SlidingWindowLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		username := c.PostForm("username")

		ipOK, _ := ipLimiter.Allow(c.Request.Context(), "ratelimit:ip:"+ip)
		acctOK, _ := accountLimiter.Allow(c.Request.Context(), "ratelimit:acct:"+username)

		if !ipOK || !acctOK {
			c.AbortWithStatusJSON(429, gin.H{"error": "too many login attempts, try again later"})
			return
		}
		c.Next()
	}
}
```

```text
  Login request
       │
       ▼
 ┌─────────────────┐     over limit     ┌─────────────────────┐
 │ IP rate limit     │ ──────────────► │ 429 Too Many Requests │
 │ (e.g. 20/min)     │                  └─────────────────────┘
 └────────┬─────────┘
          │ under limit
          ▼
 ┌─────────────────┐     over limit     ┌─────────────────────┐
 │ Account rate      │ ──────────────► │ 429 Too Many Requests │
 │ limit (e.g. 5/min)│                  └─────────────────────┘
 └────────┬─────────┘
          │ under limit
          ▼
   Login handler proceeds
```

💡 **Interactive Takeaway**: Rate-limiting state must live somewhere shared (Redis here) rather than in-process memory — an in-memory counter only protects the single replica it runs on, so a load-balanced service with 10 pods would effectively allow 10x the intended limit.

---

## Section: Section 2: Identity Management & Modern Cryptography

### Lesson: Lesson 2.1: OAuth2 Authorization Code Flow with PKCE

**The Scenario:** Your single-page app stores an OAuth client secret in its JavaScript bundle so it can complete the authorization code exchange. Anyone who opens browser dev tools can read that "secret" directly out of the bundle — it was never actually secret. Worse, if a malicious app on the same device intercepts the authorization code redirect (a real risk on mobile deep links), it can exchange that code for tokens itself.

**PKCE (Proof Key for Code Exchange)** removes the need for a client secret entirely, and binds the authorization code to the specific client that initiated the flow:

```go
package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// GeneratePKCEPair creates a code_verifier (kept client-side, never transmitted
// until the final token exchange) and its code_challenge (sent in the initial
// authorization request).
func GeneratePKCEPair() (verifier, challenge string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", err
	}
	verifier = base64.RawURLEncoding.EncodeToString(raw)

	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge, nil
}

// BuildAuthorizationURL constructs the redirect URL the SPA sends the user's
// browser to. Note: no client_secret anywhere in this flow.
func BuildAuthorizationURL(authEndpoint, clientID, redirectURI, state, codeChallenge string) string {
	return authEndpoint +
		"?response_type=code" +
		"&client_id=" + clientID +
		"&redirect_uri=" + redirectURI +
		"&state=" + state +
		"&code_challenge=" + codeChallenge +
		"&code_challenge_method=S256"
}
```

```text
  SPA generates (verifier, challenge)
       │
       ▼
  Redirect to /authorize?code_challenge=<challenge>&...
       │
       ▼
  User authenticates at Identity Provider
       │
       ▼
  IdP redirects back with ?code=AUTH_CODE
       │
       ▼
  SPA calls POST /token with { code: AUTH_CODE, code_verifier: <verifier> }
       │
       ▼
  Auth server: SHA256(code_verifier) == stored code_challenge?
       │  yes                              │  no
       ▼                                   ▼
  Issues access_token + id_token      Rejects — code_verifier
                                       doesn't match the challenge
                                       sent at authorization time
```

Even if an attacker intercepts the authorization `code` from the redirect, they cannot exchange it for a token without also knowing the `code_verifier` — which never leaves the legitimate client that generated it.

💡 **Interactive Takeaway**: PKCE isn't just "more secure OAuth" — it's what makes OAuth safe for **public clients** (SPAs, mobile apps) that structurally cannot keep a secret, which is why it's now mandatory in the OAuth 2.1 draft specification for every client type, not just public ones.

### Lesson: Lesson 2.2: Mutual TLS (mTLS) for Internal Microservices

**The Scenario:** Your internal microservices communicate over plain HTTP inside the Kubernetes cluster, trusting that "it's a private network" is protection enough. A compromised pod (from an unrelated vulnerable dependency) on the same cluster can now call any internal service's API directly — there's no verification that the caller is who it claims to be, because nothing ever checks.

**mTLS** flips TLS around: not only does the client verify the server's certificate (standard TLS), the server also verifies the client's certificate — both sides must present a certificate signed by a trusted internal CA before any data is exchanged.

```go
package mtls

import (
	"crypto/tls"
	"crypto/x509"
	"net/http"
	"os"
)

// NewMTLSServer builds an http.Server that REQUIRES and verifies a client
// certificate signed by our internal CA before accepting any request.
func NewMTLSServer(certFile, keyFile, caFile, addr string, handler http.Handler) (*http.Server, error) {
	serverCert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}

	caCert, err := os.ReadFile(caFile)
	if err != nil {
		return nil, err
	}
	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caCert)

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientCAs:    caPool,
		ClientAuth:   tls.RequireAndVerifyClientCert, // reject any connection without a valid client cert
		MinVersion:   tls.VersionTLS13,
	}

	return &http.Server{
		Addr:      addr,
		Handler:   handler,
		TLSConfig: tlsConfig,
	}, nil
}

// NewMTLSClient builds an http.Client that presents ITS OWN certificate when
// calling another internal service, so that service can verify who's calling.
func NewMTLSClient(clientCertFile, clientKeyFile, caFile string) (*http.Client, error) {
	clientCert, err := tls.LoadX509KeyPair(clientCertFile, clientKeyFile)
	if err != nil {
		return nil, err
	}
	caCert, err := os.ReadFile(caFile)
	if err != nil {
		return nil, err
	}
	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caCert)

	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				Certificates: []tls.Certificate{clientCert},
				RootCAs:      caPool,
				MinVersion:   tls.VersionTLS13,
			},
		},
	}, nil
}
```

```text
  order-service                              inventory-service
       │                                             │
       │── TLS ClientHello ─────────────────────────►│
       │                                             │
       │◄── ServerHello + server cert ────────────────│  order-service verifies
       │                                             │  inventory-service's cert
       │── client cert (signed by internal CA) ──────►│  inventory-service verifies
       │                                             │  order-service's cert too
       │                                             │  (ClientAuth: RequireAndVerify)
       │◄──────── encrypted, mutually-authenticated ─►│
       │              connection established          │
```

If the compromised pod from the scenario above doesn't possess a valid client certificate signed by the internal CA, `RequireAndVerifyClientCert` rejects the TLS handshake before the request ever reaches application code — the compromise is contained at the network layer, not left to application-level auth checks that a bug could bypass.

💡 **Interactive Takeaway**: mTLS and OAuth2/OIDC solve different problems and are often used together: OAuth2 authenticates a **human user or application** to a service at the API layer, while mTLS authenticates **which service** is making a call at the transport layer — a zero-trust architecture typically needs both, not one instead of the other.

### Lesson: Lesson 2.3: Knowledge Check — Identity & Cryptography

**Lesson type**: quiz

**Question 1**: Why does PKCE remove the need for a client secret in the OAuth2 authorization code flow?

A) PKCE encrypts the client secret instead of removing it
B) The code_verifier, generated fresh per authorization request and never transmitted until the final token exchange, proves the token request comes from the same client that started the flow — without needing a long-lived secret a public client can't safely store
C) PKCE only works with confidential clients that already have a secret
D) It doesn't remove the need for a secret, only obscures it

**Correct answer: B.** The verifier/challenge pair binds a specific authorization flow to a specific client instance dynamically, which is exactly what a static secret would have tried (and failed) to do for a public client like a browser SPA.

**Question 2**: What specifically does `tls.RequireAndVerifyClientCert` add compared to standard one-way TLS?

A) It enables faster encryption
B) It requires the CLIENT to also present a certificate that the server verifies against a trusted CA — standard TLS only verifies the server's identity to the client, not the reverse
C) It disables encryption for internal traffic to improve speed
D) It's a GCP-specific setting with no equivalent elsewhere

**Correct answer: B.** Standard TLS is one-directional trust (client verifies server). mTLS makes it bidirectional — the server also verifies the client — which is what allows a service to reject connections from callers that aren't part of the trusted internal mesh, even on a "private" network.

**Question 3**: In the rate-limiting example, why key the limiter on BOTH IP address and account/username rather than IP alone?

A) It's redundant and provides no additional protection
B) An IP-only limit is defeated by a distributed botnet spreading requests across many IPs at one account; an account-only limit is defeated by one attacker script targeting many accounts from one IP — combining both catches both attack shapes
C) Account-based limiting is illegal under GDPR
D) IP-based limiting doesn't work with Redis

**Correct answer: B.** Credential stuffing and brute-force attacks come in different shapes (many IPs → one account, or one IP → many accounts); a limiter that only tracks one dimension leaves the other attack shape completely unmitigated.
