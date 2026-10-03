---
title: "Cybersecurity & AppSec Interview Prep"
description: "SME evaluation on OWASP-class vulnerabilities — SQL injection, IDOR, SSRF, XSS, CSRF, JWT trust boundaries, password storage, and rate limiting — with real vulnerable/secure code pairs and production-grade defenses."
categorySlug: "appsec-threats"
articleType: "INTERVIEW_PREP"
level: "Mid-Senior"
durationMinutes: 300
---

# Cybersecurity & AppSec Interview Prep

Welcome to the Cybersecurity & Application Security evaluation track. This module tests your ability to recognize, exploit-reason-about, and remediate the vulnerability classes that dominate real-world breaches — from classic SQL injection through modern SSRF/DNS-rebinding and JWT trust-boundary failures.

---

### Question 1: Why does parameterizing a SQL query defeat injection, and why isn't "escaping quotes" an equivalent defense?

Think Prompt: Consider how the database engine's query planner treats a prepared statement's placeholders versus a concatenated string, and what an escaping-based blocklist misses (encoding quirks, second-order injection, ORM raw-query escape hatches).

Model Answer / Explanation:
1. Root Cause: SQL injection exists because concatenating user input into a query string collapses the distinction between "code" (the SQL command) and "data" (the value). The database parses whatever text arrives, so `admin' OR '1'='1` is indistinguishable from a legitimate value once concatenated.
2. Why Escaping Fails: Escaping is an allowlist/blocklist arms race — an attacker who finds a database-specific encoding, a multi-byte character quirk, or a second-order path (data written safely once, then reused unescaped in a later query) breaks it. It also does nothing for structural injection (e.g., injecting into an `ORDER BY` column name).
3. Why Parameterization Works: A prepared statement sends the query *structure* to the database first; the engine compiles a query plan with placeholders before the untrusted value is ever transmitted. The value is bound afterward strictly as a data literal, so it is architecturally impossible for it to be reinterpreted as SQL syntax, regardless of its content.
4. The ORM Trap: `sequelize.query(rawSQL)` or SQLAlchemy's `.text()` are just as vulnerable as hand-written SQL if you concatenate into them — parameterization is a property of *how* the query is executed, not of using an ORM.

```javascript
// VULNERABLE — string concatenation
const query = `SELECT id, email, role FROM users WHERE username = '${username}'`;
db.query(query, (err, results) => res.json(results));

// SECURE — parameterized placeholder
const query = `SELECT id, email, role FROM users WHERE username = ?`;
db.query(query, [username], (err, results) => res.json(results));
```

Common Mistakes:
- Believing input sanitization (stripping quotes) is sufficient instead of parameterizing
- Using an ORM's raw/`.text()` escape hatch with string concatenation, assuming the ORM protects it automatically
- Granting the application's DB account access to `information_schema`/`pg_catalog`, widening the blast radius even after fixing the injection point

Related Concepts: Parameterized Queries, Prepared Statements, UNION-Based SQLi, Blind SQL Injection, Least-Privilege DB Accounts
Related Courses: sql-injection-fundamentals-exploitation-and-defense, blind-sql-injection-boolean-time-based-exploitation, cybersecurity-fundamentals-from-scratch

---

### Question 2: An API endpoint uses parameterized queries and requires authentication, yet users can still read each other's invoices by changing the URL's numeric ID. What's wrong, and how do you fix it?

Think Prompt: Distinguish *authentication* ("who are you") from *authorization* ("what are you allowed to touch"). Consider sequential vs. unguessable identifiers and where the tenant/ownership check must live.

