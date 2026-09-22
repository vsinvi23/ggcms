# OAuth for Mobile Applications: AppAuth and Custom Scheme Hijacking

## The Problem
Mobile applications are classified as "Public Clients" in the OAuth 2.0 specification because they cannot securely store a `client_secret`. Embedded secrets can be easily extracted by reverse-engineering the APK/IPA. Furthermore, mobile operating systems rely on Custom URI Schemes (e.g., `com.myapp://callback`) to route the browser back to the app after authentication. 

Because Android and older iOS versions do not enforce exclusive ownership of custom URI schemes out of the box, a malicious application installed on the same device can register `com.myapp://callback`. This creates a race condition where the malicious app intercepts the Authorization Code and exchanges it for an Access Token.

## The Architecture of Custom Scheme Hijacking

```text
[ Native App ]                  [ System Browser ]                   [ Malicious App ]
      |                                 |                                    |
      | 1. Starts Auth Flow             |                                    |
      |-------------------------------->|                                    |
      |                                 | 2. User Logs In                    |
      |                                 |                                    |
      | 3. OS broadcasts custom URI: com.myapp://callback?code=XYZ           |
      |<--------------------------------+----------------------------------->|
      | (Race Condition)                |                                    | (Wins Race)
      |                                 |                                    |
                                                                             | 4. Exchanges code for Token
```

## The Solution: PKCE and the AppAuth Pattern
To secure mobile authentication, the industry standard is to use **Authorization Code Flow with PKCE** executed via a **System Browser Tab** (Custom Tabs on Android, `ASWebAuthenticationSession` on iOS).

### Why PKCE Solves Hijacking
PKCE (Proof Key for Code Exchange) binds the authorization code to the specific app instance that requested it. 
1. The app generates a dynamic secret (`code_verifier`) and sends its hash (`code_challenge`).
2. Even if the malicious app intercepts the authorization code, it cannot exchange it because it does not possess the original `code_verifier`.

### Why System Browser Tabs?
Using a native WebView (embedded browser) allows the host application to inspect traffic, read keystrokes, and steal credentials. System Browser Tabs provide an isolated context that shares session cookies with the system browser (enabling Single Sign-On across apps) while preventing the app itself from seeing the user's password.

## Robust Architecture: AppAuth in Practice

```text
[ Mobile App Instance ]                         [ Authorization Server ]
          |                                               |
          | 1. Generate code_verifier & code_challenge    |
          |                                               |
          | 2. Open System Browser Tab                    |
          |    GET /auth?code_challenge=xyz...            |
          |---------------------------------------------->|
          |                                               |
          | 3. Redirect back via App Link / Custom URI    |
          |<----------------------------------------------|
          |    (code=12345)                               |
          |                                               |
          | 4. POST /token                                |
          |    code=12345 & code_verifier=original_secret |
          |---------------------------------------------->|
          |                                               |
          | 5. Return Access & Refresh Tokens             |
          |<----------------------------------------------|
```

## Implementation via AppAuth SDK
Rather than implementing PKCE and browser-tab management manually, mobile developers should strictly use the **AppAuth SDK** (available for iOS and Android), maintained by the OpenID Foundation.

### iOS (Swift) AppAuth Example
```swift
import AppAuth

// 1. Discover endpoints
OIDAuthorizationService.discoverConfiguration(forIssuer: issuerURL) { configuration, error in
    guard let config = configuration else { return }

    // 2. Build the authorization request (AppAuth handles PKCE generation automatically!)
    let request = OIDAuthorizationRequest(
        configuration: config,
        clientId: clientID,
        scopes: [OIDScopeOpenID, OIDScopeProfile],
        redirectURL: redirectURI,
        responseType: OIDResponseTypeCode,
        additionalParameters: nil
    )

    // 3. Execute request using ASWebAuthenticationSession
    let appDelegate = UIApplication.shared.delegate as! AppDelegate
    appDelegate.currentAuthorizationFlow = OIDAuthState.authState(byPresenting: request, presenting: self) { authState, error in
        if let authState = authState {
            // Authentication successful, authState contains tokens
            let accessToken = authState.lastTokenResponse?.accessToken
            print("Access Token: \(accessToken ?? "")")
        } else {
            // Authentication failed
            print("Authorization error: \(error?.localizedDescription ?? "")")
        }
    }
}
```

## Advanced Mitigation: App Links and Universal Links
While PKCE neutralizes the threat of code exchange, malicious apps intercepting the URI still create a poor UX. To solve this, modern mobile apps should migrate from Custom URI Schemes to:
- **Android App Links**
- **iOS Universal Links**

These utilize standard HTTP/HTTPS URLs (e.g., `https://myapp.com/callback`). The OS verifies ownership of the domain by looking for a cryptographic file (`assetlinks.json` on Android, `apple-app-site-association` on iOS) hosted at the domain root. If verified, the OS guarantees that *only* your specific application will receive the callback, entirely eliminating the interception vector at the OS level.