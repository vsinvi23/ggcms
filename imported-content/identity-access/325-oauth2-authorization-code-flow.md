# OAuth 2.0 Authorization Code Flow: Step-by-Step State Machine

**Problem:** Allowing a third-party application to directly handle a user's credentials (username/password) violates zero-trust principles. The Authorization Code Flow solves this by establishing a federated state machine that keeps credentials isolated at the Identity Provider (IdP).

### The Architecture of the Flow

The Authorization Code Flow is designed for Confidential Clients (e.g., backend web servers) that can securely store a `client_secret`. It separates the user's browser (Front-Channel) from the application's backend server (Back-Channel) to protect the final Access Token from being exposed to the client-side environment.

#### Actors Involved:
* **Resource Owner:** The user.
* **Client:** The third-party application (e.g., "PhotoApp").
* **Authorization Server (IdP):** The identity provider (e.g., Google, Okta).
* **Resource Server:** The API containing the data.

### Step-by-Step State Machine

#### 1. The Front-Channel Redirect
The user clicks "Login with IdP". The Client constructs an authorization URL and redirects the user's browser to the IdP.

```text
GET /authorize?
  response_type=code
  &client_id=photo_app_123
  &redirect_uri=https://photoapp.com/callback
  &scope=read_photos
  &state=xyz_random_123  HTTP/1.1
Host: idp.com
```
*   `response_type=code`: Instructs the IdP to return a temporary authorization code, *not* an access token.
*   `state`: A CSRF protection token. The Client stores this locally and expects it back exactly as sent.

#### 2. User Authentication and Consent
The IdP prompts the user to authenticate (username/MFA). Once authenticated, the IdP displays a consent screen: "PhotoApp wants to read your photos. Allow?" The Client is completely blind to this process; it never sees the password.

#### 3. The Front-Channel Callback
Upon consent, the IdP generates an Authorization Code and redirects the browser back to the Client's `redirect_uri`.

```text
GET /callback?code=AuthZ_Code_987&state=xyz_random_123 HTTP/1.1
Host: photoapp.com
```
The Client validates the `state` parameter to prevent CSRF.

#### 4. The Back-Channel Token Exchange
The Client now possesses the Authorization Code. Because this code passed through the user's browser, it is considered potentially compromised. To convert it into a highly privileged Access Token, the Client makes a secure, server-to-server HTTP request directly to the IdP.

```text
POST /token HTTP/1.1
Host: idp.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic [Base64(client_id:client_secret)]

grant_type=authorization_code
&code=AuthZ_Code_987
&redirect_uri=https://photoapp.com/callback
```

**Security mechanisms applied here:**
1. **Client Authentication:** The IdP verifies the `client_secret` (via Basic Auth). This proves the request is originating from the legitimate backend server.
2. **Code Validation:** The IdP ensures the code is valid, unexpired (usually lives < 60 seconds), and was issued to this exact `client_id`.
3. **Redirect URI Binding:** The IdP verifies the `redirect_uri` matches the one used in Step 1.

#### 5. Token Issuance
If validation succeeds, the IdP invalidates the Authorization Code (it is strictly single-use) and responds with the Access Token.

```json
{
  "access_token": "eyJhbGciOiJIUzI1Ni...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200..."
}
```

#### The State Machine Diagram

```text
  User Browser                Client Backend                IdP Server
       |                            |                           |
       |--- 1. Click Login -------->|                           |
       |<-- Redirect to IdP --------|                           |
       |                            |                           |
       |------------------- 2. Auth & Consent ----------------->|
       |<------------------ 3. Redirect w/ Code ----------------|
       |                            |                           |
       |--- 3. GET /callback ------>|                           |
       |      (code)                |--- 4. POST /token ------->|
       |                            |     (code + secret)       |
       |                            |<-- 5. Access Token -------|
```

By keeping the Access Token strictly in the Back-Channel, the Authorization Code Flow prevents token leakage via browser history, Referer headers, or cross-site scripting (XSS), establishing a highly secure federation protocol.