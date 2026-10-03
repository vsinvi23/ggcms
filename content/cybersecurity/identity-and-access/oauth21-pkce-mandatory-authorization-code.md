---
title: "OAuth 2.1: Why PKCE Is Now Mandatory for Every Client"
description: "How Authorization Code Interception broke secret-less OAuth clients, and how OAuth 2.1's global PKCE mandate closes it -- with a full WebCrypto implementation of code_verifier and code_challenge generation."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "oauth-2.1"
  - "pkce"
  - "authorization-code"
  - "rfc-7636"
  - "webcrypto"
---

# OAuth 2.1: Why PKCE Is Now Mandatory for Every Client

## The Problem: Authorization Code Interception

Under OAuth 2.0 (RFC 6749), public clients — mobile apps, SPAs — have no way to safely hold a `client_secret`; anything bundled into a distributed app binary can be extracted. Historically these clients used either the Implicit Flow (which returned tokens directly in the URL fragment, its own leakage problem) or the Authorization Code flow with no secret at all.

That secret-less Authorization Code flow has a specific, exploitable weakness: **Authorization Code Interception**. On mobile, a malicious app installed on the same device can register the *same* custom URI scheme as the legitimate app (e.g. `myapp://callback`). When the OS redirects the browser back with `?code=XYZ`, there's no guarantee which registered app actually receives that redirect — the malicious app can intercept it. Without a `client_secret` to authenticate the subsequent token exchange, whoever holds the code can redeem it.

## The Solution: Proof Key for Code Exchange (PKCE)

OAuth 2.1 deprecates the Implicit flow outright and mandates Authorization Code + PKCE (RFC 7636) for **every** client type — public and confidential alike. PKCE replaces the static, extractable `client_secret` with a secret generated fresh for each individual authorization request:

1. The client generates a random `code_verifier`.
2. It hashes the verifier (SHA-256) to produce a `code_challenge`.
3. It sends the `code_challenge` — not the verifier — in the initial `/authorize` redirect.
4. The authorization server stores the challenge and returns the authorization code as usual.
5. The client exchanges the code for a token at `/token`, this time including the plaintext `code_verifier`.
6. The server hashes the received verifier and compares it against the stored challenge. Only a match releases the token.

Because the interception happens at step 4 (the redirect carrying `code=XYZ`), and the verifier is never transmitted until step 5 — from a different execution context, ideally the original app instance — an attacker who only intercepted the code cannot complete the exchange without also possessing the verifier, which never crossed the network until that point.

```text
  [Public Client]                                 [Auth Server]
         |                                              |
         |-- 1. Generate code_verifier                  |
         |-- 2. code_challenge = SHA256(verifier)       |
         |                                              |
         |-- 3. GET /authorize?code_challenge=...  ---->|
         |                                              | (stores challenge)
         |<-- 4. 302 redirect with ?code=XYZ -----------|
         |                                              |
(Attacker intercepts code=XYZ, but lacks the verifier)  |
         |                                              |
         |-- 5. POST /token                             |
         |      code=XYZ & code_verifier=...       ---->|
         |                                              | (verifies SHA256(verifier) == stored challenge)
         |<-- 6. 200 OK (access token) ------------------|
```

## Implementation: PKCE in the Browser (WebCrypto API)

```typescript
/**
 * Generates a high-entropy random string for the code_verifier.
 * RFC 7636 requires 43-128 characters.
 */
function generateCodeVerifier(): string {
    const array = new Uint32Array(56 / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

/**
 * Hashes the verifier with SHA-256 and encodes the digest as Base64URL.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(digest);
}

/** Base64URL encoding: no padding, URL-safe alphabet. */
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

async function initiateAuth() {
    const verifier = generateCodeVerifier();
    // Persist the verifier for retrieval after the redirect returns.
    sessionStorage.setItem('pkce_verifier', verifier);

    const challenge = await generateCodeChallenge(verifier);

    const authUrl = new URL('https://auth.server.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', 'my_spa_client');
    authUrl.searchParams.append('code_challenge', challenge);
    authUrl.searchParams.append('code_challenge_method', 'S256'); // always S256, never plain
    window.location.assign(authUrl.toString());
}
```

At the token endpoint, the client retrieves the stored verifier from `sessionStorage` and includes it in the `POST /token` body alongside the returned `code`.

## Engineering Considerations

1. **`plain` vs `S256`.** RFC 7636 defines a `plain` challenge method where the challenge equals the verifier verbatim — intended only for constrained legacy devices that can't compute SHA-256. Modern implementations should reject `plain` entirely and require `S256`; accepting `plain` reduces PKCE to no protection at all, since the "challenge" an attacker intercepts *is* the verifier.
2. **Global mandate, even for confidential clients.** OAuth 2.1 requires PKCE even for backend clients that do have a `client_secret`. This adds defense-in-depth against authorization code injection and against scenarios where a backend's code could leak (misconfigured logging, an SSRF-adjacent bug) independent of the client secret's own security.
3. **PKCE vs `state`.** PKCE closes the code-interception/injection gap; it does not replace the `state` parameter's CSRF-mitigation role in the authorization redirect. Continue sending and validating `state` for application-level request/response binding even in a PKCE-mandatory flow.
