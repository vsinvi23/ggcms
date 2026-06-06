# Security Context

## Current Security Posture

| Area | Status | Risk |
|------|--------|------|
| JWT validation | FULL | Low |
| Route auth guards | FULL | Low |
| RBAC permissions | FULL | Low |
| SQL injection | Low risk (GORM parameterized) | Low |
| XSS — dangerouslySetInnerHTML | **FIXED Jun 2026** — all 9 locations wrapped with `sanitizeHtml()` | Low |
| XSS — htmlParser.ts innerHTML | **FIXED Jun 2026** — `textContent` used; image URLs validated | Low |
| Auth token storage | **FIXED Jun 2026** — `sessionStorage` + memory only; `lib/api.ts` deleted | Low |
| CSRF (withCredentials) | **FIXED Jun 2026** — `withCredentials: false`; Bearer header only | Low |
| Groups in sessionStorage | **FIXED Jun 2026** — groups in memory only | Low |
| Visitor profile storage | **FIXED Jun 2026** — `sessionStorage` instead of `localStorage` | Low |
| Raw error messages in UI | **FIXED Jun 2026** — `toUserMessage()` normaliser; no server details in UI | Low |
| oauthError query param XSS | **FIXED Jun 2026** — allowlisted to hardcoded messages | Low |
| Hardcoded fallback API URL | **FIXED Jun 2026** — throws at startup in production if env var missing | Low |
| Audit trail | FULL (MongoDB) | Low |
| CORS | `AllowAllOrigins: true` — **must restrict before production** | **HIGH** |
| Rate limiting | In-memory only — not pod-safe | Medium |
| File upload validation | Extension only, no MIME magic-byte check | Medium |
| OAuth callback URL | Token in `?token=` query param — visible in logs; move to hash fragment | Medium |
| HTTPS | Not enforced at app level (nginx handles) | Medium |
| JWT rotation | No refresh-token rotation; no revocation list | Medium |

---

## XSS Protection — `sanitizeHtml()`

**File:** `src/lib/sanitize.ts`

Browser-native HTML sanitizer (no external deps — DOMPurify upgrade path documented in file):
- Parses HTML via `DOMParser` into a detached DOM tree
- Removes: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<link>`
- Strips all `on*` event handler attributes globally
- Walks the tree removing any element not in the ALLOWED_TAGS set
- Strips any attribute not in ALLOWED_ATTRS
- Blocks `javascript:`, `data:`, `vbscript:` URL schemes in `href`/`src`
- Forces `rel="noopener noreferrer"` on all `<a>` tags
- Returns `''` on any parse failure (never returns raw input)

**Usage:** wrap every `dangerouslySetInnerHTML`:
```tsx
import { sanitizeHtml } from '@/lib/sanitize';
dangerouslySetInnerHTML={{ __html: sanitizeHtml(someHtml) }}
```

**Upgrade to DOMPurify** when `npm install dompurify @types/dompurify` is available:
```typescript
import DOMPurify from 'dompurify';
export const sanitizeHtml = (html: string): string =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, FORCE_BODY: true });
```

---

## Error Normaliser — `toUserMessage()`

**File:** `src/lib/errors.ts`

Maps HTTP status codes to safe, user-facing strings. Never exposes stack traces, file paths, or internal IDs.

```typescript
import { toUserMessage } from '@/lib/errors';
// Usage in catch blocks:
return { error: toUserMessage(err, 'Login failed. Please try again.') };
```

---

## CORS — Production Fix Required

```go
// Current (development only — NEVER ship to production):
r.Use(middleware.CORS())

// Production target in middleware/cors.go:
config := cors.Config{
    AllowOrigins:     []string{"https://your-domain.com"},
    AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Authorization", "Content-Type"},
    AllowCredentials: false,  // Bearer token in header; no cookies needed
    MaxAge:           12 * time.Hour,
}
```

---

## Auth Security (Current State)

```typescript
// Token storage hierarchy (most → least secure):
// 1. In-memory cache (tokenCache variable) — fastest, cleared on tab close
// 2. sessionStorage — fallback, cleared on tab close, not cross-tab
// 3. localStorage — NOT used (lib/api.ts deleted)

// withCredentials: false — set in api/client.ts
// Groups: React state only — NOT in sessionStorage

// 401 interceptor — dispatches auth:logout event if token expired
// AuthContext.onForcedLogout — guarded by tokenExpiryRef to avoid
//   logging out on permission errors with a still-valid token
```

---

## Input Validation

```go
// Backend: binding tags on all DTOs
type CreateRequest struct {
    Name     string `json:"name" binding:"required,min=1,max=255"`
    Email    string `json:"email" binding:"required,email"`
    RoleType string `json:"roleType" binding:"required,oneof=learner developer architect"`
}
```

---

## File Upload Security (Outstanding)

Current state: extension stored, MIME type NOT validated.

Required hardening:
1. Read first 512 bytes → detect magic bytes
2. Validate against allowed MIME types
3. Store with UUID filename (not original)
4. Enforce max size via `router.MaxMultipartMemory = 32 << 20`

---

## OAuth Callback (Outstanding — Medium)

Current: backend redirects to `FRONTEND_URL/auth/callback?token=<jwt>`.  
Token visible in browser history, server logs, CDN access logs, referrer headers.

Fix: redirect to `FRONTEND_URL/auth/callback#token=<jwt>` (hash fragment — never sent to servers).

Frontend `OAuthCallback.tsx` change:
```typescript
const hash = new URLSearchParams(window.location.hash.slice(1));
const token = hash.get('token');
window.history.replaceState(null, '', window.location.pathname);
```

---

## Rate Limiting (Outstanding — Medium)

Current: in-memory counters in `middleware/rate_limit.go` (not shared across pods).

Fix: Redis-backed counter:
```go
// INCR ratelimit:{ip}:{minute} → check against limit
// EXPIRE ratelimit:{ip}:{minute} 60
```
Requires Redis client wired in `pkg/database/redis.go`.

---

## Known Vulnerabilities Remaining

| Issue | Severity | Fix |
|-------|---------|-----|
| CORS AllowAll | HIGH | Restrict to known origins before production |
| OAuth token in query param | MEDIUM | Move to hash fragment |
| Rate limit not pod-safe | MEDIUM | Redis-backed counter |
| No JWT refresh rotation | MEDIUM | Implement refresh token + revocation list |
| File upload no MIME check | MEDIUM | Magic-byte validation + UUID filename |
| No security response headers | LOW | Add via nginx: CSP, X-Frame-Options, HSTS |