Model Answer / Explanation:
1. The Flaw: This is Insecure Direct Object Reference (IDOR), a sub-class of Broken Access Control. The handler correctly checks that a session exists, but the query `SELECT * FROM invoices WHERE id = ?` never verifies that the authenticated user *owns* that invoice — it fetches by ID alone, so any authenticated attacker can enumerate `10000..10100` and exfiltrate every tenant's records.
2. Fix Part 1 — Indirect References: Replace sequential integer keys exposed to the public API with high-entropy identifiers (UUIDv4). This doesn't fix the authorization bug, but it eliminates cheap enumeration — an attacker can no longer *guess* the next valid ID.
3. Fix Part 2 — Contextual Authorization (the real fix): Add the authenticated tenant/user to the `WHERE` clause itself, so the database can never return a row the requester doesn't own.
4. Fix Part 3 — Avoid Existence Oracles: When the object exists but belongs to someone else, return `404 Not Found` rather than `403 Forbidden`. A 403 confirms the resource exists under that ID, letting an attacker map the ID space even without reading the data.

```python
# VULNERABLE — ID-only lookup, no ownership check
cursor.execute("SELECT id, amount, billing_address, tenant_id FROM invoices WHERE id = ?", (invoice_id,))

# SECURE — contextual query + UUID + existence-oracle-safe response
try:
    validated_uuid = str(uuid.UUID(invoice_uuid))
except ValueError:
    return jsonify({"error": "Invalid resource identifier format."}), 400

cursor.execute(
    "SELECT id, amount, billing_address, tenant_id FROM invoices WHERE id = %s AND tenant_id = %s",
    (validated_uuid, g.tenant_id),
)
invoice = cursor.fetchone()
if not invoice:
    return jsonify({"error": "Resource not found or unauthorized access."}), 404
```

Common Mistakes:
- Treating "user is logged in" as equivalent to "user is authorized for this specific object"
- Switching to UUIDs and considering the vulnerability closed, without adding the tenant/ownership predicate to the query
- Returning 403 for unauthorized-but-existing resources, which leaks existence information to an attacker probing the ID space

Related Concepts: Broken Access Control, Horizontal Privilege Escalation, Tenant Isolation, Object-Level Access Control, Existence Oracles
Related Courses: idor-real-api-tenant-isolation, idor-cryptographic-id-obfuscation, broken-access-control-api-endpoints, api-authentication-vs-authorization-bola-bopla

---

### Question 3: Your application fetches a user-supplied URL server-side to generate a "link preview." An attacker sends `url=http://169.254.169.254/latest/meta-data/iam/security-credentials/admin-role` and gets back AWS IAM credentials. Walk through the full defense — why a hostname allowlist alone is insufficient.

Think Prompt: Think about the gap between "the hostname you validated" and "the IP address the socket actually connects to," and where in the request lifecycle that gap can be reopened by an attacker-controlled DNS server.

Model Answer / Explanation:
1. The Vulnerability Class: This is Server-Side Request Forgery (SSRF). The server sits in a privileged network position (VPC access, relaxed inbound firewall rules from trusted internal nodes) and blindly follows a user-supplied URL, so the attacker turns the trusted server into their proxy — reaching cloud metadata endpoints, internal Redis instances, or admin panels that assume "any traffic from inside the VPC is safe."
2. Why Naive Allowlisting Fails: A regex or domain blocklist against the *literal string* the user supplied doesn't stop decimal/octal IP encodings, open redirects, or attacker-controlled DNS names (`evil.example.com` resolving to `169.254.169.254`).
3. The DNS Rebinding / TOCTOU Gap: Even if you resolve the hostname and check the IP *before* connecting, an attacker's DNS server can return a safe public IP for that check, then re-resolve to an internal IP moments later when the actual HTTP client performs its own independent lookup at connect time — a classic Time-of-Check to Time-of-Use race.
4. The Fix — Close the Gap in One Call: Perform DNS resolution and IP validation, then dial that *exact* validated IP directly in the same `DialContext`, so there is no second resolution for a rebinding attacker to hit.

