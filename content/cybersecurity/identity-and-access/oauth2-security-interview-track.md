---
title: "OAuth 2.0, OIDC & Enterprise AppSec Defense Interview Track"
description: "SME evaluation on authorization code flow with PKCE, JWT signature validation vulnerabilities, cross-origin token theft, and OWASP API security top 10."
categorySlug: "identity-access"
articleType: "INTERVIEW_PREP"
level: "Staff"
durationMinutes: 420
---

# OAuth 2.0, OIDC & Enterprise AppSec Defense Interview Track

Welcome to the OAuth 2.0, OpenID Connect (OIDC) & Application Security Defense evaluation track. This module tests your expertise in enterprise identity architectures, cryptographic token validation, and offensive/defensive security engineering.

---

### Question 1: Why is PKCE (Proof Key for Code Exchange) mandatory for SPA and native clients, and how does it prevent Authorization Code Interception Attacks?

Think Prompt: Contrast standard Authorization Code flow with PKCE (`code_verifier` vs `code_challenge`), S256 hashing, and mitigation of malicious custom URI schemes.

Model Answer / Explanation:
1. Threat Vector: Public clients (Single Page Apps and Mobile Native Apps) cannot securely hide client secrets. Malicious apps registered on the same OS custom URI scheme (e.g. `myapp://oauth-callback`) can intercept the OAuth authorization code returned from the browser redirect.
2. PKCE Cryptographic Pair: The client generates a high-entropy random string `code_verifier` (43-128 chars) and computes `code_challenge = BASE64URL-ENCODE(SHA256(code_verifier))`.
3. Authorization Request: The client sends `code_challenge` and `code_challenge_method=S256` to `/authorize`. The Authorization Server records the challenge alongside the issued authorization code.
4. Token Exchange Verification: When redeeming the code at `/token`, the client submits `code_verifier`. The server hashes `code_verifier` with SHA256 and verifies it matches `code_challenge`. Even if an attacker intercepted the authorization code, they cannot obtain access tokens without the unhashed `code_verifier`.

Common Mistakes:
- Using `plain` transformation instead of `S256` for `code_challenge_method`
- Storing access tokens or code verifiers in unencrypted browser `localStorage`
- Allowing non-exact match wildcard redirect URIs on authorization servers

Related Concepts: PKCE, Code Verifier, S256, OAuth 2.0, Custom URI Schemes
Related Courses: oauth2-oidc-implementation-guide, owasp-top-10-llm-security, tls-x509-certificate-management

---

### Question 2: How do you defend against JWT Algorithm Confusion (`alg: none`, RS256 to HS256 downgrade) and Token Side-Jack Attacks?

Think Prompt: Analyze JWT header validation rules, public key distribution via JWKS (JSON Web Key Set), key ID (`kid`) sanitization, and HttpOnly SameSite cookies vs Bearer tokens.

Model Answer / Explanation:
1. Algorithm Confusion Vulnerability: In RS256, the server verifies tokens using an RSA public key. In HS256, the server uses a symmetric HMAC secret key. If a backend verifier uses the RSA public key string as the HMAC secret key when `alg: HS256` is specified in the header, attackers can sign forged tokens using the public key!
2. Strict Defense Protocol: Backend JWT validation logic must hardcode allowed signing algorithms (`verifier.WithAllowedAlgs([]string{"RS256", "ES256"})`). Reject tokens with `alg: none` or algorithms mismatched from key types.
3. JWKS Verification: Download RSA/ECDSA public keys from trusted `/.well-known/jwks.json` endpoints. Cache keys locally by `kid` header, enforcing strict URL whitelisting to prevent SSRF in key fetching.
4. Storage & Side-Jack Prevention: Store session tokens in `HttpOnly; Secure; SameSite=Strict` cookies instead of JavaScript-accessible local storage to mitigate Cross-Site Scripting (XSS) token exfiltration.

Common Mistakes:
- Dynamically selecting verification algorithms directly from untrusted JWT headers
- Trusting `kid` parameters containing SQL injection or directory traversal payloads (`../../dev/null`)
- Exposing sensitive user PII in unencrypted JWT payloads

Related Concepts: JWKS, Algorithm Confusion, RS256/HS256, HttpOnly Cookies, XSS Protection
Related Courses: oauth2-oidc-implementation-guide, tls-x509-certificate-management

---

### Question 3: How do you architect Broken Object Level Authorization (BOLA / IDOR) protection across microservice APIs?

Think Prompt: Evaluate Policy Enforcement Points (PEP), Policy Decision Points (PDP), Attribute-Based Access Control (ABAC), and Open Policy Agent (OPA).

Model Answer / Explanation:
1. Vulnerability Mechanics: BOLA (OWASP API #1) occurs when an endpoint accepts a resource ID (e.g. `GET /api/orders/99482`) without validating whether the authenticated user owns or has explicit permission to access that specific resource.
2. Architecture: Implement a Policy Enforcement Point (PEP) at the API Gateway / Service mesh level coupled with Policy Decision Points (PDP) using Open Policy Agent (OPA).
3. Rego Policy Enforcement: Pass identity context (tenant ID, user ID, roles) alongside resource ownership claims to OPA sidecars:

```rego
package api.authz

default allow = false

allow {
    input.user.tenant_id == input.resource.tenant_id
    input.user.id == input.resource.owner_id
}

allow {
    input.user.roles[_] == "admin"
}
```

4. Database Isolation: Enforce Row Level Security (RLS) in PostgreSQL (`CREATE POLICY tenant_isolation ON orders USING (tenant_id = current_setting('app.current_tenant'))`) to prevent data leaks even if application code bypasses check logic.

Common Mistakes:
- Relying exclusively on client-side UI routing checks to hide unauthorized resources
- Passing raw user IDs in HTTP request bodies without validating against authenticated JWT `sub` claims
- Neglecting multi-tenant isolation at the database layer

Related Concepts: BOLA, IDOR, OPA / Rego, Attribute-Based Access Control, Row Level Security
Related Courses: oauth2-oidc-implementation-guide, owasp-top-10-llm-security

---

### Question 4: How do you design secure Token Revocation and Distributed Session Termination across high-concurrency microservices?

Think Prompt: Contrast short-lived JWTs (5-15 mins) with Redis token blacklists, token introspection endpoints (RFC 7662), and back-channel logout (OIDC).

Model Answer / Explanation:
1. Token Lifecycle Architecture: Issue short-lived stateless JWT access tokens (5-15 minutes TTL) paired with long-lived sliding refresh tokens (7-30 days) stored securely in HTTP-only cookies.
2. Immediate Revocation Tier: Maintain a Redis Bloom Filter or distributed key-value store containing revoked `jti` (JWT ID) tokens or banned `user_id` timestamps. API gateways query Redis on incoming calls.
3. RFC 7662 Introspection: For high-security endpoints, query authorization servers via RFC 7662 Token Introspection (`POST /oauth/introspect`) to verify token active status in real time.
4. OIDC Back-Channel Logout: When a user logs out, the Identity Provider sends signed logout tokens (`logout_token`) directly to registered client back-channel endpoints, invalidating active refresh sessions across all integrated applications simultaneously.

Common Mistakes:
- Issuing long-lived stateless JWT access tokens (24 hours+) with no revocation mechanism
- Querying relational databases on every microservice API call, defeating the performance benefits of JWTs
- Failing to rotate refresh tokens upon usage (Refresh Token Rotation pattern)

Related Concepts: Token Revocation, RFC 7662, OIDC Back-Channel Logout, Redis Bloom Filter, Refresh Token Rotation
Related Courses: oauth2-oidc-implementation-guide, enterprise-application-security
