# OAuth Common Attack Patterns: State Bypass and Code Reuse

## The Problem
Developers frequently implement OAuth 2.0 assuming the protocol guarantees out-of-the-box security. In reality, the OAuth specification provides a framework, leaving critical state management and parameter validation to the implementer. When parameters like `state` are omitted or PKCE is bypassed, applications become vulnerable to Cross-Site Request Forgery (CSRF) and Authorization Code Interception.

## Attack 1: State Bypass (OAuth CSRF)
If a client application does not generate and validate a `state` parameter, an attacker can initiate an OAuth flow, intercept the callback containing their own authorization code, and force a victim's browser to execute that callback. 

### The Architecture of a State Bypass Attack

```text
[ Attacker ]                           [ Victim ]                          [ OAuth Provider (OP) ]
     |                                     |                                         |
     | 1. Initiates OAuth Flow             |                                         |
     |------------------------------------------------------------------------------>|
     |                                     |                                         |
     | 2. OP redirects with Auth Code (Attacker's Code)                              |
     |<------------------------------------------------------------------------------|
     |                                     |                                         |
     | 3. Attacker tricks victim into clicking a link with the Attacker's Code       |
     |------------------------------------>|                                         |
     |                                     | 4. Victim sends Auth Code to App        |
     |                                     |---------------------------------------->| (App)
     |                                     |                                         |
     |                                     | 5. App exchanges code for token         |
     |                                     |    (Victim is now logged into           |
     |                                     |     Attacker's account)                 |
```

### Mitigation: The `state` Parameter
The `state` parameter acts as a CSRF token. It binds the authorization request to the client-side session.

```javascript
// Node.js / Express Example
const crypto = require('crypto');

app.get('/login', (req, res) => {
    // Generate a cryptographically strong random state
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state in a secure, HTTP-only session cookie
    res.cookie('oauth_state', state, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'Lax', 
        maxAge: 300000 
    });

    const authUrl = `https://provider.com/oauth/authorize?` +
        `client_id=${CLIENT_ID}&` +
        `response_type=code&` +
        `redirect_uri=${REDIRECT_URI}&` +
        `state=${state}`;

    res.redirect(authUrl);
});

app.get('/callback', (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies.oauth_state;

    // Strict state validation
    if (!state || !storedState || state !== storedState) {
        return res.status(403).send('State mismatch: Potential CSRF attack.');
    }

    // Proceed to exchange code for token
});
```

## Attack 2: Authorization Code Interception
In native and mobile applications, custom URI schemes (e.g., `myapp://callback`) are used to receive the authorization code. A malicious application installed on the same device can register the same URI scheme, intercept the code, and exchange it for an access token.

### The Architecture of Code Interception

```text
[ OP ]                        [ OS / Inter-App Comm ]                 [ Malicious App ]
  |                                     |                                     |
  | 1. Redirect to myapp://callback?code=123                                  |
  |------------------------------------>|                                     |
  |                                     | 2. OS prompts or auto-routes        |
  |                                     |    to Malicious App                 |
  |                                     |------------------------------------>|
  |                                     |                                     |
  |                                     | 3. Exchanges code for token         |
  |<--------------------------------------------------------------------------|
```

### Mitigation: Proof Key for Code Exchange (PKCE)
PKCE (RFC 7636) mitigates this by dynamically creating a unique cryptographic secret (`code_verifier`) and its hash (`code_challenge`) for every authorization request. Even if the code is intercepted, the attacker lacks the `code_verifier` required to exchange the code for a token.

```javascript
// Generating PKCE in Node.js
const crypto = require('crypto');

function generatePKCE() {
    // 1. Generate code_verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // 2. Generate code_challenge
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
        
    return { codeVerifier, codeChallenge };
}

// In the /authorize request:
// ...&code_challenge=${codeChallenge}&code_challenge_method=S256

// In the /token exchange request:
// POST data: grant_type=authorization_code&code=${code}&code_verifier=${codeVerifier}
```

By enforcing strict `state` validation and adopting PKCE across all client types, developers systematically eliminate the two most pervasive attack vectors in the OAuth 2.0 framework.