```go
transport := &http.Transport{
    DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
        host, port, err := net.SplitHostPort(addr)
        if err != nil {
            return nil, err
        }
        ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
        if err != nil || len(ips) == 0 {
            return nil, errors.New("could not resolve hostname")
        }
        for _, ip := range ips {
            if !isSafeIP(ip.IP) { // rejects RFC1918, loopback, link-local (169.254.0.0/16)
                return nil, errors.New("forbidden target IP address")
            }
        }
        // Connect to the SAME validated IP — no second DNS lookup for rebinding to exploit.
        targetAddr := net.JoinHostPort(ips[0].IP.String(), port)
        return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, network, targetAddr)
    },
    Proxy: nil, // ignore environment proxy configs that could redirect egress
}
```

Common Mistakes:
- Validating the resolved IP, then letting the HTTP client re-resolve the hostname to actually connect (reopens the TOCTOU window)
- Blocking `127.0.0.1` but forgetting the IPv6 loopback (`::1`) and link-local ranges (`169.254.0.0/16`, `fe80::/10`) — cloud metadata lives at a link-local address
- Relying on IMDSv1 in AWS instead of enforcing IMDSv2's session-token requirement, which independently defeats simple GET-based SSRF

Related Concepts: SSRF, DNS Rebinding, TOCTOU, Cloud Metadata Exfiltration, Egress Filtering
Related Courses: ssrf-the-server-that-became-the-attacker, exploiting-hardening-cloud-metadata-imdsv1-vs-imdsv2, microservices-threat-modeling-stride

---

### Question 4: Why does hashing passwords with plain SHA-256 fail as a storage scheme even though SHA-256 is cryptographically secure, and what three properties must a password hashing scheme actually have?

Think Prompt: Separate "cryptographically secure" (collision/preimage resistant) from "suitable for password storage" (slow, memory-hard, per-user unique). Consider what a GPU/ASIC attacker optimizes for.

Model Answer / Explanation:
1. The Mismatch: SHA-256 is *designed* to be fast — ideal for verifying file integrity, terrible for password storage. A modern GPU computes billions of SHA-256 hashes per second, making offline brute-force of an 8-character alphanumeric password feasible in under a day once a database dump is stolen.
2. Property 1 — Unique Salt: Without a per-user random salt, identical passwords produce identical hashes, so attackers precompute rainbow tables once and instantly reverse any matching hash across every breached database that reused common passwords.
3. Property 2 — Tunable Work Factor (memory + time): A KDF must force the attacker to spend real CPU *and* memory per guess, eliminating the GPU/ASIC parallelism advantage (GPUs have abundant compute but comparatively little per-core memory bandwidth).
4. Property 3 — Application Pepper: A secret held outside the database (KMS/env var) mixed in before hashing means even a full database leak is useless without also compromising the pepper store separately.
5. Why Argon2id: It won the Password Hashing Competition by hybridizing Argon2i's side-channel-resistant first pass with Argon2d's GPU-resistant data-dependent passes — the industry-standard choice for new systems.

```go
hash := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, params.KeyLength)
// PHC format persists everything needed to reproduce verification, even after tuning parameters change later:
phc := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
    argon2.Version, params.Memory, params.Iterations, params.Parallelism, b64Salt, b64Hash)

// Verification MUST use constant-time comparison to prevent timing side-channels:
if subtle.ConstantTimeCompare(actualHash, expectedHash) == 1 { /* match */ }
```

Common Mistakes:
- Using `==` or `bytes.Equal` to compare hashes instead of `subtle.ConstantTimeCompare`, leaking timing information about how many leading bytes matched
- Hardcoding Argon2 parameters instead of embedding them in the stored PHC string, making a future work-factor bump impossible without re-hashing every user at once
- Logging the raw password anywhere in the request pipeline before it reaches the hashing function (debug logs, error traces)

Related Concepts: Argon2id, Salting, Peppering, Rainbow Tables, Constant-Time Comparison, PHC String Format
Related Courses: secure-password-storage-argon2-salts-peppers, tuning-argon2id-parameters-for-production, building-secure-login-session-brute-force-defense

