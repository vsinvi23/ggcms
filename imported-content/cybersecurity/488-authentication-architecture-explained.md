# Authentication Architecture Explained: Factors and IdPs

## The Problem: "Building our own login system"
For decades, the first task in building a new web application was writing the `users` table schema, hashing passwords with bcrypt, and managing session cookies. 

Today, building your own authentication system is an engineering anti-pattern. It is a massive security liability. Authentication has evolved from a simple password check into a complex ecosystem involving risk-based signals, multiple factors, biometrics, and federation. 

Modern engineering requires delegating this complexity to specialized architectural components.

## Authentication vs. Authorization
Before diving into the architecture, we must define the absolute hardest boundary in security:
*   **Authentication (AuthN):** Proving *who* you are. (e.g., "I am Alice. Here is my password and my YubiKey.")
*   **Authorization (AuthZ):** Determining *what* you are allowed to do. (e.g., "Alice is allowed to delete this database.")

This article focuses strictly on **AuthN**.

## The Authentication Factors
Authentication relies on proving your identity using one or more "factors." 

1.  **Something you know:** A password, a PIN, or the answer to a security question. (Weakest)
2.  **Something you have:** A smartphone (receiving an SMS or TOTP code), a hardware token (YubiKey), or a smart card. (Stronger)
3.  **Something you are:** Biometrics like a fingerprint, FaceID, or retinal scan. (Strongest)

**Multi-Factor Authentication (MFA)** requires the user to present at least two *different* types of factors. Supplying two passwords is not MFA; that is two instances of "something you know."

## Modern Authentication Architecture: The IdP

In a modern architecture, applications do not verify passwords. They rely on an **Identity Provider (IdP)**. 

An IdP (like Auth0, Okta, Microsoft Entra, or an open-source solution like Keycloak) is a centralized service dedicated solely to managing identities, verifying factors, and issuing cryptographic tokens.

### The Flow: OpenID Connect (OIDC)

The industry standard for delegating authentication to an IdP is OpenID Connect (built on top of OAuth 2.0). Here is how the architecture handles a user login:

```text
[ User Browser ]       [ Your Application ]        [ Identity Provider (IdP) ]
       |                        |                              |
       |-- 1. Click "Login" --->|                              |
       |                        |                              |
       |<-- 2. Redirect to IdP -|                              |
       |                        |                              |
       |---------- 3. User provides Username & Password ------>|
       |---------- 4. User provides WebAuthn (YubiKey) ------->|
       |                        |                              |
       |                        |    (IdP validates factors)   |
       |                        |                              |
       |<--------- 5. Redirect back with Auth Code ------------|
       |                        |                              |
       |-- 6. Send Code ------->|                              |
       |                        |-- 7. Exchange Code for JWT ->|
       |                        |<-- 8. Returns ID Token (JWT)-|
       |                        |                              |
       |<-- 9. App Session -----|                              |
```

### Breaking Down the Flow
1.  **Delegation:** When the user wants to log in, your application immediately redirects them to the IdP's hosted login page. Your application *never sees the user's password*.
2.  **Verification:** The IdP handles the heavy lifting: verifying the password hash, prompting for a YubiKey, checking if the IP address is anomalous (risk-based auth), and mitigating brute-force attacks.
3.  **The Token:** Once the IdP is satisfied, it redirects the user back to your application with a code. Your backend exchanges this code for an **ID Token**, which is formatted as a JSON Web Token (JWT).

## The JWT: The Artifact of Authentication
The result of a successful authentication is the ID Token (JWT). This token is a cryptographically signed document proving that the IdP successfully authenticated the user.

A decoded ID Token looks like this:
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-123"
}
.
{
  "iss": "https://your-tenant.auth0.com/",  // The IdP who issued the token
  "sub": "user_12345",                      // The User's unique ID
  "aud": "your_app_client_id",              // Your application
  "iat": 1697040000,                        // Issued At timestamp
  "exp": 1697076000,                        // Expiration timestamp
  "email": "alice@example.com",             // Identity claim
  "amr": ["pwd", "mfa"]                     // Authentication Methods Reference (How they logged in)
}
.
[ Cryptographic Signature ]
```

### Engineering Responsibilities
Once your application receives this JWT, your authentication job is largely done. Your backend simply needs to:
1.  Verify the JWT's cryptographic signature using the IdP's public keys.
2.  Verify the `exp` (expiration) claim has not passed.
3.  Verify the `aud` (audience) matches your application.
4.  Extract the `sub` (subject) to know *who* just logged in, and proceed to the Authorization phase.

```javascript
// Example: Validating the JWT in Node.js
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({ jwksUri: 'https://your-tenant.auth0.com/.well-known/jwks.json' });

function getKey(header, callback){
  client.getSigningKey(header.kid, function(err, key) {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Middleware to verify the AuthN artifact
app.use('/api/secure', (req, res, next) => {
    const token = req.headers.authorization.split(' ')[1];
    
    jwt.verify(token, getKey, { audience: 'your_app_client_id' }, (err, decoded) => {
        if (err) return res.status(401).send("Authentication failed");
        
        req.user = decoded; // We now know WHO the user is.
        next();
    });
});
```

## Conclusion
Modern authentication architecture relies on specialization and delegation. By offloading password storage, MFA enforcement, and identity federation (like "Login with Google") to a dedicated Identity Provider, engineering teams reduce their attack surface and ensure they are utilizing industry-best cryptographic standards like OIDC and JWTs. Your application's job is simply to verify the cryptographic artifact the IdP provides.