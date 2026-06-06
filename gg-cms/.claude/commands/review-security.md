# Security Review

Perform a thorough security review of the file or feature described in `$ARGUMENTS`, with hardening targets appropriate for a 1M-user platform.

## Stack context
- **Backend**: Go + Gin + GORM + PostgreSQL + MongoDB. JWT auth via `middleware/auth.go`. Clean Architecture (`domain → application → infrastructure → interfaces`).
- **Frontend**: React 18 + TypeScript + React Query + React Router + Tailwind + shadcn/ui. Auth state in `AuthContext`.
- **Auth flow**: Strapi issues JWT; Go CMS backend validates the same JWT on every request.
- **Scale target**: 1 million active users — attack surface is large; every gap will be found.

---

## Authentication & Authorization
- [ ] Every non-public route protected by `middleware.AuthMiddleware`
- [ ] Permission checks use the group-based `GroupPermissions` model — not just "is logged in"
- [ ] Admin-only endpoints (publish, assign reviewer, delete) check for admin role / `publish` permission explicitly
- [ ] `GetUserID(c)` used consistently — **never** trust `userId` from the request body for ownership decisions
- [ ] No IDOR: IDs in URL params validated against the authenticated user's ownership or role before any DB mutation
- [ ] **Short-lived access tokens** (≤ 15 min) + refresh token rotation — long-lived JWTs are a standing breach risk at scale
- [ ] **Token revocation list** in Redis: invalidated tokens (logout, password change) checked on every request before clock expiry
- [ ] JWT `aud` (audience) and `iss` (issuer) claims validated — not just the signature
- [ ] Refresh tokens stored `HttpOnly`; access tokens in memory — never `localStorage`

---

## Input Validation & Injection
- [ ] All handler inputs bound with `ShouldBindJSON` and validated via `binding:"required"` + custom validators
- [ ] Raw SQL in GORM: `?` placeholders only — no `fmt.Sprintf` or string concatenation in queries
- [ ] Search/filter params sanitised and length-capped before passing to repository layer
- [ ] File uploads: MIME type validated server-side (read magic bytes — not just `Content-Type` header or file extension); max size enforced via Gin middleware:
  ```go
  router.MaxMultipartMemory = 32 << 20  // 32 MB hard cap
  ```
- [ ] **Path traversal**: uploaded file names sanitised (`filepath.Base`, no `../`); stored under a random key, not the original name
- [ ] Rich-text body (`body` field on articles/courses): sanitise with an allowlist HTML policy (server-side) before storing and before serving to public readers
- [ ] MongoDB query operators (`$where`, `$regex`) guarded — never interpolate user input into a `bson.D` key position

---

## Rate Limiting & Abuse Prevention
At 1M users, every unprotected endpoint becomes a target.

- [ ] **Auth endpoints** (`/login`, `/register`, `/forgot-password`) limited to ≤ 10 req/min per IP with exponential back-off; returns `429` with `Retry-After` header
- [ ] **Authenticated write endpoints** limited per user (e.g. 120 req/min); protects against scripted bulk operations
- [ ] **Public read endpoints** limited per IP (e.g. 300 req/min); prevents scraping and DoS amplification
- [ ] **File upload** endpoint has a dedicated, stricter limit (e.g. 10 uploads/min per user)
- [ ] Rate limit counters in **Redis** (not in-process memory) so horizontal pods share state
- [ ] **Account lockout**: 10 consecutive failed logins → 15-min lock + alert; prevents credential stuffing
- [ ] Captcha (or proof-of-work) on registration to prevent mass account creation

---

## Secrets & Configuration
- [ ] No secrets hardcoded — all via environment variables from `.env` / secret manager
- [ ] JWT secret key ≥ 256 bits (32 random bytes); rotated periodically without downtime (support two valid keys during rotation window)
- [ ] Database DSN, Redis URL, S3 keys, SMTP credentials only in env — never in source or logs
- [ ] `.env` and `.env.*` files listed in `.gitignore`; `.env.example` contains only placeholder values
- [ ] Secrets never logged — mask `password`, `token`, `secret`, `key` fields in all structured log output
- [ ] Environment-specific config validated on startup — fail fast if a required secret is missing rather than silently using a default

---

## Transport Security
- [ ] CORS origin allowlist is explicit — not `*` in production; configured per-environment
- [ ] `Secure`, `HttpOnly`, `SameSite=Strict` flags set on any cookies
- [ ] HTTPS enforced in production with HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- [ ] TLS 1.2 minimum; TLS 1.3 preferred — no SSLv3, TLS 1.0/1.1
- [ ] Security headers set on all responses:
  ```
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https://cdn.yourdomain.com
  ```
- [ ] Request body size limited globally (prevents memory exhaustion):
  ```go
  router.Use(gin.LimitBodySize(10 << 20))  // 10 MB global cap
  ```

---

## Frontend-Specific
- [ ] No `dangerouslySetInnerHTML` without DOMPurify sanitization
- [ ] Auth token in memory / `HttpOnly` cookie — not `localStorage` (XSS readable)
- [ ] API error messages shown to users do not leak stack traces, file paths, or internal IDs
- [ ] `apiClient` interceptor: 401 → clear token + redirect to login; stale tokens never reused
- [ ] Sensitive query params (tokens, one-time codes) never in the URL — use POST body or `HttpOnly` cookie
- [ ] `Content-Security-Policy` prevents inline script injection (no `unsafe-inline` for scripts)
- [ ] Third-party CDN scripts (fonts, icons) use `integrity` + `crossorigin` SRI attributes

---

## Data Exposure
- [ ] Password / hash fields stripped from all API response DTOs — never in JSON output
- [ ] `publishedBody` / `reviewBaselineBody` only returned to authorised roles — not on public endpoints
- [ ] Pagination metadata does not expose total record count to unauthenticated callers (reveals user/content volume)
- [ ] Internal auto-increment PKs not used as the sole public resource identifier — slug used for public URLs
- [ ] **PII fields** (email, mobile number) masked or omitted in API responses visible to non-admin roles
- [ ] Database backups encrypted at rest; access restricted to ops role only

---

## Dependency & Supply Chain
- [ ] `go.sum` committed; CI runs `go mod verify` to detect tampering
- [ ] Frontend: `npm audit --audit-level=high` in CI; no unresolved critical/high CVEs
- [ ] No `replace` directives pointing to local forks that shadow upstream packages
- [ ] Docker base images pinned to digest (`FROM golang:1.22@sha256:...`), not a mutable tag like `latest`
- [ ] Dependabot or Renovate configured to open PRs for dependency updates weekly

---

## Logging & Incident Response
- [ ] All authentication events logged (success, failure, lockout) with `user_id`, `ip`, `user_agent`, `timestamp`
- [ ] All privilege-escalation actions (role change, group add/remove) logged in `audit_logs`
- [ ] Logs shipped to a centralised SIEM — not only to local disk that could be wiped by an attacker
- [ ] **Alert on**: > 50 failed logins/min from one IP, > 100 4xx/min from one user, any 500 on an auth endpoint
- [ ] Incident runbook exists: what to do when a JWT secret is compromised (rotate, invalidate all sessions, notify users)

---

## Output format
For each finding:
1. **File + line number** where the issue exists
2. **Severity**: Critical / High / Medium / Low / Info
3. **Description** of the vulnerability and what an attacker could do
4. **Concrete fix** — show the corrected code snippet

If no issues found, confirm which checks passed and suggest one proactive hardening step appropriate for the 1M-user scale.
