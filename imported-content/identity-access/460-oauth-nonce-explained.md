# OAuth Nonce Explained: Replay Attack Mitigation in OpenID Connect

While the OAuth 2.0 `state` parameter is designed to prevent Cross-Site Request Forgery (CSRF) during the redirect phase, OpenID Connect (OIDC) introduces another critical safety check: the **`nonce` parameter**.

The `nonce` parameter is specifically designed to mitigate **Replay Attacks** affecting the client's ingestion of the **ID Token**. Let's examine the exact mechanics of an identity replay attack, understand the cryptographic role of the OIDC nonce, and review a secure code implementation for token validation.

---

## The Threat Vector: ID Token Replay Attack

An OIDC **ID Token** is a JWT signed by an Identity Provider (IdP) that asserts a user's identity. If an attacker can intercept a valid ID Token issued to Alice, they might attempt to **replay** (re-submit) that token to the Client application to establish an unauthorized authenticated session.

This interception can occur via several vectors:
- Malicious proxy servers on unencrypted networks.
- Intercepted browser session logs.
- Exploiting a secondary client application (where the user used the same IdP) and replaying that token to a different target client.

```
+---------------------------------------------------------------------------------+
|                                 REPLAY ATTACK                                   |
|                                                                                 |
|  Attacker             Victim Browser           Client Backend         Auth Server
|     |                       |                        |                     |
|     |                       |                        |                     |
|     |                       |                        |                     |
|     | 1. Authenticates      |                        |                     |
|     |    Successfully       |                        |                     |
|     |--------------------------------------------------------------------->|
|     |                       |                        |                     |
|     | 2. Receives Signed ID_TOKEN in Front-Channel                          |
|     |<---------------------------------------------------------------------|
|     |                                                                      |
|     | [ATTACKER INTERCEPTS ID_TOKEN via local logs / proxy sniffing]       |
|     |                                                                      |
|     | 3. Submits (Replays) Alice's ID_TOKEN to callback endpoint           |
|     |---------------------------------------------->|                      |
|                                                     |                      |
|                                                     | 4. Is Alice's Token  |
|                                                     |    valid?            |
|                                                     |--------------------->|
|                                                     |                      |
|                                                     | 5. "Yes, signature   |
|                                                     |    and exp are OK"   |
|                                                     |<---------------------|
|                                                     |                      |
|                                                     | 6. Authenticates     |
|                                                     |    Attacker as Alice!|
|                                                     |<---------------------|
+---------------------------------------------------------------------------------+
```

Without a dynamic transaction binding, a replayed token looks entirely legitimate to the Client backend: the signature is valid, and the token has not yet expired.

---

## How the `nonce` Prevents the Attack

The OIDC `nonce` parameter (Number used ONCE) acts as a cryptographic tie between the **initial authentication request** and the **resulting ID Token**.

### The Handshake Steps:
1. When generating the login URL, the Client creates a cryptographically strong, random string (the `nonce`).
2. The Client hashes this nonce or saves it in the user's private, encrypted, server-side session cookie.
3. The Client includes the `nonce` in the authentication request to the Identity Provider.
4. The Identity Provider verifies the user, constructs the ID Token, and **places the exact `nonce` value directly inside the claims of the ID Token (JWT)**.
5. The IdP signs the JWT.
6. The Client receives the ID Token, decrypts and validates the signature, and extracts the `nonce` claim from the payload.
7. The Client compares the token's internal `nonce` claim against the original nonce stored in the user's session cookie.
8. If they do not match, the token is rejected as a replay attempt.

Because the `nonce` is embedded inside the ID Token and cryptographically signed by the IdP, an attacker cannot modify the nonce claim without breaking the signature validation.

---

## State vs. Nonce: Knowing the Difference

Many developers mistake `state` and `nonce` because they both use session cookies. Let's trace their distinct targets:

