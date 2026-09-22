# OAuth Authorization Code Flow: Step-by-Step Technical Choreography

The **Authorization Code Flow** is the gold standard of delegated authorization for server-side web applications. Unlike the deprecated implicit flow, it utilizes a two-channel exchange (front-channel via the browser, back-channel server-to-server) to prevent token exposure in transit.

Let's dissect this choreography step-by-step, trace the request/response payloads at each phase, and construct a robust implementation of the server-side client.

---

## The Two Channels: Front-Channel vs. Back-Channel

Understanding this flow requires understanding channel security:
- **The Front-Channel (Untrusted):** Conducted through the user's browser. It is vulnerable to interception, browser history sniffing, and malicious browser extensions.
- **The Back-Channel (Highly Trusted):** A direct, server-to-server TLS connection between the Client backend and the Authorization Server. Credentials (like Client Secrets) and Access Tokens can be transmitted here securely.

---

## Choreography Sequence Diagram

```
User/Browser              Client Backend             Auth Server (AS)
    |                           |                           |
    |  1. Click "Login/Connect" |                           |
    |-------------------------->|                           |
    |                           |                           |
    |  2. Redirect (Front-Channel HTTP 302 to /authorize)   |
    |<--------------------------|                           |
    |                                                       |
    |  3. User Authenticates & Grants Scopes                |
    |------------------------------------------------------>|
    |                                                       |
    |  4. Redirect with Auth Code (Front-Channel HTTP 302)  |
    |<------------------------------------------------------|
    |                                                       |
    |  5. GET /callback?code=AUTH_CODE                      |
    |-------------------------->|                           |
    |                           |                           |
    |                           | 6. POST /token (Back-Channel)
    |                           |    {code, secret, ...}    |
    |                           |-------------------------->|
    |                           |                           |
    |                           | 7. Return Access Token    |
    |                           |<--------------------------|
    |                           |                           |
    |  8. Established Session   |                           |
    |<--------------------------|                           |
```

---

## Step-by-Step Payload Breakdown

### Step 1 & 2: Client Initiates the Flow (Front-Channel Redirect)
The Client constructs an authorization URL and redirects the browser (HTTP 302) to the Authorization Server.

**The URL:**
```http
GET /authorize?
  response_type=code
  &client_id=client_app_abc123
  &redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback
  &scope=read%3Acontacts
  &state=secure_random_state_9988
  HTTP/1.1
Host: auth.example.com
```

### Step 3 & 4: User Consent & Code Generation (Front-Channel Redirect)
After Alice authenticates and consents, the Authorization Server redirects Alice's browser back to the Client's registered redirect URI, passing an ephemeral **Authorization Code**.

**The Redirect:**
```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback?
  code=splat_code_xyz789
  &state=secure_random_state_9988
```

### Step 5 & 6: Exchanging the Code for a Token (Back-Channel POST)
The Client receives the authorization code, verifies that the state matches what it originally sent, and makes a direct server-to-server POST request to the token endpoint.

**The POST Request:**
```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y2xpZW50X2FwcF9hYmMxMjM6c3VwZXJfc2VjcmV0X3NlY3JldF85OTk=

grant_type=authorization_code
&code=splat_code_xyz789
&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback
```
*(Note: The Authorization header contains the base64-encoded `client_id:client_secret`)*

### Step 7: The Response (Back-Channel)
The Authorization Server validates the code and secret and returns the tokens.

```json
HTTP/1.1 200 OK
Content-Type: application/json;charset=UTF-8
Cache-Control: no-store
Pragma: no-cache

{
  "access_token": "at_998877665544332211",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "rt_aabbccddeeff"
}
```

---

## Robust Code Example: Implementing the Client Backend

Here is an enterprise-grade Express.js implementation of the Client callback server, demonstrating state validation and secure token retrieval.

```javascript
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');

const app = express();

// Session setup to store 'state' across requests
app.use(session({
  secret: 'client-session-signing-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true, httpOnly: true }
}));

const CLIENT_ID = 'client_app_abc123';
const CLIENT_SECRET = 'super_secret_secret_999';
const REDIRECT_URI = 'https://client.example.com/callback';
const TOKEN_ENDPOINT = 'https://auth.example.com/token';

// Callback endpoint: Handles the code exchange
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.session.oauthState;

  // 1. Validate inputs
  if (!code || !state) {
    return res.status(400).send('Bad Request: Missing code or state.');
  }

  // 2. CRITICAL: Validate state parameter to prevent CSRF attacks
  if (!savedState || state !== savedState) {
    return res.status(403).send('Forbidden: State validation failed. Potential CSRF.');
  }

  // Clear state from session once validated
  delete req.session.oauthState;

  try {
    // 3. Perform Back-Channel Exchange
    // Construct basic authentication credentials for the client
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const tokenResponse = await axios.post(TOKEN_ENDPOINT, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }).toString(), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // 4. Safely store the access token in a server-side session (NEVER expose to browser)
    req.session.accessToken = access_token;
    if (refresh_token) {
      req.session.refreshToken = refresh_token;
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Token exchange failure:', error.response?.data || error.message);
    res.status(500).send('Error exchanging authorization code for access token.');
  }
});

app.listen(3000, () => console.log('Client Application running on port 3000'));
```

---

## Architectural Rules for Production

1. **Verify State:** Never, under any circumstances, bypass checking the `state` parameter in the callback.
2. **Short-lived Codes:** Authorization codes must live for a maximum of 10 minutes and must be single-use. If a code is presented twice, the AS must immediately invalidate all tokens issued under that flow.
3. **No Secret in Browser:** The Client Secret must never be compiled into Single Page Apps (Angular/React) or mobile app source code. If you cannot protect a secret on the backend, you must use **PKCE** instead of standard Auth Code flow.
