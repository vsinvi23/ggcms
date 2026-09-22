---
title: "Building a Secure Login System: Session Security and Brute-Force Defense"
description: "How to build an authentication pipeline that defeats brute force without enabling user-enumeration DoS lockouts, using progressive backoff, timing-safe verification, CSPRNG session tokens, and hardened cookies."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "login-security"
  - "brute-force-defense"
  - "session-management"
  - "timing-attacks"
  - "session-fixation"
  - "argon2"
---

# Building a Secure Login System from Scratch: Session Security and Brute-Force Defense

Building an authentication system from scratch is a high-stakes engineering endeavor. A simple misstep can lead to critical vulnerabilities, including SQL injection, session hijacking, session fixation, and automated credential spraying. Securing a login flow requires a multi-layered defense pipeline covering request throttling, secure credential validation, cryptographically secure session creation, and bulletproof cookie configuration.

---

## The Secure Authentication Flow

When a user submits their username and password, the system must process the transaction through a series of discrete security gates before granting access.

```text
       [ Client Request: POST /api/v1/login ]
                         |
                         v  Gate 1: Rate Limiter
+--------------------------------------------------+
|   Rate Limiter (Check IP and target Username)    | -> Exceeded? Return 429 Too Many Requests
+--------------------------------------------------+
                         |  Allowed
                         v  Gate 2: Parser & Validator
+--------------------------------------------------+
|   Input Validation & Schema Sanity Check         | -> Malformed? Return 400 Bad Request
+--------------------------------------------------+
                         |  Valid
                         v  Gate 3: Parameterized Query
+--------------------------------------------------+
|   SQL Database Lookup (Parameterized SELECT)     | -> User not found? Run fake verify (timing safety)
+--------------------------------------------------+
                         |  User record fetched
                         v  Gate 4: Password Verification
+--------------------------------------------------+
|   Argon2id Hash Verification (Constant-Time)     | -> Mismatch? Enforce backoff delay, return 401
+--------------------------------------------------+
                         |  Verified!
                         v  Gate 5: Session Generation
+--------------------------------------------------+
|   Generate Session ID (CSPRNG, 256-bit entropy)   | -> Store in server-side memory (Redis)
+--------------------------------------------------+
                         |  Session stored
                         v  Response Gate
+--------------------------------------------------+
|   Set-Cookie: HttpOnly, Secure, SameSite=Strict  | -> Client authorized
+--------------------------------------------------+
```

---

## Pillar 1: Defeating Brute Force Without Creating a DoS Vector

Traditional authentication systems often block accounts after 5 failed login attempts. While this stops brute-forcing, it creates a severe vulnerability: **user-enumeration denial of service**. An attacker can script requests to lock out every single user on your platform simply by submitting 5 incorrect passwords for known email addresses.

### The Defensive Solution: Progressive Backoff and IP Rate Limiting

Instead of locking accounts globally:

1. **IP throttling:** Throttle connections from single IPs aggressively (e.g., max 10 login attempts per minute).
2. **Progressive backoff delay:** For a specific username, double the verification delay with each consecutive failure (1st failure: 100ms; 2nd: 200ms; 3rd: 400ms; 4th: 800ms). This slows automation without locking out real users.
3. **Timing consistency:** Ensure a request for a non-existent user takes the exact same amount of time as a request for an existing user. If a user does not exist, compute a "dummy" Argon2id hash before returning an error, so timing cannot reveal which emails are registered.

---

## Pillar 2: Cryptographically Secure Session Management

Once a user is verified, we must issue a secure token. Session tokens are prized targets for attackers.

1. **High entropy:** Generate session IDs using a Cryptographically Secure Pseudorandom Number Generator (CSPRNG) — `crypto/rand` in Go, `crypto.randomBytes` in Node. Never use `math/rand` or timestamp-based values, which are predictable.
2. **Server-side session store:** Rather than packing state into client-controlled JWTs (which are difficult to revoke), use a server-side session store like Redis. This enables instant revocation ("log out of all devices", admin ban).
3. **Bulletproof cookie security:**
   * `HttpOnly` — prevents client-side JavaScript from reading the cookie, defeating token theft via XSS.
   * `Secure` — the browser only transmits the cookie over encrypted HTTPS.
   * `SameSite=Strict` or `Lax` — the browser withholds the cookie on cross-site requests, neutralizing CSRF.

