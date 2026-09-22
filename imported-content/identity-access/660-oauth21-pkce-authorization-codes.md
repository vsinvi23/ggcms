# OAuth 2.1 Security Hardening: Mandating PKCE Globally

## The Problem: Authorization Code Interception
In standard OAuth 2.0 (RFC 6749), public clients (e.g., mobile apps, SPAs) cannot securely store a `client_secret`. Historically, these apps relied on the Implicit Flow (which leaked tokens in the URL hash) or the Authorization Code flow without a secret. 

The major vulnerability in a secret-less Authorization Code flow is **Authorization Code Interception**. Malicious apps installed on the same device can register the same custom URI scheme (e.g., `myapp://callback`). When the OS redirects the browser back to the app with the `code=XYZ` parameter, the malicious app intercepts it. Because there is no `client_secret` to authenticate the token exchange, the malicious app successfully trades the stolen code for an access token.

## The Solution: Proof Key for Code Exchange (PKCE)
OAuth 2.1 strictly deprecates the Implicit flow and mandates the Authorization Code flow with **PKCE (RFC 7636)** for *all* clients (including confidential ones). 

PKCE replaces the static `client_secret` with a dynamically generated cryptographic secret created on the fly for *every single authorization request*.

1. The client generates a random `code_verifier`.
2. The client hashes it to create a `code_challenge` (SHA-256).
3. The client sends the `code_challenge` to the Auth Server during the initial login redirect.
4. The Auth Server stores the challenge and returns the Authorization Code.
5. The client sends the Authorization Code AND the plaintext `code_verifier` to the token endpoint.
6. The Auth Server hashes the `code_verifier` and compares it to the saved `code_challenge`. If they match, the token is issued.

An attacker intercepting the code cannot exchange it because they do not possess the high-entropy plaintext `code_verifier`.

## Architectural Flow
```text
  [Public Client]                                 [Auth Server]
         |                                              |
         |-- 1. Generate code_verifier                  |
         |-- 2. code_challenge = SHA256(verifier)       |
         |                                              |
         |-- 3. GET /authorize?code_challenge=...  ---->|
         |                                              | (Stores challenge)
         |<-- 4. 302 Redirect with ?code=XYZ -----------|
         |                                              |
(Attacker intercepts code=XYZ, but lacks verifier)      |
         |                                              |
         |-- 5. POST /token                             |
         |      code=XYZ & code_verifier=...       ---->|
         |                                              | (Verifies SHA256)
         |<-- 6. 200 OK (Access Token) -----------------|
```

## Implementation: Generating PKCE in Browser (WebCrypto API)
Robust implementation requires utilizing the native `crypto.subtle` API in modern browsers to ensure cryptographically secure entropy and non-blocking SHA-256 hashing.

```typescript
/**
 * Generates a high-entropy random string for the Code Verifier.
 * Minimum 43 characters, maximum 128 characters (RFC 7636).
 */
function generateCodeVerifier(): string {
    const array = new Uint32Array(56 / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

/**
 * Hashes the verifier using SHA-256 and encodes it in Base64URL format.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    
    return base64UrlEncode(digest);
}

/**
 * Base64URL encoding (removes padding, uses safe URL characters)
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Execution execution
async function initiateAuth() {
    const verifier = generateCodeVerifier();
    // Store verifier securely in sessionStorage for the redirect return
    sessionStorage.setItem('pkce_verifier', verifier); 
    
    const challenge = await generateCodeChallenge(verifier);
    
    const authUrl = new URL('https://auth.server.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', 'my_spa_client');
    authUrl.searchParams.append('code_challenge', challenge);
    authUrl.searchParams.append('code_challenge_method', 'S256'); // ALWAYS use S256
    
    window.location.assign(authUrl.toString());
}
```

## Engineering Considerations
1. **`plain` vs `S256`:** PKCE supports a `plain` challenge method (where challenge == verifier) for legacy constrained devices. Modern systems must strictly reject `plain` and enforce `S256`.
2. **Global Mandate:** In OAuth 2.1, PKCE is required even for confidential clients (backends with `client_secret`). This adds defense-in-depth against code injection attacks and SSRF scenarios where a backend code might be leaked.
3. **State vs PKCE:** PKCE replaces the CSRF mitigation natively provided by the `state` parameter, though `state` is still recommended for application-specific state restoration.