- **`state` is target-bound to the Flow Redirect.** It is evaluated at the callback handler `/callback` to ensure the callback originated from the user's browser. It protects the **Client** from executing spoofed callbacks.
- **`nonce` is target-bound to the Token.** It is evaluated by checking the payload of the **ID Token** itself. It protects the **Client** from accepting replayed identity assertions.

---

## Robust Code Example: Validating Nonce Claims in ID Tokens

The following Node.js backend implements an OIDC login verification endpoint, showing how to safely validate the signed `nonce` claim in the incoming JWT payload.

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser('cookie-signing-secret-9999')); // Signed cookie management

const IDP_PUBLIC_KEY = 'idp-signed-public-key-9999';

// Endpoint 1: Initiating OIDC login and setting the session nonce
app.get('/login-oidc', (req, res) => {
    // Generate a high-entropy, cryptographically secure nonce
    const sessionNonce = crypto.randomBytes(24).toString('base64url');

    // Store the nonce in a secure HttpOnly, Signed cookie
    res.cookie('oidc_nonce_binding', sessionNonce, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        signed: true,
        maxAge: 5 * 60 * 1000 // Short lived: 5 minutes
    });

    const oidcAuthUrl = 'https://auth.example.com/authorize?' + new URLSearchParams({
        response_type: 'id_token', // Typical in implicit/hybrid, or used with code flow
        client_id: 'my_client_id_8899',
        redirect_uri: 'https://myclient.com/callback',
        scope: 'openid email',
        nonce: sessionNonce // Pass raw nonce to OIDC provider
    }).toString();

    res.redirect(oidcAuthUrl);
});

// Endpoint 2: Validating incoming ID Token and verifying the signed nonce
app.post('/api/auth/verify-id-token', (req, res) => {
    const { idToken } = req.body;
    
    // Retrieve stored nonce from the secure signed cookie
    const savedNonce = req.signedCookies['oidc_nonce_binding'];

    if (!idToken) {
        return res.status(400).json({ error: 'Missing ID Token payload' });
    }
    if (!savedNonce) {
        return res.status(400).json({ error: 'Missing session context or transaction expired.' });
    }

    // Clear the nonce cookie immediately to enforce single-use mechanics
    res.clearCookie('oidc_nonce_binding');

    try {
        // Validate signature, issuer, and client audience of the ID Token
        const decoded = jwt.verify(idToken, IDP_PUBLIC_KEY, {
            algorithms: ['RS256'],
            audience: 'my_client_id_8899',
            issuer: 'https://auth.example.com'
        });

        // CRITICAL: Extract and cryptographically verify the signed nonce claim
        const tokenNonce = decoded.nonce;
        if (!tokenNonce) {
            return res.status(401).json({ error: 'Invalid ID Token: Missing nonce claim.' });
        }

        // Use timing-safe comparison to prevent leakage
        const bufToken = Buffer.from(tokenNonce);
        const bufSaved = Buffer.from(savedNonce);

        if (bufToken.length !== bufSaved.length || !crypto.timingSafeEqual(bufToken, bufSaved)) {
            console.error('SECURITY VIOLATION: Replay attack detected. Nonce mismatch.');
            return res.status(401).json({ error: 'Authentication failed: Cryptographic nonce mismatch.' });
        }

        // Establish the local application session
        res.json({
            status: 'Authenticated',
            userId: decoded.sub,
            email: decoded.email
        });

    } catch (err) {
        res.status(401).json({ error: 'Invalid ID Token signature', details: err.message });
    }
});

app.listen(3030, () => console.log('OIDC Client Backend online on port 3030'));
```

---

## Production Security Policies for Nonces

- **Mandatory for Implicit/Hybrid Flows:** The `nonce` parameter is strictly **mandatory** if you are requesting ID Tokens directly in the front-channel (Implicit or Hybrid OIDC flows).
- **Strong Entropy:** Never use predictable sequences or timestamps for nonces. Always use a cryptographically secure random number generator (CSPRNG) yielding at least 128 bits of entropy.
- **Timing Safe:** Protect all comparisons of user-provided state/nonce values against side-channel timing analysis.
