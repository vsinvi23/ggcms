# Lint & Security Review Guidelines

**Stack:** Go 1.25 (backend) · React 18 + TypeScript + ESLint (frontend)  
**Applies to:** Every code change before commit and before PR merge.

---

## 1. When to run these checks

| Trigger | Required checks |
|---------|----------------|
| Before every `git commit` | Run `/pre-commit` (covers all HARD gates below) |
| Before opening a PR | Run `/review-change` + `/review-security` |
| After adding a new page/route | Re-run ESLint + TypeScript |
| After changing any auth/middleware/sanitize file | Full security review (`/review-security`) |
| After adding a new migration | Verify migration is idempotent and in `release/backend/migrations/` |

---

## 2. Frontend Lint Gates (must be 0 errors)

### Run
```
cd frontend/react-ui
npm run lint          # ESLint — must exit 0 with no output
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json  # Types — must exit 0
```

### Rules that BLOCK a commit (never suppress without justification)

| Rule | What it catches | Wrong → Right |
|------|----------------|---------------|
| `react-hooks/rules-of-hooks` | Hook called after `return` or inside `if` — **runtime crash** | Move all hooks above the first early return |
| `@typescript-eslint/no-explicit-any` | `any` kills type safety | Use `unknown` + type narrowing, or a typed interface/`Record<string,unknown>` |
| `no-control-regex` | Embedded null/control bytes in regex — security bypass | Write the char class explicitly, e.g. `[\s-]` not `[\s\x00-\x1f]` |
| `@typescript-eslint/no-require-imports` | `require()` in TS ESM file | Use `import x from 'pkg'` |
| `react-hooks/exhaustive-deps` *(error mode)* | Stale closure bug | Add missing dep, or wrap in `useCallback` |

### Rules where `eslint-disable` is allowed (with comment)

| Rule | When suppression is OK |
|------|----------------------|
| `react-hooks/exhaustive-deps` | Mount-only effect that must not re-fire: `// eslint-disable-next-line react-hooks/exhaustive-deps` |
| `@typescript-eslint/no-require-imports` | Config files only (e.g. `tailwind.config.ts`): same comment |
| `react-refresh/only-export-components` | Generated shadcn/ui files that re-export types alongside components |

### TypeScript strict mode checklist (even with `strict: false`)

- [ ] All function parameters typed — no implicit `any`
- [ ] All API response shapes use interfaces from `src/api/types.ts` — no inline `{}`
- [ ] `unknown` used in catch blocks — access properties only after type narrowing
- [ ] No non-null assertions (`!`) on values that can genuinely be null

---

## 3. Backend Lint Gates

### Run
```
cd backend/go-cms
go build ./...          # Must exit 0
go vet ./...            # Must exit 0
```

### Static analysis (run manually or in CI)
```
staticcheck ./...       # Install: go install honnef.co/go/tools/cmd/staticcheck@latest
gosec ./internal/...    # Install: go install github.com/securego/gosec/v2/cmd/gosec@latest
```

### Rules enforced by code review

| Pattern | Risk | Fix |
|---------|------|-----|
| `fmt.Sprintf` in GORM query | SQL injection | Use `?` placeholder + `db.Where("col = ?", val)` |
| `error` ignored with `_` | Silent failure | Handle or explicitly log with `zap.Error(err)` |
| `ctx` not propagated | Goroutine leak | Pass `ctx context.Context` as first arg through all layers |
| Hardcoded secret / credential | Credential leak | Use `cfg.JWT.Secret` from env-loaded config |
| `http.DefaultClient` | No timeout → DoS | Use `&http.Client{Timeout: 10 * time.Second}` |

---

## 4. Security Vulnerability Checklist (run `/review-security` for full detail)

### XSS (Frontend)
- [ ] Every `dangerouslySetInnerHTML` uses `sanitizeHtml()` from `src/lib/sanitize.ts`
- [ ] No raw HTML concatenation in JSX — always use React's escaped rendering
- [ ] Rich text from API bodies sanitized before display (`sanitizeHtml` + allowlist tags only)

