# Building a Secure Login System from Scratch: Lockouts, Session Tokens, and Timing Defenses

## The Problem: The Standard Authentication Surface

Authentication endpoints are the front door of any web application. Because they are publicly exposed, they are targeted by brute-force attacks, credential stuffing campaigns, and side-channel timing analysis. 

Standard login endpoints often contain subtle structural flaws that leak internal system state. For example, if a backend database query returns early when a username does not exist, an attacker can measure the execution time of the HTTP response to map out valid system users—a vulnerability known as a timing oracle. Furthermore, if session tokens are predictable or stored improperly, attackers can hijack user accounts without needing credentials. Building a robust login system demands securing not only the credential check itself, but the entire session lifecycle, rate limiting, and execution time uniformity.

## Architectural Flaw: Timing Oracles and Weak Session Lifecycles

The primary architectural flaw in authentication handlers is failing to enforce uniform execution paths regardless of the request's validity.

```text
Timing Attack Vector:
[ Attack Client ] ---> POST /login (Username: "admin", Password: "...") ---> [ Server ] ---> Reads DB (Exists) ---> Runs Argon2 (Takes 150ms) ---> Returns 401 (152ms total)
[ Attack Client ] ---> POST /login (Username: "fakeuser", Password: "...") ---> [ Server ] ---> Reads DB (Missing) ---> Exits Early! ---> Returns 401 (3ms total)
(Difference of 149ms leaks that "admin" is a valid username)

Timing Defense:
[ Attack Client ] ---> POST /login (Username: "fakeuser", Password: "...") ---> [ Server ] ---> Runs Dummy Hash on Missing (Takes 150ms) ---> Returns 401 (152ms total)
```

Additionally, storing session state in client-side cookies without cryptographically secure signatures, or generating weak, sequential session IDs, allows attackers to forge active sessions.

## Exploit Mechanics: Credential Stuffing and Timing Exploitation

### 1. Timing Oracle Analysis
If the application exits early upon determining a user does not exist, the difference in latency is highly measurable over a few hundred requests. Attackers automate this measurement to enumerate corporate directories, targeting valid usernames with common default passwords.

### 2. Session Token Forgery
If session IDs are derived from predictable values (like a base64 encoded user ID combined with a standard timestamp), attackers can run sequential loops to generate valid tokens and impersonate arbitrary active users.

## Robust Security Implementation

To mitigate these flaws, we must implement an authentication controller that enforces:
1.  **Constant-Time User Processing:** Always executing a cryptographic password verification pass, even if the database lookup fails.
2.  **IP and Username Lockouts (Rate Limiting):** Implementing an in-memory or Redis-backed sliding window filter to block excessive failures.
3.  **Cryptographically Secure Session Generation:** Utilizing `crypto.randomBytes` to generate high-entropy tokens, storing them securely on the backend, and delivering them via hard-configured HTTP cookies.

Below is a production-grade Node.js authentication module illustrating these secure patterns:

```javascript
// AuthController.js
const crypto = require('crypto');
const argon2 = require('argon2'); // Promisified Argon2 interface

// Simulating a fast in-memory store for Session and Rate Limiting
const sessionStore = new Map();
const rateLimitStore = new Map();

// High-entropy, dummy hash to simulate constant execution time
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dGVzdGhhc2g';

class AuthController {

    static checkRateLimit(username, ip) {
        const key = `${username}:${ip}`;
        const attempts = rateLimitStore.get(key) || { count: 0, lastAttempt: 0 };
        const now = Date.now();

        // 15-minute sliding window
        if (now - attempts.lastAttempt > 15 * 60 * 1000) {
            attempts.count = 0;
        }

        if (attempts.count >= 5) {
            return false; // Trigger Lockout
        }

        attempts.count += 1;
        attempts.lastAttempt = now;
        rateLimitStore.set(key, attempts);
        return true;
    }

    static async login(req, res) {
        const { username, password } = req.body;
        const clientIp = req.ip;

        if (!username || !password) {
            return res.status(400).json({ error: 'Missing credentials.' });
        }

        // Apply rate-limiting filter
        const withinLimits = AuthController.checkRateLimit(username, clientIp);
        if (!withinLimits) {
            return res.status(429).json({ error: 'Too many login failures. Account locked for 15 minutes.' });
        }

        try {
            // Mock Database Lookup
            let user = await mockDatabaseGetUser(username);
            let passwordToVerify = password;
            let targetHash = DUMMY_HASH;

            if (user) {
                targetHash = user.passwordHash;
            } else {
                // IMPORTANT: If user is missing, verify the password against DUMMY_HASH.
                // This forces the Argon2id processor to run, ensuring constant-time latency.
                passwordToVerify = "dummy_pass_for_timing_consistency_123";
            }

            // Execute hashing operation (takes ~150ms)
            const isValid = await argon2.verify(targetHash, passwordToVerify);

            // Double security gate: must have actual user record AND correct verification
            if (!user || !isValid) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            // Reset rate limit count upon successful login
            rateLimitStore.delete(`${username}:${clientIp}`);

            // Generate a 256-bit cryptographically secure session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2-hour session expiry

            sessionStore.set(sessionToken, { userId: user.id, username: user.username, expiresAt });

            // Set secure cookie flags
            res.cookie('sid', sessionToken, {
                httpOnly: true,     // Prevents client-side JS from accessing token (mitigates XSS)
                secure: true,       // Enforces transport via HTTPS only
                sameSite: 'strict', // Mitigates CSRF
                maxAge: 2 * 60 * 60 * 1000
            });

            return res.status(200).json({ message: 'Login successful.' });

        } catch (err) {
            return res.status(500).json({ error: 'Internal system error.' });
        }
    }
}

// Dummy Database Mock function
async function mockDatabaseGetUser(username) {
    if (username === 'admin') {
        return {
            id: 'usr_abc123',
            username: 'admin',
            // Pre-computed hash of "S3cure_P@ss_w0rd_99!"
            passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$Z2VuZXJhdGVkc2FsdA$mY0b69Y7fT8g16/8YhG97j8bN5r9T9z4g5h6f7j8k9o'
        };
    }
    return null;
}

module.exports = AuthController;
```

## Hardening Strategies

*   **HTTP Parameter Sanitization:** Ensure strict length boundaries on username and password inputs to prevent buffer overflow or denial of service on Argon2 parsing operations.
*   **Secure Session Validation:** On every authenticated routing endpoint, query the database or cache to verify session token existence and compare the request timestamp against the session's expiration window. Delete expired sessions immediately.

## Conclusion

Building a secure login system requires defensive engineering across multiple fronts. Security engineers must design login endpoints to produce uniform execution times to neutralize timing oracle scans. By executing mock password hashing cycles on non-existent users, wrapping logins in sliding rate-limit pools, and serving cryptographically secure session cookies locked behind strict security flags (`httpOnly`, `secure`, `sameSite`), you establish a robust authentication barrier that resists brute-force, lateral tracking, and takeover exploits.