---

### Question 5: A stateless JWT-based API validates tokens by reading the `alg` field from the JWT header and using it to pick the verification function. Why is this catastrophic, and what's the fix?

Think Prompt: Think about who controls the JWT header (the sender, always) versus who the server should trust to decide the verification algorithm.

Model Answer / Explanation:
1. The Attack — Algorithm Confusion: If a server has an RS256 public key configured for verification, but naively trusts the token's own `alg` header, an attacker can forge a token with `alg: HS256` and sign it using the *public* RS256 key as the HMAC secret (public keys are, by definition, public). A server that blindly does `verify(token, publicKey, header.alg)` will use the public key as an HMAC secret and successfully "verify" the attacker's forged token.
2. The `alg: none` Variant: Some naive JWT libraries also honor `alg: none`, accepting a token with no signature at all if the header claims it needs none.
3. The Fix: The verifying service must hardcode the expected algorithm (e.g., "this endpoint only ever accepts RS256") and reject any token whose header doesn't match — never derive verification behavior from attacker-controlled input.
4. Key Distribution: Public keys should be fetched from a JWKS endpoint keyed by `kid`, with the `kid` value sanitized (never path-traversed or used to fetch an arbitrary attacker-supplied URL — that's SSRF via JWKS).
5. Revocation: Stateless JWTs can't be revoked by simply "deleting" them — pair short-lived access tokens with a server-side revocation list (e.g., Redis-backed denylist keyed by `jti`) for immediate logout/compromise response.

```go
// SECURE — the verifying library is told the expected algorithm explicitly,
// it does not trust header.alg to select behavior.
token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
    if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
        return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
    }
    return rsaPublicKey, nil
})
```

Common Mistakes:
- Letting the JWT library auto-select the verification function based on the incoming token's own header
- Storing JWTs in `localStorage` (XSS-readable) instead of an `HttpOnly`, `SameSite` cookie for browser-based clients
- Treating a long-lived JWT as inherently revocable, then having no server-side mechanism to invalidate a compromised token before expiry

Related Concepts: JWT Algorithm Confusion, JWKS, kid Sanitization, Token Revocation, RS256 vs HS256
Related Courses: stateless-jwt-api-security-from-scratch, oauth2-security-interview-track, oauth2-oidc-jwt-zero-to-attacks

---

### Question 6: A `/login` endpoint has correct input validation and parameterized queries, but attackers are still taking over accounts via credential stuffing at 1,000 requests/second. What's missing, and how do you design a rate limiter that can't be trivially bypassed?

Think Prompt: Consider what resource is actually being exhausted (CPU from password hashing, not just bandwidth), and the classic mistake of trusting a client-supplied header to identify the client.

Model Answer / Explanation:
1. The Gap: Input validation and injection defenses say nothing about *volume*. Argon2id/bcrypt are deliberately CPU/memory-expensive (50-500ms per attempt by design), so even a moderate request rate against `/login` can exhaust CPU or the DB connection pool — independent of whether each individual request is "valid."
2. Algorithm Choice: A sliding-window log (timestamps in a Redis sorted set) gives exact counts over a rolling window; a token bucket allows controlled bursts; naive fixed windows allow a "double burst" at the window boundary.
3. The Client-Identification Pitfall: Rate limiting solely by IP parsed from `X-Forwarded-For` is trivially spoofable — an attacker sets an arbitrary value in that header. It must only be trusted after verifying the request actually came through your trusted reverse proxy, and even then, NAT'd corporate users sharing one IP will suffer false positives on IP-only limits.
4. The Fix — Dual-Key Limiting: Combine a per-IP window with a per-account window (e.g., `limit:ip:1.2.3.4` and `limit:login:user@domain.com`), and make the whole check-and-increment atomic (Lua script in Redis) to avoid a race where two concurrent requests both read "under limit" before either increments.
5. Fail-Closed on Degradation: If the rate-limiting store (Redis) becomes unavailable, decide explicitly whether to fail-open (availability risk) or fail-closed (safer for auth endpoints, since an outage shouldn't become a free pass for unmonitored brute force).

```lua
-- Atomic sliding-window check+increment, single round trip, no TOCTOU between count and add
local clear_before = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)
local req_count = redis.call('ZCARD', key)
if req_count < limit then
    redis.call('ZADD', key, now, now .. "_" .. math.random())
    redis.call('EXPIRE', key, window + 1)
    return 1
else
    return 0
end
```

Common Mistakes:
- Rate limiting only by raw `X-Forwarded-For` value without verifying the request path through a trusted proxy first
- Implementing "read count, then increment" as two separate Redis round trips instead of one atomic Lua script, creating a race condition under concurrent bursts
- Failing open on rate-limiter infrastructure outage for an authentication endpoint, silently disabling brute-force protection exactly when it's most needed

Related Concepts: Sliding Window Rate Limiting, Credential Stuffing, X-Forwarded-For Spoofing, Fail-Open vs Fail-Closed, Atomic Redis Operations
Related Courses: rate-limiting-as-a-security-control, building-secure-login-session-brute-force-defense, secure-login-brute-force-and-timing-defenses

---

### Question 7: A search page reflects the `q` query parameter directly into the HTML response. You've added output encoding for `<` and `>`. Is that sufficient, and what's the architectural backstop if a future code change reintroduces an unescaped sink?

Think Prompt: Consider that output encoding is a per-call-site discipline that inevitably has gaps across a large codebase, and what a browser-enforced policy can do that server-side escaping can't.

Model Answer / Explanation:
1. Why Escaping Alone Isn't Enough: Context-aware output encoding (HTML entity encoding, JS string escaping, URL encoding) is necessary but fragile at scale — it must be applied correctly at *every* sink, and a single missed template variable, a new API endpoint, or a copy-pasted snippet reintroduces XSS. Relying purely on developer discipline across hundreds of templates doesn't scale.
2. The Backstop — Content Security Policy: A strict, nonce-based CSP tells the browser "only execute `<script>` tags carrying this exact per-request random nonce." Even if an attacker's payload slips past output encoding and lands in the DOM, the browser refuses to execute it because it lacks the correct nonce — which the attacker cannot predict or steal from the HTTP response before their own injected markup renders.
3. Why Domain-Allowlist CSP Is Weaker: Older CSP (`script-src 'self' https://apis.google.com`) is bypassable via JSONP endpoints or open redirects hosted on those same trusted domains. Nonce + `'strict-dynamic'` avoids needing a large domain allowlist at all.
4. Rollout Discipline: Deploy first as `Content-Security-Policy-Report-Only` with a `report-uri`, observe violation reports in production traffic, fix legitimate breakage, then switch to enforcing mode.

```javascript
// A fresh, cryptographically random nonce is generated PER REQUEST
const nonce = crypto.randomBytes(16).toString('base64');
res.setHeader('Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; report-uri /api/v1/csp-violations`
);
// Any <script> the attacker injects lacks this request's nonce and is blocked, even if it reached the DOM.
res.send(`<script nonce="${nonce}" src="/js/app.js"></script><h1>Results for: ${safeQ}</h1>`);
```

Common Mistakes:
- Treating CSP as a replacement for output encoding rather than defense-in-depth on top of it
- Reusing the same nonce across multiple requests (or hardcoding it), which lets an attacker who sees one response's nonce reuse it in an injected payload for a different response
- Leaving `'unsafe-inline'` in the policy as anything other than a legacy no-op fallback — modern browsers ignore it once a nonce/hash is present, but a misconfigured mix can silently reopen the hole on older clients

Related Concepts: Content Security Policy, Nonce-Based CSP, strict-dynamic, Output Encoding, Defense in Depth
Related Courses: content-security-policy-nonce-based-xss-defense, cross-site-scripting-xss-explained, xss-stored-reflected-dom-csp

---

### Question 8: An authenticated user's browser session cookie is used to authorize a "change email" POST endpoint. An attacker gets the victim to visit a malicious page containing a hidden auto-submitting form targeting that endpoint, and the victim's email gets changed. What vulnerability is this, why does the browser cooperate, and how do you stop it?

Think Prompt: Focus on the distinction between "the browser proves you're logged in" (ambient cookie) and "this specific request was intentionally initiated by you" (which a cookie alone cannot prove).

Model Answer / Explanation:
1. The Vulnerability: Cross-Site Request Forgery (CSRF). Browsers automatically attach a domain's cookies to every request to that domain, regardless of which page or origin initiated the request ("ambient credential transmission"). The server, seeing a valid session cookie, has no way to tell a request the user intentionally submitted from a request silently forged by a third-party page the user merely visited.
2. Defense 1 — Synchronizer Token Pattern: The server embeds a random, unpredictable token in the legitimate form (tied to the user's session) and requires it to be resubmitted on the state-changing POST. A cross-origin attacker page cannot read this token (Same-Origin Policy prevents reading response bodies across origins) so it cannot include a valid one in its forged request.
3. Defense 2 — Double-Submit Cookie: The token is set as a separate (non-HttpOnly) cookie *and* must also be sent as a request header/body field; the server checks the two match. Works without server-side session storage of the token, but is weaker against subdomain-level cookie injection.
4. Defense 3 — SameSite Cookies: Setting `SameSite=Lax` or `Strict` on the session cookie instructs the browser itself not to attach it on cross-site requests (Lax still allows top-level GET navigation, Strict blocks even that). This is a strong, low-effort browser-level backstop but should not be the *only* defense — some legacy browsers and certain same-site subdomain scenarios don't fully cover it.
5. Why GET Must Never Mutate State: State-changing operations must never be reachable via GET, since GET requests can be triggered by a bare `<img src="...">` tag with zero JavaScript, and are also cached/prefetched by browsers and proxies.

```javascript
// Session cookie hardened at the browser level
res.cookie('session', sessionId, { httpOnly: true, secure: true, sameSite: 'strict' });

// Synchronizer token verified server-side on every state-changing request
if (req.body._csrf !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
}
```

Common Mistakes:
- Relying on `SameSite=Lax` alone without a synchronizer/double-submit token, missing coverage for edge cases like same-site subdomain compromise
- Allowing a state-changing action to be triggered via GET, bypassing token checks entirely
- Validating the CSRF token's *presence* but not that it actually matches the value tied to the authenticated session (accepting any non-empty token)

Related Concepts: CSRF, Synchronizer Token Pattern, Double-Submit Cookie, SameSite Cookies, Ambient Authority
Related Courses: csrf-anti-forgery-tokens-samesite-cookies, cookie-security-httponly-secure-samesite-host-prefix, session-security-high-entropy-expirable-tokens

---

### Question 9: You inherit a monolithic file-upload feature that accepts any file extension and stores uploads directly under the web root. What's the full attack chain an adversary could use, and what does a secure re-architecture look like?

Think Prompt: Think beyond "block .php files" — consider polyglot files that are simultaneously valid as two formats, content-type spoofing, and where uploaded files should even be served from.

Model Answer / Explanation:
1. The Naive Attack: If the server trusts the client-supplied filename/extension and stores the file under a web-servable directory, uploading `shell.php` (or `shell.php.jpg` if extension-stripping logic is sloppy) can grant remote code execution the moment the file is requested and the web server hands it to the PHP interpreter.
2. The Polyglot Attack (bypasses naive content sniffing): An attacker crafts a file that is simultaneously a valid GIF (passing a "check the magic bytes" filter) *and* contains valid PHP/JS payload bytes elsewhere in the file that get executed if the file is later included, rendered, or reinterpreted by a different subsystem (e.g., an image processing library with its own parser, or a browser sniffing content-type). Extension and magic-byte checks alone don't defeat this — the file genuinely *is* both formats.
3. Defense Layer 1 — Store Outside the Web Root: Uploaded files should never be directly servable from a path the web server executes as code. Store them in isolated object storage (S3-style bucket) with no execute permissions and no server-side scripting association.
4. Defense Layer 2 — Re-encode, Don't Trust: For image uploads, decode the file with a trusted image library and re-encode it to a fresh file (stripping any trailing payload bytes a polyglot relies on) rather than storing the attacker's original bytes verbatim.
5. Defense Layer 3 — Strict Allowlist + Random Filename: Validate MIME type via magic-byte sniffing (not the client-supplied `Content-Type` header, which is trivially spoofed), enforce an extension allowlist, and generate a random server-side filename disconnected from anything the attacker supplied.
6. Defense Layer 4 — Separate Serving Domain: Serve user uploads from a cookie-less, script-incapable subdomain (e.g., `usercontent.example.com`) so that even a successful stored-XSS-via-upload can't steal the main application's session cookies (different origin, no shared cookie jar).

Common Mistakes:
- Trusting the client-supplied `Content-Type` header or filename extension instead of sniffing actual file magic bytes server-side
- Storing uploads inside the same directory tree the web server executes as scripts, turning any upload bypass into remote code execution
- Serving user-uploaded content from the same origin as the authenticated application, letting a stored-XSS-via-upload reach the main session cookie

Related Concepts: Polyglot Files, Magic Byte Validation, Content-Type Spoofing, Isolated Upload Storage, Stored XSS via Upload
Related Courses: secure-file-upload-architecture, secure-file-upload-polyglot-defense, how-hackers-think-about-web-applications

---

### Question 10: A load balancer and an origin app server disagree about where one HTTP request ends and the next begins when both `Content-Length` and `Transfer-Encoding: chunked` headers are present. Why is this dangerous, and how is it exploited?

Think Prompt: Consider what happens when two different HTTP implementations in the same request path parse ambiguous framing differently, and what an attacker can smuggle into the gap.

Model Answer / Explanation:
1. The Root Cause: HTTP request smuggling (desync attack) exploits ambiguity in request framing when a request carries both `Content-Length` and `Transfer-Encoding` headers, or a malformed/obfuscated `Transfer-Encoding` value (`Transfer-Encoding: chunked` with extra whitespace, e.g. ` chunked`). If the front-end proxy honors one header to determine the body length while the back-end server honors the other, the two disagree about where the request actually ends.
2. The Exploitation Pattern (CL.TE): The front-end uses `Content-Length` and forwards what it believes is one complete request. The back-end uses `Transfer-Encoding` and, after processing the chunked body, finds leftover bytes it treats as the *start of the next request* on that same reused connection — a request the front-end never saw or authenticated, effectively smuggled in ahead of the next legitimate user's request on a shared/pipelined connection.
3. Why It's Severe: On connection-reuse architectures (common with reverse proxies to origin servers), an attacker's smuggled prefix can get prepended to an *innocent victim's* subsequent request on the same backend connection, letting the attacker poison responses, hijack sessions, or bypass front-end access-control checks that never saw the smuggled portion.
4. The Fix: The RFC 7230 rule — if both headers are present, the request must be rejected outright, never silently reconciled by picking one. Standardize on HTTP/2 end-to-end where feasible (its framing is length-prefixed and unambiguous by design), and ensure the front-end and back-end run the same, spec-compliant parsing behavior, or normalize/strip ambiguous framing at the edge before forwarding.

Common Mistakes:
- Silently preferring one of `Content-Length`/`Transfer-Encoding` when both are present instead of rejecting the request as malformed
- Assuming HTTP/2 origin-side eliminates smuggling risk when the connection to the origin is actually downgraded to HTTP/1.1 internally (a common reverse-proxy default)
- Treating this as purely a load-balancer configuration issue rather than testing it explicitly — desync bugs are invisible in normal traffic and only surface under adversarial framing

Related Concepts: HTTP Request Smuggling, CL.TE / TE.CL Desync, Connection Reuse, RFC 7230 Ambiguity, HTTP/2 Framing
Related Courses: http-request-smuggling-desync-attacks, how-hackers-think-about-web-applications, owasp-top-10-architecture-layers

---

### Question 11: Your team wants to migrate from checking `Origin`/`Referer` headers manually to relying on CORS. A developer sets `Access-Control-Allow-Origin` by reflecting whatever `Origin` header the browser sent, plus `Access-Control-Allow-Credentials: true`. What's wrong with this, and what does correct CORS configuration look like for a credentialed API?

Think Prompt: Recall that CORS is a browser-enforced relaxation of the Same-Origin Policy, not a server-side access-control mechanism by itself, and think about what "reflecting Origin" plus "allow credentials" together actually grants to any website on the internet.

Model Answer / Explanation:
1. The Misconception: CORS doesn't protect the server — it's a browser mechanism that decides whether *client-side JavaScript running on another origin* is allowed to read the response of a cross-origin request. It exists to relax the Same-Origin Policy safely, not to serve as an authorization layer.
2. The Specific Bug: Reflecting the incoming `Origin` header back verbatim as `Access-Control-Allow-Origin`, combined with `Access-Control-Allow-Credentials: true`, tells every browser that *any* origin on the internet is allowed to make credentialed (cookie-carrying) requests to this API and read the response. This effectively grants any malicious website the ability to make authenticated requests as the victim and exfiltrate the JSON response — the exact CSRF-adjacent data-theft scenario CORS is supposed to prevent.
3. The Spec Guardrail That's Being Defeated: The CORS spec explicitly forbids `Access-Control-Allow-Origin: *` when credentials are involved — but naive "reflect the Origin" logic sidesteps that restriction by echoing back a specific (attacker-controlled) origin instead of using the wildcard, which the browser happily accepts since it's a "specific" value.
4. The Fix: Maintain an explicit server-side allowlist of trusted origins and only ever set `Access-Control-Allow-Origin` to a value from that list after checking the incoming `Origin` against it — never echo unconditionally. For non-allowlisted origins, omit the CORS headers entirely so the browser blocks the read.
5. Preflight Discipline: Ensure `OPTIONS` preflight responses for state-changing methods (`PUT`/`DELETE`/custom headers) also enforce the same allowlist and correctly restrict `Access-Control-Allow-Methods`/`Access-Control-Allow-Headers` rather than wildcarding them alongside credentials.

```javascript
const allowedOrigins = new Set(['https://app.example.com', 'https://admin.example.com']);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin); // never '*' with credentials
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin'); // prevent cache poisoning across origins
    }
    next();
});
```

Common Mistakes:
- Reflecting the `Origin` header unconditionally to "make CORS errors go away" without an allowlist check
- Forgetting the `Vary: Origin` header, which can cause a shared cache to serve one origin's CORS-approved response to a different, unauthorized origin
- Treating a correctly configured CORS policy as sufficient CSRF protection — CORS blocks cross-origin *reads* of the response, but a forged cross-origin *write* (classic CSRF) can still fire even when the attacker's script never reads the result

Related Concepts: Same-Origin Policy, CORS Preflight, Access-Control-Allow-Credentials, Origin Allowlisting, Cache Poisoning via Vary
Related Courses: cors-without-confusion-preflight-origin-sop, csrf-anti-forgery-tokens-samesite-cookies, owasp-top-10-explained-vulnerable-bank