### Injection (Backend)
- [ ] GORM: only `?` placeholder bindings — no `fmt.Sprintf` with user data
- [ ] MongoDB: never interpolate user input into `bson.D` key positions (`$where`, operator injection)
- [ ] File upload path: always `filepath.Base()` to strip traversal sequences

### Authentication & Token Handling
- [ ] JWT stored in `sessionStorage` + in-memory cache (`tokenCache`) — never `localStorage`
- [ ] `isAuthenticated()` in `client.ts` checks `exp` before every API call
- [ ] Groups loaded from API (not stored in sessionStorage) — XSS can't read permission data
- [ ] On 401 response: `clearAllAuthData()` called + redirect to `/auth`
- [ ] `CORS_ALLOWED_ORIGINS` is an explicit allowlist — never `*` in production

### Access Control (Backend)
- [ ] Every handler reads user identity from `middleware.GetUserID(c)` — never from body/query
- [ ] IDOR check: resource ownership verified before any mutation
- [ ] Admin-only actions (`publish`, `delete user`) check group permissions explicitly

### Secrets & Config
- [ ] No secrets hardcoded — all from `.env` loaded via `config` package
- [ ] `.env` files are in `.gitignore` — only `.env.example` with placeholders committed
- [ ] `JWT_SECRET` ≥ 32 random chars; `ADMIN_PASSWORD` changed from default before first production deploy
- [ ] Release `backend/.env` has `GIN_MODE=release` and `LOG_LEVEL=info`

### Dependencies
- [ ] `npm audit --audit-level=high` — zero critical/high CVEs before release
- [ ] `go mod verify` — module checksums match `go.sum`
- [ ] Docker base images pinned to a specific version tag (not `latest`)

---

## 5. How to fix the most common lint errors

### `no-explicit-any` in a catch clause
```ts
// Before
} catch (error: any) {
  throw new Error(error.response?.data?.message || 'Failed');
}

// After
} catch (error: unknown) {
  const msg = (error as { response?: { data?: { message?: string } } })
    .response?.data?.message;
  throw new Error(msg || 'Failed');
}
```

### `no-explicit-any` in a transform function
```ts
// Before
const transform = (item: any) => ({ id: item.id, name: item.name });

// After
const transform = (item: Record<string, unknown>) => ({
  id: item.id as number,
  name: item.name as string,
});
```

### `rules-of-hooks` — hook after early return
```ts
// Before (BROKEN — hook is conditional)
if (!data) return null;
const result = useMemo(() => ..., [data]);

// After (CORRECT — all hooks before any return)
const result = useMemo(() => {
  if (!data) return [];
  return ...;
}, [data]);
if (!data) return null;
```

### `exhaustive-deps` — missing dependency
```ts
// Before
useEffect(() => {
  fetchData();
}, []); // fetchData missing

// Option A: add dep (if fetchData is stable via useCallback)
useEffect(() => {
  fetchData();
}, [fetchData]);

// Option B: suppress if genuinely mount-only
useEffect(() => {
  fetchData(); // intentional: run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

---

## 6. Quick reference — commands for each review stage

```bash
# Before committing
/pre-commit

# Before opening a PR
/review-change          # correctness + simplification review of diff
/review-security        # security-specific scan of changed files

# Full codebase lint (frontend)
cd frontend/react-ui && npm run lint

# Full type check (frontend)
cd frontend/react-ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json

# Backend build + vet
cd backend/go-cms && go build ./... && go vet ./...

# Backend unit tests
cd backend/go-cms && go test ./internal/... -short -count=1

# Frontend unit tests
cd frontend/react-ui && node node_modules/vitest/vitest.mjs run

# Dependency audit
cd frontend/react-ui && npm audit --audit-level=high
cd backend/go-cms && go mod verify
```