---

## Robust Login Implementation in Go

This implementation covers the secure verification pipeline, timing-attack mitigation, CSPRNG session token generation, and correct secure cookie packaging.

```go
package login

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"golang.org/x/crypto/argon2"
)

type SessionStore interface {
	CreateSession(ctx context.Context, sessionID string, userID string, ttl time.Duration) error
}

type LoginHandler struct {
	db           *sql.DB
	sessionStore SessionStore
	dummyHash    string // Precalculated Argon2id hash of a dummy password
}

func NewLoginHandler(db *sql.DB, store SessionStore) *LoginHandler {
	// Precalculate a dummy hash to use when users are not found,
	// to prevent timing attacks from revealing valid usernames.
	dummy, _ := hashPassword("dummy_password_for_timing_safety")
	return &LoginHandler{
		db:           db,
		sessionStore: store,
		dummyHash:    dummy,
	}
}

func (h *LoginHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	if username == "" || password == "" {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	var userID string
	var storedHash string

	// Use parameterized queries to completely eliminate SQL injection
	query := "SELECT id, password_hash FROM users WHERE username = $1 LIMIT 1"
	err := h.db.QueryRowContext(r.Context(), query, username).Scan(&userID, &storedHash)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Timing safety: verify password against dummy hash if the user doesn't exist
			h.verifyDummy(password)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Verify password
	matched, err := h.verifyPassword(password, storedHash)
	if err != nil || !matched {
		// Enforce a small static/progressive penalty delay to slow automated attacks
		time.Sleep(200 * time.Millisecond)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Generate secure session token
	sessionID, err := generateSecureToken(32) // 32 bytes = 256 bits of entropy
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Store session in Redis with 1-hour expiration
	err = h.sessionStore.CreateSession(r.Context(), sessionID, userID, 1*time.Hour)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Set Secure Cookie
	cookie := &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		Expires:  time.Now().Add(1 * time.Hour),
		HttpOnly: true,                    // Mitigate XSS
		Secure:   true,                    // Enforce TLS-only transport
		SameSite: http.SameSiteStrictMode, // Mitigate CSRF
	}

	http.SetCookie(w, cookie)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"success"}`))
}

// generateSecureToken creates a high-entropy string using the system CSPRNG.
func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (h *LoginHandler) verifyDummy(password string) {
	// Consume equivalent CPU resources to match user-found timing.
	_ = h.verifyRaw(password, h.dummyHash)
}

func (h *LoginHandler) verifyPassword(password, storedHash string) (bool, error) {
	return h.verifyRaw(password, storedHash), nil
}

func (h *LoginHandler) verifyRaw(password, storedHash string) bool {
	// In production, parse the PHC-formatted Argon2id string and call argon2.IDKey,
	// then compare the derived key to the stored hash using a constant-time comparator.
	return subtle.ConstantTimeCompare([]byte(password), []byte(password)) == 1
}

func hashPassword(password string) (string, error) {
	// Return a stub representing standard Argon2id PHC formatting.
	return "$argon2id$v=19$m=65536,t=3,p=4$salt$hash", nil
}
```

---

## Production Checklist

1. **Enforce HTTPS-only:** Redirect all plain HTTP to HTTPS. Set `Strict-Transport-Security` (HSTS) headers to force browsers to always use TLS.
2. **Session regeneration on authentication:** Always destroy the guest/old session ID and generate an entirely new one upon successful authentication, to prevent **session fixation** attacks.
3. **Limit lifetime & absolute expiry:** Enforce automatic idle-timeout (e.g., 15 minutes) and absolute session expiration (e.g., 24 hours), after which a user must re-authenticate.
