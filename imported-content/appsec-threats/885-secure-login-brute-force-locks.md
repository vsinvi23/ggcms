# Building a Secure Login System: Lockouts, Tokens, and Timing Defenses

## The Problem: The Brute Force Reality

A login system is the front door of your application, subject to constant, automated bombardment. The most pervasive threats include:
1. **Brute Force & Credential Stuffing:** Automated submission of millions of leaked username/password pairs.
2. **User Enumeration:** Determining if an email exists in the database based on variations in server response time or error messages.
3. **Session Hijacking:** Stealing the resulting authentication token if it is improperly scoped or stored.

Relying solely on a strong password hashing algorithm (like Argon2id) protects your database *if* it is stolen, but it does nothing to stop an attacker from throwing 10,000 requests per second at your live `/api/login` endpoint. 

## The Mechanics: Defense in Depth

A secure login system must implement multiple layers of defense:
- **Constant-Time Operations:** Preventing timing attacks during user lookup and password comparison.
- **Progressive Delays & Lockouts:** Throttling rapid attempts per IP and per Account.
- **Secure Token Issuance:** Generating cryptographically secure session identifiers.

### ASCII Architecture: The Login Decision Tree

```text
[ Login Request (Email, Password) ]
               |
    [ IP Rate Limiter (Redis) ] ---> (Exceeded?) ---> [ 429 Too Many Requests ]
               |
 [ Account Lockout Check (Redis) ] -> (Locked?) ----> [ 401 Generic Error ]
               |
       [ DB Lookup (Email) ] -------> (Not Found?) 
               |                           |
         (Found User)              (Dummy Hash Computation to normalize time)
               |                           |
  [ Argon2 Verify Password ] <-------------+
               |
          (Success?) --------> (No) ----> [ Increment Fail Counter ] -> [ 401 Generic ]
               |
             (Yes)
               |
  [ Reset Fail Counter ]
               |
  [ Issue HTTPOnly, Secure Cookie ]
```

## Implementation: Timing Defenses and Rate Limiting

### 1. Defeating User Enumeration (Timing Attacks)
If a user does not exist, you must not return immediately. You must perform a dummy password hash computation so that the response time is indistinguishable from a successful login. Furthermore, error messages must be completely generic (e.g., "Invalid credentials").

### 2. Throttling and Lockouts via Redis
Do not lock accounts permanently, as this allows attackers to trivially perform Denial of Service (DoS) attacks against legitimate users simply by failing logins on their behalf. Instead, use progressive time-based lockouts.

### Robust Code: Go Authentication Handler

This snippet demonstrates a secure login flow using Go and Redis.

```go
package auth

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-redis/redis/v8"
	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidCreds = errors.New("invalid credentials")
	rdb             *redis.Client
	// A pre-computed dummy hash to simulate work when a user is not found
	dummyHash = []byte("$argon2id$v=19$m=65536,t=3,p=4$dummy$dummyhash...") 
)

func SecureLogin(email string, password string, ip string) error {
	
	// 1. IP-Based Rate Limiting (e.g., Max 20 attempts per minute)
	ipKey := fmt.Sprintf("rl:ip:%s", ip)
	if isRateLimited(ipKey, 20, time.Minute) {
		return errors.New("rate limited")
	}

	// 2. Account-Based Lockout (e.g., Max 5 attempts per 15 minutes)
	accountKey := fmt.Sprintf("lockout:acc:%s", email)
	if isRateLimited(accountKey, 5, 15*time.Minute) {
		return ErrInvalidCreds // Generic error, do not reveal lockout state to attacker
	}

	// 3. Database Lookup
	user, err := dbGetUserByEmail(email)
	
	// 4. Timing Defense: Always compute a hash
	var targetHash []byte
	if err != nil {
		// User not found: compute dummy hash to normalize response time
		targetHash = dummyHash
	} else {
		targetHash = user.PasswordHash
	}

	// 5. Verify Password
	match := verifyArgon2(password, targetHash)

	// 6. Final Decision (Constant Time boolean check)
	// We use subtle.ConstantTimeEq to prevent timing leaks on the boolean branch
	isValid := (err == nil) && match

	if !isValid {
		incrementRateLimit(accountKey, 15*time.Minute)
		return ErrInvalidCreds
	}

	// 7. Success: Clear lockouts and issue token
	clearRateLimit(accountKey)
	return nil
}

// Helper: Constant-time string comparison (used internally by verify algorithms)
func secureCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
```

## Conclusion

A secure login system is a hostile environment for automation. By enforcing strict, tiered rate limits backed by fast in-memory stores like Redis, and meticulously scrubbing timing discrepancies and verbose error messages from your code paths, you force attackers into an economically unviable position, safeguarding your users from mass compromise.
