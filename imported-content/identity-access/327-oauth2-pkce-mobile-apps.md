# OAuth 2.0 PKCE: Mathematical Proofs for Mobile App Interception Defenses

**Problem:** Mobile applications utilize custom URI schemes (e.g., `myapp://`) to receive OAuth authorization codes. Malicious apps installed on the same device can register the same URI scheme, intercept the code, and hijack the user's session.

### The Interception Threat Model

In the standard Authorization Code Flow on mobile, a user clicks "Login," opening the system browser. The user authenticates at the Identity Provider (IdP). The IdP then redirects the browser back to the app using a custom scheme:

`myapp://callback?code=AuthZ_Code_123`

Unlike web servers, where DNS guarantees `app.com` routes to a specific server, mobile OS routing is vulnerable. If an attacker tricks the user into installing "EvilApp", EvilApp can also register the `myapp://` scheme in its manifest.

When the browser redirects, the OS might hand the authorization code to EvilApp. Because public mobile apps cannot safely store a `client_secret`, EvilApp can immediately exchange the intercepted code at the IdP's token endpoint and steal the Access Token.

### Proof Key for Code Exchange (PKCE)

PKCE (RFC 7636) neutralizes this threat by binding the authorization code to a cryptographically verifiable secret generated dynamically by the legitimate app on a per-request basis.

#### The Cryptographic Protocol

**1. The Verifier Generation**
The legitimate mobile app generates a high-entropy cryptographically random string called the `code_verifier`.
*Length constraint:* 43 to 128 characters.

**2. The Challenge Transformation**
The app applies a one-way cryptographic hash to the verifier using SHA-256, and Base64-URL encodes the output. This is the `code_challenge`.
`code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`

**3. The Authorization Request**
The app initiates the flow in the browser, appending the `code_challenge` and the hashing method.

```text
GET /authorize?
  response_type=code
  &client_id=mobile_app_1
  &redirect_uri=myapp://callback
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJxAcd
  &code_challenge_method=S256
```
The IdP stores the `code_challenge` alongside the issued authorization code.

**4. The Interception (The Attack Fails)**
EvilApp intercepts the redirect: `myapp://callback?code=AuthZ_Code_123`.
EvilApp immediately attempts to exchange the code. 

**5. The Token Request (Proof of Possession)**
To redeem the code, the requesting app *must* provide the original plaintext `code_verifier`. 

Legitimate App Request:
```text
POST /token HTTP/1.1
grant_type=authorization_code
&code=AuthZ_Code_123
&client_id=mobile_app_1
&code_verifier=my_random_secret_string_generated_in_step_1
```

**6. Mathematical Verification at IdP**
The IdP performs the verification:
`BASE64URL-ENCODE(SHA256(code_verifier_received)) == stored_code_challenge`

### Why the Attack Collapses

When EvilApp intercepted the code, it intercepted *only* the code. It never saw the `code_verifier` (which remained isolated in the legitimate app's memory) nor the `code_challenge` (which was sent directly to the IdP via the secure browser context).

Because SHA-256 is computationally irreversible, EvilApp cannot reverse-engineer the `code_verifier` from the `code_challenge` (even if it somehow intercepted the initial request). Without the `code_verifier`, the IdP rejects EvilApp's token exchange request.

```text
Legitimate App                        EvilApp                          IdP
     |                                   |                              |
     |-- Auth Request (Challenge=C) ----------------------------------->|
     |                                   |                              |
     |                                   |<-- Intercepts Redirect (Code)|
     |                                   |                              |
     |                                   |-- POST /token (Code) ------->|
     |                                   |   (Missing Verifier)         |
     |                                   |<-- 400 Bad Request ----------|
```

PKCE acts as a dynamic, ephemeral `client_secret` that mathematically guarantees the entity exchanging the authorization code is the exact same entity that requested it, fully immunizing mobile flows against custom URI hijacking.