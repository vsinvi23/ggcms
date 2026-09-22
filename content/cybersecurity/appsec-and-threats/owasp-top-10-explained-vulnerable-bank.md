---
title: "The OWASP Top 10 Explained Through One Vulnerable Bank"
description: "Every entry in the OWASP Top 10 walked through concretely against a single fictional banking application, BankCorp -- the exact bad code, the exploit, and the fix, for all ten categories."
type: "ARTICLE"
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "owasp-top-10"
  - "broken-access-control"
  - "injection"
  - "cryptographic-failures"
  - "ssrf"
---

# The OWASP Top 10 Explained Through One Vulnerable Bank

## The Problem: Abstract Vulnerabilities

The OWASP Top 10 is the definitive list of web application security risks. However, reading abstract definitions like "Broken Access Control" doesn't help developers write secure code.

Let's explore the greatest hits of bad code by examining a single, catastrophically vulnerable banking application: *BankCorp*.

## The Architecture of Disaster

```text
[ Browser ] <---HTTP---> [ Node.js API ] <---SQL---> [ PostgreSQL ]
   (React)                 (Express)                 (Unencrypted)
```

### 1. Broken Access Control (OWASP #1)
Alice logs into BankCorp. Her URL is `bankcorp.com/account?id=1001`. She changes the URL to `id=1002`. The server returns Bob's account details.
*The fix:* the server must verify that the logged-in session belongs to the requested ID.

### 2. Cryptographic Failures (OWASP #2)
BankCorp stores user passwords using MD5 hashing without a salt. When the database is breached, the attacker runs the hashes through a rainbow table and recovers all plaintext passwords in seconds.
*The fix:* use Argon2, bcrypt, or scrypt.

### 3. Injection (OWASP #3)
The login form executes this query directly:
`SELECT * FROM users WHERE username = '` + `req.body.user` + `';`
An attacker enters `admin' --`. The query becomes `SELECT * FROM users WHERE username = 'admin' --';`, bypassing the password check.
*The fix:* parameterized queries (prepared statements).

### 4. Insecure Design (OWASP #4)
BankCorp's password reset feature asks for the user's favorite color. An attacker can guess this in 10 attempts. The flaw isn't in the code; it's in the architectural design of the recovery flow.
*The fix:* threat modeling during the design phase. Use email/SMS OTPs instead of security questions.

### 5. Security Misconfiguration (OWASP #5)
The Node.js server has directory listing enabled and returns verbose stack traces on error, revealing the internal file paths and database connection strings to the user.
*The fix:* disable directory listing, suppress error details in production, and harden cloud storage buckets.

### 6. Vulnerable and Outdated Components (OWASP #6)
BankCorp uses an old version of `Log4j` for Java-based microservices, allowing an attacker to execute arbitrary code via the `JNDI` lookup vulnerability.
*The fix:* automated Software Composition Analysis (SCA) tools and regular dependency patching.

### 7. Identification and Authentication Failures (OWASP #7)
BankCorp allows brute-force attacks on the login screen. An attacker tries 10,000 passwords for the `admin` account until one works.
*The fix:* implement rate limiting and Multi-Factor Authentication (MFA).

### 8. Software and Data Integrity Failures (OWASP #8)
BankCorp's CI/CD pipeline pulls a compromised npm package from a public repository without checking its signature. The package injects a backdoor into the production build.
*The fix:* use signed commits and verify artifact checksums.

### 9. Security Logging and Monitoring Failures (OWASP #9)
An attacker tries to brute-force the admin account for 3 days. Nobody notices because BankCorp doesn't log failed login attempts.
*The fix:* log critical events to a SIEM and configure alerting thresholds.

### 10. Server-Side Request Forgery (SSRF) (OWASP #10)
BankCorp has a feature to fetch an image from a URL: `bankcorp.com/fetch?url=http://image.com/1.jpg`. The attacker changes the URL to `http://169.254.169.254/latest/meta-data/` to steal the cloud server's internal IAM credentials.
*The fix:* validate and restrict outbound URLs using an allowlist.

---

## Why Walking Through One App Beats a Checklist

Every one of these ten flaws exists in the same 400-line codebase, and every one of them was "technically" caught by a checklist that BankCorp's team ran before launch -- they just checked the box without understanding the underlying mechanism. The pattern that repeats across all ten:

1. **The vulnerability is invisible in a demo.** The happy path (`id=1001` belongs to the logged-in user, the reset flow is never attacked, the npm package is never swapped) works perfectly. The flaw only surfaces when an adversarial input is supplied.
2. **The fix is usually a single, well-understood control** (parameterized queries, bcrypt, an allowlist), not a rewrite -- which is exactly why "we didn't have time" is rarely a valid excuse once a team knows the pattern.
3. **These flaws compound.** BankCorp's broken access control (#1) combined with its logging failure (#9) means an attacker who discovers the IDOR can scrape every account for days before anyone notices.

Treat the OWASP Top 10 not as ten independent boxes to check, but as ten instances of a single discipline: never trust client input, never trust internal identifiers alone, and never assume "it hasn't happened yet" means "it can't happen."
