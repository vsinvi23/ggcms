# OAuth PKCE Explained: The Anatomy of a Real Code Interception Attack

The **Proof Key for Code Exchange (PKCE, pronounced "pixie")** extension (RFC 7636) is often viewed as a niche enhancement for mobile apps. In reality, it is a critical security countermeasure that mitigates a devastating real-world attack: **Authorization Code Interception**.

Let's dissect the mechanics of this attack, map out how it occurs on physical devices, and demonstrate how PKCE uses mathematical hashes to lock down the authorization exchange.

---

## The Attack Vector: Custom URI Scheme Interception

On operating systems like iOS, Android, and Android-based smart TVs, native applications register custom URI schemes (e.g., `myapp://`) with the OS to handle deep-linking. 

However, historically, mobile operating systems did not enforce exclusive ownership of custom URI schemes. If multiple applications registered the exact same scheme (e.g., `com.bank.app://`), the OS would arbitrarily pick which application opened when a link using that scheme was clicked.

This vulnerability allows a malicious app installed on the user's phone to intercept the Authorization Code in transit.

---

## Step-by-Step Anatomy of the Interception Attack

```
      +-------------------------------------------------------------+
      |                       VICTIM'S DEVICE                       |
      |                                                             |
      |  +------------------+                   +----------------+  |
      |  |   Legitimate     |                   |  Malicious App |  |
      |  |  Bank App (Client|                   |   (Attacker)   |  |
      |  +--------+---------+                   +--------+-------+  |
      |           |                                      ^          |
      |     1. Initiates Auth                            |          |
      |           v                                      |          |
      |  +--------+---------+                            |          |
      |  | System Browser   |                            |          |
      |  |                  |                            |          |
      |  +--------+---------+                            |          |
      |           |                                      |          |
      |           | 2. Redirect to Redirect URI:         |          |
      |           |    com.bank.app://oauth-callback?    |          |
      |           |    code=GOLDEN_CODE_8899             |          |
      |           |======================================+          |
      |                                                             |
      +-------------------------------------------------------------+
                                                         |
                                                         | 3. Extracts Code
                                                         |    Sends to AS
                                                         v
                                                +----------------+
                                                |  Authorization |
                                                |    Server      |
                                                +----------------+
```

### Trace of the Exploit:
1. **Legitimate App** opens the system browser to authenticate Alice.
2. Alice logs in. The Authorization Server (AS) generates an `authorization_code` (`GOLDEN_CODE_8899`) and redirects the browser back to `com.bank.app://oauth-callback?code=GOLDEN_CODE_8899`.
3. The mobile operating system intercepts the `com.bank.app://` redirect. However, instead of passing it to the Legitimate App, the OS routes the link to a **Malicious App** that registered the same scheme.
4. The Malicious App extracts the `authorization_code` from the query string.
5. Because mobile apps are **Public Clients** (they don't have a Client Secret), the Malicious App can immediately post `GOLDEN_CODE_8899` to the token endpoint and receive Alice's Access Token!

---

## How PKCE Solves the Attack: Dynamic Secrets

PKCE solves this attack by replacing static client secrets with dynamic, single-use, cryptographically verified secrets generated on-the-fly for *every single authorization request*.

The flow introduces three critical elements:
1. **Code Verifier:** A high-entropy, cryptographically secure random string.
2. **Code Challenge:** The hashed representation of the code verifier (typically SHA-256 base64url encoded).
3. **Code Challenge Method:** The algorithm used (typically `S256`).

---

## The PKCE Mathematical Handshake

Instead of relying on a pre-shared key, PKCE establishes proof of identity using a cryptographically locked secret:

```
At Flow Initiation:
Code Challenge = Base64URL-Encode( SHA256( Code Verifier ) )
```

During the flow:
1. The Client sends the **Code Challenge** during the initial redirect.
2. The Attacker intercepts the **Authorization Code** but *does not have* the original **Code Verifier** (which never left the client memory).
3. The Client exchanges the code and provides the raw **Code Verifier**.
4. The AS hashes the verifier and compares it to the challenge. If they match, access is granted.

---

## Robust Code Example: PKCE Client Generation & Validation

Below is a robust implementation showing how the PKCE dynamic secret parameters are generated in Node.js on the client, and validated on the Authorization Server.

### 1. Client-Side Parameter Generation

```javascript
const crypto = require('crypto');

// Generate a cryptographically secure random string (Code Verifier)
function generateCodeVerifier() {
    return crypto.randomBytes(32)
        .toString('base64url') // base64url format removes safe characters like +, /, and =
        .slice(0, 128);       // Bound between 43 and 128 characters per RFC 7636
}

// Hash the verifier using SHA-256 to create the Code Challenge
function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256')
        .update(verifier)
        .digest();
    return hash.toString('base64url');
}

// Execution
const verifier = generateCodeVerifier();
const challenge = generateCodeChallenge(verifier);

console.log('--- PKCE Credentials Generated ---');
console.log('Code Verifier (Keep Private): ', verifier);
console.log('Code Challenge (Send to Auth):', challenge);
```

### 2. Authorization Server Code Validation

```javascript
// Authorization Server Mock Code Validation Endpoint
function validatePkceChallenge(codeVerifier, expectedChallenge, challengeMethod) {
    if (challengeMethod === 'plain') {
        // Obsolete plain method comparison
        return crypto.timingSafeEqual(Buffer.from(codeVerifier), Buffer.from(expectedChallenge));
    }

    if (challengeMethod === 'S256') {
        // Re-hash the client-provided verifier
        const recalculatedHash = crypto.createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        // Timing-safe comparison to prevent side-channel leaks
        const bufA = Buffer.from(recalculatedHash);
        const bufB = Buffer.from(expectedChallenge);
        
        if (bufA.length !== bufB.length) {
            return false;
        }
        return crypto.timingSafeEqual(bufA, bufB);
    }

    return false;
}

// Usage inside AS Token Endpoint
const isPkceValid = validatePkceChallenge(
    'client_provided_verifier_abc123', // From POST payload
    'stored_original_challenge_xyz789',  // From AS database session
    'S256'
);
```

---

## Architectural Rules for Engineers

- **Deprecate 'Plain' Challenge Method:** Always enforce `code_challenge_method=S256` in your Authorization Server policies. The `plain` method is susceptible to sniffing on local connections and does not provide cryptographic insulation.
- **PKCE for Everyone:** While originally designed for mobile/native public clients, the OAuth security working group now mandates **PKCE for all confidential clients (web apps) too**. It serves as an extra layer of defense-in-depth against code leakage in server-side environments.
