---
title: "Building a Secure Login System: Lockouts, Timing Defenses, and Session Issuance"
description: "How to architect a login endpoint that resists user-enumeration timing attacks, credential stuffing, and brute force, while issuing cryptographically bound session cookies."
type: "ARTICLE"
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "authentication"
  - "brute-force"
  - "timing-attacks"
  - "account-lockout"
  - "argon2id"
  - "session-cookies"
---

# Building a Secure Login System: Lockouts, Timing Defenses, and Session Issuance

## The Problem

Authentication portals are the frontline interface exposed to attackers. A high-security login system must defend against:

1. **Timing Attacks (User Enumeration)**: When a login request is made for an existing user, hashing their password takes substantial time (e.g., 200ms using Argon2id). If the user does *not* exist, a lazy application rejects the request immediately (e.g., 5ms). Attackers measure these sub-millisecond response deltas to accurately enumerate valid accounts.
2. **Credential Stuffing and Brute Force**: Automated scripts execute thousands of login attempts against known accounts or common passwords.
3. **Session Hijacking**: Session identifiers that are easily guessed, leaked, or stolen from client storage.

To defeat these vectors, we must construct a unified login pipeline that implements timing-safe fake validations, sliding-window rate limiting, and cryptographically secure cookie-bound session management.

---

## Security Pipeline Architecture

### Unified Authentication Logic

```text
[ Incoming Login Request ]
          │
          ▼
   1. Rate Limiter (Token Bucket / Redis Sliding Window)
          │
          ▼
   2. Fetch User from Database
          │
          ├──► USER EXISTS?
          │         ├──► YES: Hash and verify password with stored hash
          │         └──► NO:  Perform "Dummy Hashing" with constant dummy hash!
          │                       │
          ▼                       ▼
   3. Complete Response (Guarantees constant-time verification path)
          │
          ▼
   4. Set Secure Session Cookie (HttpOnly, Secure, SameSite=Strict)
```

The critical design detail is step 2: **both branches (user exists / user does not exist) must perform an Argon2id verification of comparable cost** before the response is returned. Skipping the hash entirely on the "no such user" branch is what leaks the timing signal in the first place.

---

## Production-Grade Secure Login Controller

Below is a robust Node.js/TypeScript Express controller implementing timing defenses and sliding-window account lockout mechanisms.

```typescript
import { Request, Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';

// Simulated Database interface
interface User {
    id: string;
    username: string;
    passwordHash: string;
    failedAttempts: number;
    lockedUntil: number;
}

export class SecureLoginController {
    // A pre-computed dummy hash of a random string. Matches Argon2id structure.
    private static readonly DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$DUMMY_SALT_STRING$DUMMY_PASSWORD_HASH_VALUE';
    private static readonly LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 Minutes
    private static readonly MAX_FAILED_ATTEMPTS = 5;

    /**
     * Timing-safe, brute-force resistant login handler.
     */
    public static async login(req: Request, res: Response, db: any): Promise<void> {
        const { username, password } = req.body;

        try {
            // 1. Sanitize and retrieve user
            const user: User | null = await db.findUserByUsername(username);

            if (user) {
                // 2. Lockout Verification
                if (user.lockedUntil > Date.now()) {
                    await this.executeConstantTimeDummyHash();
                    res.status(423).json({ error: 'Account is temporarily locked. Try again later.' });
                    return;
                }

                // 3. Authenticate
                const isValid = await argon2.verify(user.passwordHash, password);

                if (isValid) {
                    // Success: Reset failures
                    await db.updateLockoutStatus(user.id, 0, 0);

                    // Generate secure session
                    const sessionToken = crypto.randomBytes(32).toString('hex');
                    await db.createSession(user.id, sessionToken);

                    // 4. Set highly restricted cookies
                    res.cookie('session_id', sessionToken, {
                        httpOnly: true, // Prevents Javascript access (Mitigates XSS extraction)
                        secure: true,   // Transmitted only over HTTPS
                        sameSite: 'strict', // Mitigates Cross-Site Request Forgery (CSRF)
                        path: '/',
                        maxAge: 3600000 // 1 hour
                    });

                    res.status(200).json({ success: true, message: 'Authentication successful.' });
                    return;
                } else {
                    // Password Mismatch: Increment failures
                    const attempts = user.failedAttempts + 1;
                    let lockedUntil = 0;
                    if (attempts >= this.MAX_FAILED_ATTEMPTS) {
                        lockedUntil = Date.now() + this.LOCKOUT_TIME_MS;
                    }
                    await db.updateLockoutStatus(user.id, attempts, lockedUntil);
                }
            } else {
                // If user does NOT exist, execute dummy verification to align timing fingerprints
                await this.executeConstantTimeDummyHash();
            }

            res.status(401).json({ error: 'Invalid credentials provided.' });

        } catch (error) {
            res.status(500).json({ error: 'An unexpected internal error occurred.' });
        }
    }

    /**
     * Executes an identical Argon2id hashing cycle to prevent timing attacks.
     */
    private static async executeConstantTimeDummyHash(): Promise<void> {
        // Compute verification against a dummy hash to keep execution times uniform
        await argon2.verify(this.DUMMY_HASH, "dummy_password_input_to_consume_cpu");
    }
}
```

---

## Architectural Hardening Checklist

1. **IP-Level Rate Limiting**: In addition to account lockouts, use Redis-backed sliding-window rate limiters to restrict IP addresses to a max of 20 login attempts per minute. This blocks brute-force scripts from testing hundreds of accounts from a single host.
2. **MFA Enforcement**: Deploy multi-factor authentication (TOTP or WebAuthn/FIDO2 keys) as a hard barrier to render credential-stuffing automated logins fully useless.
3. **Locked-account response consistency**: The lockout branch (`423`) still runs the dummy hash before responding — otherwise a *locked* account's fast rejection becomes its own timing oracle, re-introducing the enumeration bug the lockout was meant to help prevent.
