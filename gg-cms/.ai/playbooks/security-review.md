# Playbook: Security Review

> Run before any PR that touches auth, permissions, file upload, API endpoints, or user data.

---

## Step 1 — Scope the Change
Identify which security domains are touched:
- [ ] Authentication (JWT, OAuth, login flow)
- [ ] Authorization (RBAC, `requireAdmin`, group permissions)
- [ ] Input/output (XSS, injection, sanitization)
- [ ] File handling (upload, path traversal)
- [ ] Secrets/config (env vars, JWT secret, DB credentials)
- [ ] CORS/transport (allowed origins, cookies)
- [ ] Data exposure (PII, internal IDs, error messages)

## Step 2 — Run `/review-security` Claude Command
```
/review-security <file_or_feature>
```
Check output against every item below.

## Step 3 — XSS Checklist (Frontend)
- [ ] Every `dangerouslySetInnerHTML` call uses `sanitizeHtml()` from `src/lib/sanitize.ts`
- [ ] No raw HTML concatenation in JSX — only React-escaped rendering
- [ ] Rich text from API bodies sanitized before rendering

## Step 4 — Auth & Session Checklist
- [ ] JWT stored in `sessionStorage` + in-memory `tokenCache` — never `localStorage`
- [ ] Groups kept in memory only (not serialised to sessionStorage)
- [ ] `isAuthenticated()` in `client.ts` validates JWT `exp` before every request
- [ ] 401 response → `clearAllAuthData()` + dispatch `auth:logout`
- [ ] New admin-only routes use `<ProtectedRoute requireAdmin>`

## Step 5 — Backend Access Control Checklist
- [ ] New endpoints use `middleware.GetUserID(c)` — never trust user ID from request body
- [ ] IDOR check: resource ownership verified before mutation
- [ ] Admin-only actions wrapped in `middleware.AdminOnly()`
- [ ] Group permissions checked: `perms.Articles.Publish` etc.

## Step 6 — Injection Checklist (Backend)
- [ ] GORM queries use `?` placeholders only — no `fmt.Sprintf`
- [ ] MongoDB queries: no user input in `bson.D` key positions
- [ ] File upload paths: `filepath.Base()` to strip traversal
- [ ] No `exec.Command` with user-supplied arguments

## Step 7 — Secrets & Config Checklist
- [ ] No secrets hardcoded in source
- [ ] New config values added to `.env.example` with placeholder
- [ ] `.env` files in `.gitignore`
- [ ] `CORS_ALLOWED_ORIGINS` is an explicit list — never `*`

## Step 8 — Dependency Checklist
- [ ] `npm audit --audit-level=high` — zero critical/high CVEs
- [ ] `go mod verify` — checksums match `go.sum`

## Step 9 — Document Findings
For each finding: **severity** (Critical/High/Medium/Low) · **file:line** · **description** · **fix code snippet**.

If no issues: confirm each check passed + suggest one proactive hardening step.

---

## Security Anti-Patterns — Never Commit These

| Pattern | Risk | Fix |
|---------|------|-----|
| `localStorage.setItem('token', jwt)` | XSS readable | Use `sessionStorage` |
| `fmt.Sprintf("SELECT ... WHERE id=%d", input)` | SQL injection | GORM `?` placeholder |
| `dangerouslySetInnerHTML={{ __html: body }}` without sanitize | XSS | Wrap with `sanitizeHtml()` |
| `CORS_ALLOWED_ORIGINS=*` | CSRF surface | Explicit allowlist |
| Hardcoded `JWT_SECRET = "dev-secret"` | Credential leak | Load from env |
| `error.message` returned raw to client | Info disclosure | `toUserMessage()` |
