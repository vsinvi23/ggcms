---
title: "OAuth2, OIDC & JWT Interview Prep"
description: "SME interview track covering OAuth 2.0 grant types, OIDC identity semantics, JWT cryptography, and the specific attack/defense patterns — PKCE, DPoP, algorithm confusion, replay, token binding — that separate textbook knowledge from production-grade implementation."
categorySlug: "identity-access"
articleType: "INTERVIEW_PREP"
level: "Senior"
durationMinutes: 300
---

# OAuth2, OIDC & JWT Interview Prep

Welcome to the OAuth 2.0, OpenID Connect, and JSON Web Token evaluation track. This module tests whether you understand these protocols as security architecture, not just as SDK calls — where authorization ends and authentication begins, why certain flows exist for certain client types, and how a subtly wrong verification check turns a secure design into a forgeable one.

---

### Question 1: What is the actual difference between OAuth 2.0 and OIDC, and why can't OAuth 2.0 alone be used for authentication?

Think Prompt: Distinguish delegated authorization from federated authentication, and explain what the ID Token adds that an access token does not.

Model Answer / Explanation:
1. OAuth 2.0 is an **authorization** framework: it grants a client limited, scoped access to a resource on behalf of a user, expressed as an opaque or JWT-encoded **access token**. The access token's job is "what can the bearer do," not "who is the bearer" — the spec never mandates that access tokens are even readable or that they carry identity claims.
2. Before OIDC existed, developers still wanted "Login with Google"-style flows, so they abused OAuth 2.0 for authentication: get an access token, call the provider's `/userinfo`-style API, treat a successful call as "the user is authenticated." This is fragile — access tokens can be scoped for entirely different APIs, can be replayed by any party that obtains one, and carry no cryptographically bound proof of *when* or *for which client* authentication happened.
3. OpenID Connect (OIDC) is a thin identity layer on top of OAuth 2.0. It adds the **ID Token**, a JWT specifically intended for the client (not a resource server) that asserts identity: `sub` (subject/user id), `iss` (issuer), `aud` (must equal the client's own `client_id`), `iat`/`exp`, `auth_time`, and — critically — the `nonce` the client generated before the redirect, which the client checks matches to defend against replayed authorization responses.
4. Practical rule: access tokens are for calling APIs (resource servers should validate them, not the ID Token); ID tokens are for the client to establish "this browser session belongs to this user" and should never be sent onward as a bearer credential to a third API.

Common Mistakes:
- Sending the ID Token to a resource server as if it were an access token — resource servers should never accept ID Tokens as authorization credentials, because the `aud` claim identifies the client, not the API.
- Treating a successful OAuth token exchange (no ID Token, no OIDC) as proof of identity, when the flow was only ever authorization.
- Forgetting to validate `aud` on the ID Token, which lets a token issued for a different client's login be replayed against yours if the issuer is shared.

Related Concepts: OAuth 2.0 vs OIDC, ID Token, Access Token, nonce, Delegated Authorization vs Federated Authentication
Related Courses: oauth2-oidc-implementation-guide, oidc-vs-saml-enterprise-sso-tradeoffs, oidc-federated-identity-multi-tenant-sso

---

### Question 2: Walk through the Authorization Code Flow with PKCE end-to-end, and explain precisely why PKCE defeats authorization code interception even though the code itself is still exposed in the redirect.

Think Prompt: Contrast the confidential-client assumption in classic Authorization Code flow with the public-client reality of SPAs and native apps; trace `code_verifier` and `code_challenge` through the exact two HTTP legs where each appears.

Model Answer / Explanation:
1. Classic Authorization Code flow assumes the client can hold a `client_secret` in confidence (a server-side web app). Public clients — SPAs, mobile apps — cannot: the secret would ship inside a JS bundle or an APK, both extractable. PKCE (RFC 7636) replaces the static secret with a **per-flow, ephemeral** secret.
2. Before redirecting, the client generates `code_verifier` — a high-entropy random string (43-128 chars) — kept only in memory, never transmitted. It derives `code_challenge = BASE64URL(SHA256(code_verifier))` and sends only the challenge in the authorization request.

```go
func GenerateVerifier() (string, error) {
    buf := make([]byte, 32)
    if _, err := rand.Read(buf); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(buf), nil // 43-char verifier
}

func DeriveChallenge(verifier string) string {
    sum := sha256.Sum256([]byte(verifier))
    return base64.RawURLEncoding.EncodeToString(sum[:])
}
```

3. `GET /authorize?...&code_challenge=<challenge>&code_challenge_method=S256` — the authorization server stores the challenge alongside the authorization code it eventually issues. This leg is the one an attacker on a shared redirect URI scheme (`myapp://callback`) or a network observer can see; the challenge is a one-way hash, so seeing it reveals nothing about the verifier.
4. The redirect back to the client carries the authorization code in the clear — this is the leg PKCE does **not** hide. If an attacker intercepts this redirect (malicious app registered on the same custom URI scheme, or a referrer leak), they now hold a valid, unused authorization code.
5. The legitimate client redeems the code at `POST /token`, submitting `code_verifier` for the first time. The server recomputes `SHA256(code_verifier)` and checks it equals the stored `code_challenge`. An attacker who only intercepted the code has no way to produce the matching verifier — it was never transmitted, and SHA256 isn't invertible — so their redemption attempt is rejected even though they possess a "valid" code.
6. The key insight: PKCE doesn't stop code interception, it makes an intercepted code **useless** by requiring proof of a secret that never crossed the network until the final, TLS-protected token exchange.

Common Mistakes:
- Using `code_challenge_method=plain` (verifier == challenge), which reduces PKCE to "send the secret twice" and provides zero protection if the interception point can see both legs.
- Believing PKCE replaces the `state` parameter — PKCE defends the code-redemption leg against a different attacker (code interception on public clients); `state` defends against login CSRF/authorization-response injection. Production systems use both.
- Registering wildcard or pattern-matched redirect URIs on the authorization server, which lets an attacker redirect the code to an endpoint they control regardless of PKCE.

Related Concepts: PKCE, code_verifier, code_challenge, S256, Public vs Confidential Clients
Related Courses: oauth2-pkce-authorization-code-flow, oauth21-pkce-mandatory-authorization-code, oauth2-authorization-code-flow-state-machine, oauth2-oidc-implementation-guide

---

### Question 3: How does the `state` parameter defend against OAuth login CSRF, and how is that threat different from what PKCE defends against?

Think Prompt: Construct the concrete attack scenario where a valid authorization code gets linked to the wrong victim's session, and explain the session-binding mechanism that closes it.

Model Answer / Explanation:
1. Attack scenario: an attacker starts the OAuth flow themselves, authenticates with their own third-party credentials, and intercepts (or simply captures) their own callback URL `https://client.app/callback?code=ATTACKER_CODE`. They then trick a logged-in victim into visiting that exact URL (a link, an auto-submitting form, an `<img>`/redirect trick). The victim's browser sends the request; the client app exchanges the code and links the **attacker's** third-party identity to the **victim's** session — a form of account takeover or data-linking, distinct from stealing the victim's own tokens.
2. Defense: before redirecting to the authorization server, the client generates a cryptographically random `state` value and binds it to the current browser session via an `HttpOnly; Secure; SameSite` cookie (short TTL, e.g. 5 minutes).

```http
HTTP/1.1 302 Found
Location: https://auth.provider.com/authorize?...&state=xyz123
Set-Cookie: oauth_state=xyz123; HttpOnly; Secure; SameSite=Lax; Max-Age=300
```

3. On callback, the server compares the `state` query parameter against the cookie value using a constant-time comparison (`secrets.compare_digest` in Python, or equivalent) to avoid a timing side-channel that could let an attacker guess it byte-by-byte.
4. Because the attacker's crafted URL carries the attacker's own `state` value, and the victim's browser will present the victim's own `oauth_state` cookie (set during whatever flow the victim last initiated, or none at all), the comparison fails and the exchange is aborted.
5. Distinction from PKCE: `state` proves "this authorization response corresponds to a request *this browser* initiated" — it defends against cross-session code injection. PKCE proves "this client redeeming the code is the same client the code was issued to" — it defends against a different party intercepting and redeeming the code at all. Neither substitutes for the other.

Common Mistakes:
- Comparing `state` with a plain `==`/string-equality check instead of a constant-time comparison.
- Storing `state` in a long-lived or non-`HttpOnly` cookie, allowing XSS to read and forge it.
- Assuming PKCE alone (common on public clients) removes the need for `state` — PKCE and `state` protect against different attackers and should both be present.

Common Mistakes (continued): omitting cookie invalidation after use, which permits replay of the same state value within its TTL window.

Related Concepts: state Parameter, Login CSRF, Constant-Time Comparison, Session Binding
Related Courses: oauth2-state-parameter-csrf-defense, oauth2-authorization-code-flow-state-machine, saml-relaystate-open-redirect-prevention

---

### Question 4: Explain the JWT algorithm confusion attack (RS256-to-HS256 downgrade) in full mechanical detail, and show the exact server-side check that closes it.

Think Prompt: Explain why a public key being "public" is precisely what makes it dangerous when misused as an HMAC secret, and identify the single library call that prevents it.

Model Answer / Explanation:
1. RS256 is asymmetric: the authorization server signs with a **private** key; verifiers hold only the corresponding **public** key (typically fetched from JWKS) and use it purely to verify, never to sign. HS256 is symmetric: the same secret both signs and verifies, so anyone holding it can forge tokens.
2. The vulnerability arises when a verification library reads the `alg` field from the token's own (attacker-controlled, unverified-at-that-point) header and dynamically dispatches its verification routine based on it. If it supports both algorithms and treats whatever key material it's configured with generically, an attacker can:
   - Take the server's public RSA key (by definition public — obtainable from `/.well-known/jwks.json`).
   - Craft a forged token with `alg: HS256` in the header and arbitrary claims (e.g. `role: admin`) in the payload.
   - Sign it using **HMAC-SHA256 with the RSA public key's raw bytes as the HMAC secret**.
   - If the verifier calls `hmac_verify(token, publicKeyBytes)` because the header said `HS256`, the signature checks out — the attacker forged a token the server accepts, using only public information.
3. The fix is to never let the token pick its own verification algorithm. Pin the expected algorithm(s) server-side and reject anything else outright:

```go
token, err := jwt.ParseWithClaims(tokenStr, claims, keyfunc,
    jwt.WithValidMethods([]string{"RS256"}), // rejects alg:none and HS256 downgrade outright
    jwt.WithIssuer(issuer),
    jwt.WithAudience(audience),
)
```

```python
payload = jwt.decode(
    token_string,
    signing_key.key,
    algorithms=['RS256'],  # CRITICAL: never derive this list from the token itself
    audience='my-microservice'
)
```

4. This single constraint also closes the related `alg: none` signature-stripping attack, where an attacker strips the signature entirely, sets `alg: none`, and relies on a verifier that treats "no signature required" as a legitimate, header-driven choice.

Common Mistakes:
- Configuring a verification library with "both RS256 and HS256 supported" and a single key material value shared across both code paths.
- Reading and trusting claims before signature verification completes (order matters: parse structure, verify signature with a fixed algorithm, only then trust claims).
- Assuming disabling `none` is a library default — it must be explicitly and consistently enforced across every service that verifies tokens.

Related Concepts: Algorithm Confusion, RS256 vs HS256, JWKS, alg:none, Signature Stripping
Related Courses: jwt-asymmetric-rs256-vs-symmetric-hs256, jwt-signature-stripping-none-algorithm, jwt-kid-header-injection-attacks, oauth2-oidc-implementation-guide

---

### Question 5: A JWT header includes a `kid` field. Why does this matter for verification, and what injection risks does the `kid` value itself introduce?

Think Prompt: Trace how `kid` is used to select verification key material, and what happens if that selection logic treats `kid` as a trusted file path, URL, or query parameter rather than an opaque lookup key.

Model Answer / Explanation:
1. `kid` (Key ID) exists to support key rotation without downtime: an authorization server can publish multiple public keys simultaneously in its JWKS response, each tagged with a `kid`, sign new tokens with the newest private key, and let verifiers pick the correct public key for each token without a synchronized cutover.

```json
{
  "keys": [
    { "kid": "key-2023-10-27", "n": "...old modulus...", ... },
    { "kid": "key-2024-01-15", "n": "...new modulus...", ... }
  ]
}
```

2. Verification flow: decode the (unverified) header, read `kid`, look up the matching public key in a locally cached JWKS response (keyed by `kid`), then verify the signature with that specific key. A short cache TTL (minutes, not hours) lets a compromised key be pulled from rotation quickly.
3. The injection risk: `kid` is attacker-controlled input, since it comes from the token header before verification. Implementations that treat `kid` as more than an opaque cache-lookup key have been exploited in the wild via:
   - **Path traversal**: `kid: "../../dev/null"` where the verifier constructs a filesystem path from `kid` to load a key file — `/dev/null` reads as an empty key, and some HMAC implementations will happily "verify" against an empty secret.
   - **SQL injection**: `kid` used directly in a database query to fetch a key record.
   - **SSRF**: `kid` (or a related `jku`/`x5u` header) used to construct a URL the server fetches keys from, letting an attacker point verification at a server-controlled JWKS endpoint they host, tricking the verifier into trusting a key they generated themselves.
4. Correct treatment: `kid` should only ever index into a pre-fetched, allow-listed set of keys from a JWKS URL the server operator configured — never used to build a path, query, or fetch target derived from the token itself.

Common Mistakes:
- Allowing the `jku` (JWK Set URL) or `x5u` (X.509 URL) header to specify an arbitrary fetch target instead of requiring it match a strict allow-list of trusted issuer domains.
- Using string concatenation to build a key-file path from `kid` without sanitization.
- Failing to cap `kid` length/charset, allowing oversized or malformed values into downstream systems that don't expect them.

Related Concepts: kid Header, JWKS Key Rotation, Path Traversal, SSRF via jku/x5u
Related Courses: jwt-kid-header-injection-attacks, jwt-jku-header-injection-jwks-url, jwt-asymmetric-rs256-vs-symmetric-hs256

---

### Question 6: JWTs are stateless by design — no server-side lookup needed to validate them. Given that, how do you actually revoke a JWT before its natural expiry, and how do you defend against replay of a token that hasn't expired?

Think Prompt: Separate two distinct problems that look similar — "this specific token must stop working now" (revocation) vs "this exact token must not be usable twice" (replay) — and give the mechanism for each.

Model Answer / Explanation:
1. Revocation problem: a user logs out, or an admin needs to kill a session, but the JWT itself remains cryptographically valid (signature checks out, `exp` hasn't passed) for however long its TTL says. Pure stateless validation has no way to know the token "shouldn't count anymore."
2. Revocation fix — tiered approach:
   - Keep access token TTLs short (5-15 minutes) so any revocation gap is naturally bounded.
   - Maintain a distributed denylist (Redis) of revoked `jti` values or user IDs, checked by the API gateway/resource server on each request, with entries TTL'd to the token's own remaining lifetime so the store never grows unbounded.
   - For high-security paths, use RFC 7662 Token Introspection (`POST /oauth/introspect`) to ask the authorization server for real-time active/inactive status instead of relying purely on local signature checks.
   - For federated logout across multiple relying parties, OIDC back-channel logout pushes a signed `logout_token` directly to each client's registered back-channel endpoint.
3. Replay problem: even an unexpired, non-revoked, correctly-signed token can be maliciously reused if an attacker captured it in transit, from logs, or via XSS. Revocation denylists solve "kill this session," not "this single request already happened once and shouldn't happen again."
4. Replay fix — `jti` single-use tracking: stamp every token with a unique `jti` at issuance; the first time a resource server accepts a `jti`, record it with a TTL equal to `exp - now`; reject any subsequent request presenting the same `jti`.

```javascript
const isUnique = await redisClient.set(`jti:${jti}`, 'used', {
    EX: ttl,   // seconds remaining until the token's own expiry
    NX: true   // atomic check-and-set: only succeeds if key doesn't exist
});
if (!isUnique) {
    return res.status(401).json({ error: 'Token has already been used (Replay attack detected)' });
}
```

5. `NX` is load-bearing: it makes the check-and-set atomic. A naive `GET` (does `jti` exist?) followed by a separate `SET` has a TOCTOU race — two concurrent requests carrying the same replayed token could both pass the existence check before either writes the key.
6. On the OIDC login handshake specifically (not API calls), a separate `nonce` claim — generated by the client, persisted client-side, echoed back in the ID token — defends against a replayed *authorization response* rather than a replayed *API request*; it is not a substitute for `jti` tracking at the API layer.

Common Mistakes:
- Treating a Redis-backed revocation denylist as also solving replay — they answer different questions ("is this session dead" vs "has this exact token been used before").
- Implementing the `jti` uniqueness check as separate `GET`+`SET` calls instead of an atomic `SET ... NX`.
- Storing `jti` entries with no TTL, causing unbounded growth in the revocation/replay store.
- Treating cache unavailability as fail-open ("if Redis is down, just let requests through") for high-value endpoints — it should fail closed.

Related Concepts: Token Revocation, RFC 7662 Introspection, jti, Replay Attacks, OIDC Back-Channel Logout
Related Courses: jwt-token-revocation-redis-blacklist, jwt-replay-attacks-jti-nonce-tracking, oauth2-token-introspection-rfc7662, oauth2-refresh-token-rotation

---

### Question 7: Why isn't a short access token lifetime sufficient protection against refresh token theft, and how does refresh token rotation with reuse detection close that gap?

Think Prompt: Separate what a short access-token TTL limits (blast radius of one stolen token) from what it does nothing about (an attacker who holds the longer-lived credential that mints new ones).

Model Answer / Explanation:
1. Access tokens are deliberately short-lived (minutes) precisely because they're used on every API call and thus have more exposure surface (logs, proxies, browser memory). Refresh tokens are long-lived (days to weeks) by design, so users aren't forced to re-authenticate constantly.
2. If an attacker exfiltrates a refresh token (XSS, compromised device, a logged request), a short access-token TTL only limits how long any *one* stolen access token remains useful — it does nothing to stop the attacker from using the stolen refresh token to mint fresh access tokens indefinitely, for as long as the refresh token itself remains valid.
3. Refresh Token Rotation fixes this: each refresh token is single-use. Redeeming `refresh_token_A` returns a new access token **and** a new `refresh_token_B`, immediately invalidating A.

```
Legitimate client:  refresh_token_A -> access_token + refresh_token_B (A now REVOKED)
                     refresh_token_B -> access_token + refresh_token_C (B now REVOKED)

Attacker replays refresh_token_A (already used once, legitimately):
                     refresh_token_A -> server sees A was ALREADY redeemed
                                      -> REUSE DETECTED
                                      -> entire token family (A, B, C, ...) revoked
                                      -> legitimate user forced to re-authenticate
```

4. The reuse-detection signal is exactly what makes rotation more than "shorter refresh TTL": if the *same* refresh token is ever presented twice, the server cannot tell whether the legitimate client or an attacker holds the extra copy — so the only safe response is to revoke the entire chain descending from that token, invalidating everything the attacker (or the legitimate client, if compromise is a false positive) could have derived from it.
5. This is a second, distinct control from the access-token/refresh-token TTL split: TTL limits exposure duration of any single credential; rotation-with-reuse-detection catches theft of the credential that mints the short-lived ones. Production systems need both — neither substitutes for the other.

Common Mistakes:
- Issuing refresh tokens that are reusable (not rotated on each redemption), which removes any signal that theft has occurred until the token's own long expiry.
- Rotating tokens without reuse detection — silently issuing a new refresh token on each use without checking whether the presented one was already spent misses the theft signal entirely.
- Revoking only the single reused token instead of the entire family, leaving a still-valid descendant token usable by whichever party (attacker or legitimate client) holds it.

Related Concepts: Refresh Token Rotation, Reuse Detection, Access Token TTL, Token Family Revocation
Related Courses: oauth2-refresh-token-rotation, jwt-token-revocation-redis-blacklist, spa-token-storage-httponly-refresh-rotation

---

### Question 8: How does DPoP (RFC 9449) turn a bearer token into a sender-constrained token, and why doesn't stealing the access token help an attacker anymore?

Think Prompt: Identify exactly which artifact binds the token to a specific client, where that binding is checked, and why theft of the access token alone is insufficient to replay it.

Model Answer / Explanation:
1. Standard OAuth bearer tokens behave like cash: whoever holds the token can present it and be granted access — the resource server has no cryptographic way to distinguish the legitimate client from anyone who obtained a copy (XSS exfiltration, MITM, log leakage, localStorage read).
2. DPoP fixes this by requiring the client to generate an ephemeral asymmetric key pair (kept in memory, ideally in a secure enclave like WebCrypto) and prove possession of the **private** key on every relevant request via a signed JWT called the DPoP proof.
3. At token issuance, the client's DPoP proof (signed with its private key, carrying its public key in JWK format) accompanies the token request. The authorization server computes the SHA-256 thumbprint of that public key and embeds it in the issued access token as a confirmation claim:

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com",
  "cnf": { "jkt": "0ZcOCORZNYy-DWpqq30jZyJGHTN0d2HglBV3uiguA4I" }
}
```

4. On every subsequent API call, the client must generate a **new** DPoP proof for that specific request (signing with the same private key) and send both the access token (now typed `DPoP`, not `Bearer`) and the fresh proof:

```http
GET /user/data HTTP/1.1
Authorization: DPoP eyJhbGciOiJSUzI1... [access token]
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIs... [proof for THIS request]
```

5. Resource server verification: check the access token's standard claims; extract `cnf.jkt`; verify the DPoP proof's own signature using the public key embedded within it; hash that public key and confirm it matches `cnf.jkt` exactly; and confirm the proof's bound HTTP method and URL match the actual request, preventing a captured proof from being replayed against a different endpoint.
6. Because the private key never leaves client memory and cannot be extracted by an XSS payload that only reads storage/cookies, an attacker who steals the access token in transit or via exfiltration still cannot produce a valid, freshly-signed DPoP proof — the token alone is inert.

Common Mistakes:
- Treating DPoP as equivalent to mTLS — DPoP is an application-layer binding requiring no network-layer client certificate infrastructure, which is exactly its appeal for SPAs where mTLS is impractical.
- Reusing the same DPoP proof across multiple requests instead of minting one per request/method/URL combination, which reintroduces a narrow replay window.
- Forgetting to check the proof's method/URL binding, allowing a proof captured for one endpoint to be replayed against another that accepts the same access token.

Related Concepts: DPoP, Sender-Constrained Tokens, cnf.jkt, Bearer Token Theft, RFC 9449
Related Courses: oauth2-dpop-proof-of-possession, oauth2-mtls-certificate-bound-tokens, jwt-token-leakage-url-query-parameters

---

### Question 9: Client Credentials Grant is used for machine-to-machine (M2M) auth with no user in the loop. What does that change about token validation, and what's the most common misconfiguration that breaks tenant isolation in this grant?

Think Prompt: Consider what claims exist (and don't) in a client-credentials-issued token compared to a user-delegated one, and where authorization decisions must move as a result.

Model Answer / Explanation:
1. In the Client Credentials Grant, the client authenticates directly to the token endpoint with its own credentials (`client_id`/`client_secret`, or better, a signed JWT assertion per RFC 7523) and receives an access token representing the **client itself**, not any user — there is no `sub` claim tied to an end user, no consent screen, no authorization code.
2. Because there's no user context, all authorization logic downstream must be driven by the client's own identity and granted scopes (`aud`, `scope`, possibly a `client_id` claim), not by assumptions carried over from user-delegated flows (e.g. checking `sub == resource.owner_id`, which simply doesn't apply here).
3. The most common production misconfiguration: a single M2M client is granted a scope broad enough to act across multiple tenants (e.g. a background job service with one shared `client_id` for all tenants), and the resource server trusts the token's scope claim alone without an additional tenant-context check (often passed out-of-band, e.g. a signed tenant claim or a separate mTLS-bound identity per tenant). This collapses tenant isolation: any caller holding that one M2M token can act against any tenant's data.
4. Correct pattern: issue **per-tenant** M2M clients (or embed a verified, non-forgeable tenant claim in the token via a custom claim the resource server explicitly checks), and enforce that check the same way user-delegated authorization enforces `tenant_id` matching — never assume M2M tokens are inherently "trusted for everything" just because there's no end user to fool.

Common Mistakes:
- Assuming M2M tokens don't need audience/scope validation because "it's just a service calling another service."
- Sharing one client_credentials client across multiple tenants or environments (dev/staging/prod) without dedicated scopes per boundary.
- Using long-lived client secrets with no rotation plan, since compromise of an M2M secret grants standing access with no user-driven detection signal (no login anomaly, no unusual device).

Related Concepts: Client Credentials Grant, M2M Authentication, RFC 7523 JWT Bearer, Tenant Isolation
Related Courses: oauth2-client-credentials-grant-m2m, oauth2-jwt-bearer-profile-rfc7523, rbac-vs-abac-policy-decision-points-microservices

---

### Question 10: What's wrong with storing access and refresh tokens in browser `localStorage`, and what's the recommended alternative for SPAs — including the trade-off it introduces?

Think Prompt: Identify the specific class of attack `localStorage` is exposed to that `HttpOnly` cookies are not, and what new attack surface cookie-based storage reintroduces in exchange.

Model Answer / Explanation:
1. `localStorage` (and `sessionStorage`) is fully readable by any JavaScript running in the page's origin — including injected script from a successful XSS attack. A single stored-XSS vulnerability anywhere in the SPA's dependency tree (a compromised npm package, an unsanitized user-generated content field) lets an attacker's script simply read `localStorage.getItem('access_token')` and exfiltrate it wholesale — no network interception needed.
2. The standard mitigation is to keep tokens out of any JavaScript-readable storage and instead rely on `HttpOnly; Secure; SameSite=Strict` cookies, set by the server, which browsers attach automatically to same-site requests but which JavaScript cannot read via `document.cookie` even if XSS is present.
3. Trade-off: moving to cookie-based storage reintroduces **CSRF** exposure, since cookies are sent automatically by the browser regardless of which site initiated the request. `SameSite=Strict` (or at minimum `Lax`) substantially mitigates this by refusing to attach the cookie to cross-site requests, but a defense-in-depth design still pairs cookie-based token storage with an explicit anti-CSRF token or the OAuth `state`-style pattern for any state-changing request.
4. A common hybrid: keep the short-lived access token in memory only (a JS variable, lost on page reload, never persisted) and keep the refresh token in an `HttpOnly` cookie scoped to the token-refresh endpoint only (`Path=/oauth/token`) — this minimizes both the XSS exfiltration surface (nothing durable to read) and the CSRF surface (the cookie is useless outside the one endpoint it's scoped to).

Common Mistakes:
- Believing `HttpOnly` cookies eliminate XSS risk entirely — XSS can still perform actions *as* the authenticated user via automatic cookie attachment (a CSRF-shaped consequence of XSS), even though it can't read the token value directly.
- Setting refresh-token cookies without `Path` scoping, making them ambiently sent to every endpoint on the domain rather than just the refresh endpoint.
- Omitting `SameSite` entirely, defaulting to browser behavior that may allow more cross-site attachment than intended.

Related Concepts: XSS Token Theft, HttpOnly Cookies, SameSite, CSRF Trade-off, SPA Token Storage
Related Courses: spa-token-storage-httponly-refresh-rotation, jwt-token-leakage-url-query-parameters, session-hijacking-and-fixation-attacks

---

### Question 11: Explain the OAuth 2.0 Device Authorization Grant — what problem does it solve, and what's the specific abuse scenario ("device code phishing") it's vulnerable to if implemented carelessly?

Think Prompt: Identify why input-constrained devices (smart TVs, CLI tools) can't use a redirect-based flow, and walk through how an attacker can trick a user into authorizing a session the attacker controls.

Model Answer / Explanation:
1. Devices with no browser or limited input (smart TVs, IoT devices, CLI tools) can't receive an HTTP redirect or easily let a user type a `client_secret`. The Device Authorization Grant (RFC 8628) solves this by having the device request a `device_code` and a short, human-typeable `user_code` from the authorization server, then display the `user_code` and a URL (e.g. `https://example.com/device`) for the user to visit on a *separate* device (phone, laptop).
2. The device polls the token endpoint with its `device_code` at an interval; once the user visits the URL on their separate device, enters the `user_code`, and approves the request, the next poll returns tokens.
3. Abuse scenario — "device code phishing": an attacker initiates their own device flow (against the real, legitimate authorization server) and obtains a valid `user_code` and verification URL. The attacker then sends this to a victim via a phishing email or fake support call, framed as something benign ("enter this code to verify your account"). If the victim visits the real URL and enters the code, they are — unknowingly — authorizing the *attacker's* device session, since the device_code/user_code pair belongs to whatever device initiated the flow, not to the victim's session.
4. This is structurally similar to the classic OAuth login-CSRF pattern (Question 3), but the attacker doesn't need to intercept anything — the flow's own design (a shareable short code) is the attack surface.
5. Mitigations: display a clear, specific confirmation of what's being authorized (application name, requested scopes) at the verification URL rather than a generic "enter code" screen; keep the polling interval and `user_code` TTL short (typically minutes) to shrink the phishing window; and, where feasible, require an additional out-of-band signal (e.g. displaying a partial code or icon on the *initiating* device that the user must visually match against the verification page) so a purely-copied code without visual context is less convincing.

Common Mistakes:
- Making the verification page look identical to a generic "enter this code" form with no context about what application or scope is being granted, which is exactly what makes the phishing pretext believable.
- Setting long `user_code`/`device_code` TTLs "for user convenience," which extends the attacker's phishing window.
- Assuming device flow is inherently safe because "it requires user approval" — approval without adequate context is not meaningful consent.

Related Concepts: Device Authorization Grant, RFC 8628, Device Code Phishing, Out-of-Band Confirmation
Related Courses: oauth2-device-authorization-grant, oauth2-state-parameter-csrf-defense

---

### Question 12: JWT claims validation is more than checking a signature. Walk through the `iss`, `aud`, and `exp` boundary checks specifically, and describe a realistic scenario where signature-valid tokens are still accepted by the wrong service due to missing one of them.

Think Prompt: Consider a shared identity provider serving multiple client applications and multiple resource server APIs, and trace what a verifier that skips `aud` checking would accept that it shouldn't.

Model Answer / Explanation:
1. Signature verification proves a token was issued by a key holder your service trusts and hasn't been tampered with. It says nothing about whether the token was **intended** for this specific service, or whether it's still within its **validity window** — those are separate claim checks that must run after signature verification succeeds.
2. `iss` (issuer): confirms the token was issued by the specific authorization server your service trusts, not merely "a" server whose public key happens to be in your JWKS cache (relevant when multiple issuers' keys are cached together, e.g. multi-tenant identity federation).
3. `aud` (audience): confirms the token was minted for **this** API/client, not a sibling one. Scenario: a shared IdP serves both `payments-api` and `reporting-api`. A user authenticates once and receives an access token with `aud: "reporting-api"`. If `reporting-api`'s middleware skips the `aud` check (because the signature already validates against the shared IdP's key), any token minted for *any* audience under that IdP — including ones intentionally scoped narrower, like a low-privilege reporting-only token — would also be blindly accepted by `payments-api` if it made the same mistake, effectively defeating the entire purpose of scoping tokens per-audience.
4. `exp` (expiration) / `iat` (issued-at) / `nbf` (not-before): bound the token's validity window in time. Skipping `exp` checking (rare, but seen in hand-rolled decoders that only check signature) means a token remains "valid" forever from the verifier's point of view, regardless of the issuer's intended TTL.
5. Concretely, in a Go verifier this is expressed as explicit options passed alongside signature/algorithm pinning, not left as an afterthought:

```go
token, err := jwt.ParseWithClaims(tokenStr, claims, keyfunc,
    jwt.WithValidMethods([]string{"RS256"}),
    jwt.WithIssuer(issuer),
    jwt.WithAudience(audience),
)
```

6. The general principle: signature validity answers "was this token forged," while `iss`/`aud`/`exp` answer "was this token issued by the right party, for the right purpose, and is it still current" — all three are independent boundary checks and a verifier must run all of them, not just the cryptographic one.

Common Mistakes:
- Verifying signature and stopping there, treating "signature valid" as synonymous with "token acceptable."
- Checking `aud` as a substring/contains match instead of exact equality, letting `aud: "reporting-api-internal"` pass a check intended for `aud: "reporting-api"`.
- Trusting `exp` from the payload without also checking `nbf`/`iat` sanity (e.g. a token whose `iat` is implausibly far in the future, suggesting clock skew abuse or a forged claim).

Related Concepts: iss/aud/exp Validation, Claims Boundary Checks, Multi-Tenant Token Scoping
Related Courses: jwt-claims-boundary-validation-iss-aud, jwt-asymmetric-rs256-vs-symmetric-hs256, oauth2-oidc-implementation-guide
