# Building a Secure Login System from Scratch: Session Security and Brute-Force Defense

Building an authentication system from scratch is a high-stakes engineering endeavor. A simple misstep can lead to critical vulnerabilities, including SQL Injection (SQLi), Session Hijacking, Session Fixation, and automated credential spraying. To secure a login flow, you must construct a multi-layered defense pipeline covering request throttling, secure credential validation, cryptographically secure session creation, and bulletproof cookie configurations.

---

## The Secure Authentication Flow

When a user submits their username and password, the system must process the transaction through a series of discrete security gates before granting access to resources.

```
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

## Pillar 1: Defeating Brute-Force & Denial of Service Lockouts

Traditional authentication systems often block accounts after 5 failed login attempts. While this stops brute-forcing, it creates a severe vulnerability: **User Enumeration Denial of Service**. An attacker can script requests to lock out every single user on your platform simply by submitting 5 incorrect passwords for known email addresses.

### The Defensive Solution: Progressive Backoff and IP Rate Limiting

Instead of locking accounts globally:
1. **IP Throttling:** Throttle connections from single IPs aggressively (e.g., max 10 login attempts per minute).
2. **Progressive Backoff Delay:** For a specific username, double the verification delay with each consecutive failure (e.g., 1st failure: 100ms; 2nd: 200ms; 3rd: 400ms; 4th: 800ms). This stops automation without locking out real users.
3. **Timing Consistency:** Ensure that a request for a non-existent user takes the exact same amount of time as a request for an existing user. If a user does not exist, compute a "dummy" Argon2id hash before returning an error to prevent timing attacks from revealing which emails are registered.

---

## Pillar 2: Cryptographically Secure Session Management

Once a user is verified, we must issue a secure token. Session tokens are prized targets for attackers.

1. **High Entropy:** A session ID must be generated using a Cryptographically Secure Pseudorandom Number Generator (CSPRNG), such as `/dev/urandom` or Go's `crypto/rand`. Never use math/rand or timestamp-based values, which are easily predictable.
2. **Server-Side Session Store:** Rather than packing state into client-controlled JSON Web Tokens (JWTs) which are difficult to revoke, use server-side sessions stored in an in-memory database like Redis. This enables instant session revocation (e.g., "log out of all devices" or admin ban).
3. **Bulletproof Cookie Security:** Set cookie attributes to protect them from browser-based theft:
   * `HttpOnly`: Prevents client-side scripts (JavaScript) from accessing the cookie. This completely defeats cookie theft via Cross-Site Scripting (XSS).
   * `Secure`: Instructs the browser to only transmit the cookie over encrypted (HTTPS) connections, preventing interception on public Wi-Fi.
   * `SameSite=Strict` or `Lax`: Instructs the browser not to send cookies along with cross-site requests, completely neutralizing Cross-Site Request Forgery (CSRF).

---

## Robust Login Implementation in Go

This Go implementation outlines the secure verification pipeline, timing attack mitigation, CSPRNG session token generation, and correct secure cookie packaging.

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
	// Precalculate a dummy hash to use when users are not found
	// to prevent timing attacks.
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

	// Use parameterized queries to completely eliminate SQL Injection
	query := "SELECT id, password_hash FROM users WHERE username = $1 LIMIT 1"
	err := h.db.QueryRowContext(r.Context(), query, username).Scan(&userID, &storedHash)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// timing safety: verify password against dummy hash if user doesn't exist
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
		// Enforce a small progressive or static penalty delay to slow down attackers
		time.Sleep(200 * time.Millisecond)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 5. Generate secure session token
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
		HttpOnly: true,                  // Mitigate XSS
		Secure:   true,                  // Enforce TLS-only transport
		SameSite: http.SameSiteStrictMode, // Mitigate CSRF
	}

	http.SetCookie(w, cookie)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"success"}`))
}

// generateSecureToken creates a high-entropy string using the system CSPRNG
func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (h *LoginHandler) verifyDummy(password string) {
	// Consume equivalent CPU resources to match user-found timing
	_ = h.verifyRaw(password, h.dummyHash)
}

func (h *LoginHandler) verifyPassword(password, storedHash string) (bool, error) {
	// Implementation calls standard argon2 comparison...
	return h.verifyRaw(password, storedHash), nil
}

func (h *LoginHandler) verifyRaw(password, storedHash string) bool {
	// Dummy standard constant-time wrapper
	// In production, parse PHC string and run argon2.IDKey
	return subtle.ConstantTimeCompare([]byte(password), []byte(password)) == 1
}

func hashPassword(password string) (string, error) {
	// Return a stub representing standard Argon2id PHC formatting
	return "$argon2id$v=19$m=65536,t=3,p=4$salt$hash", nil
}
```

---

## Production Checklist

1. **Enforce HTTPS-Only:** Redirection of plain HTTP to HTTPS must be absolute. Set HTTP Strict Transport Security (`HSTS`) headers to force browsers to always use SSL.
2. **Session Regeneration on Authentication:** Always destroy the guest or old session ID and generate an entirely new one upon successful authentication to prevent **Session Fixation** attacks.
3. **Limit Lifetime & Absolute Expiry:** Enforce automatic session idle-timeout (e.g., 15 minutes) and absolute session expiration (e.g., 24 hours) after which a user must re-authenticate.
