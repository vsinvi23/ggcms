# GG-CMS — AI Memory: Runbooks

> Onboarding, day-to-day operations, and troubleshooting. Last updated: 2026-06-11

---

## 1. Onboarding — First Setup (Windows)

### Prerequisites
- Go 1.25+
- Node.js 20+
- Docker Desktop (running)
- Git

### Steps

```powershell
# 1. Clone
git clone <repo> && cd gg-cms

# 2. Backend — install & verify
cd backend/go-cms
copy .env.example .env          # Edit: JWT_SECRET, ADMIN_PASSWORD
go build ./...                  # Must exit 0

# 3. Start databases
docker compose up -d            # Starts gg-cms-postgres (:5433) + gg-cms-mongodb (:27017)

# 4. Start backend (dev)
go run ./cmd/server/main.go     # Runs migrations + seeds admin + listens :1337

# 5. Frontend — install & start
cd ../../frontend/react-ui
npm install
copy .env.example .env          # VITE_API_BASE_URL=http://localhost:1337/api
npm run dev                     # Vite :8080

# 6. Open http://localhost:8080
# Login: admin@gg-cms.local / <ADMIN_PASSWORD from .env>
```

### CORS requirement
When running Vite dev server (`:8080`), the backend `.env` **must** include:
```
CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:80,http://localhost:8080
```

---

## 2. Onboarding — Release Package (Windows, no build tools needed)

```powershell
cd release

# Edit dist/native/.env (UTF-8 NoBOM — critical!)
# Set: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, CORS_ALLOWED_ORIGINS

# Start Docker services (DBs + nginx frontend)
docker compose -f docker-compose.native.yml up -d

# Start backend binary
cd dist/native
.\server.exe                    # Runs migrations, seeds admin, listens :1337

# Open http://localhost (nginx serves React at :80 + proxies /api → :1337)
```

> **BOM Warning:** Never write `.env` with PowerShell's default `-Encoding utf8` — it adds BOM.
> Use: `[System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding($false))`

---

## 3. Running Tests

### Backend unit tests
```bash
cd backend/go-cms
go test ./internal/... -short -count=1   # 5 packages · ~47 tests · ~15s
go test ./tests/api/... -v               # Integration tests (needs live DB)
```

### Frontend unit tests
```bash
cd frontend/react-ui
node node_modules/vitest/vitest.mjs run  # 9 files · 98 tests · ~30s
```

### E2E tests (full stack required)
```bash
# Prerequisites: backend :1337 + Vite :8080 + DBs running

cd frontend/react-ui
$env:PLAYWRIGHT_BASE_URL = "http://localhost:8080"

# All specs (16 files · ~250 tests · ~20min)
node node_modules/@playwright/test/cli.js test --config=playwright.local.config.ts

# Targeted specs only
node node_modules/@playwright/test/cli.js test "e2e/auth.spec.ts" "e2e/dashboard.spec.ts" --config=playwright.local.config.ts
```

### E2E state management
- State file: `e2e/.e2e-state.json` (created by global-setup, preserved by teardown)
- **Delete state file** before running against a fresh DB to trigger full re-seed
- **Keep state file** for subsequent runs — skips re-seeding (faster, avoids rate limits)

### Pre-commit gate
```bash
cd gg-cms
# Run /pre-commit in Claude Code (runs all hard gates)
```

---

## 4. Adding a New Feature (Backend)

```
1. Add entity field to internal/domain/entity/*.go
2. Add migration: backend/go-cms/migrations/postgres/NNN_description.sql
   → Must be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING)
   → Also copy to release/dist/native/migrations/postgres/
3. Add repository method to internal/domain/repository/interfaces.go
4. Implement in internal/infrastructure/persistence/postgres/*.go
5. Add service method to internal/application/xxx/service.go
6. Add DTO to internal/interfaces/http/dto/xxx_dto.go
7. Add handler method to internal/interfaces/http/handler/xxx_handler.go
8. Wire route in internal/interfaces/http/router.go
9. go build ./... && go vet ./...
```

---

## 5. Adding a New Feature (Frontend)

```
1. Add types to src/api/types.ts
2. Add service: src/api/services/xxxService.ts
3. Add hook: src/api/hooks/useXxx.ts
4. Create component/page
5. Wire route in src/App.tsx (wrap with <ProtectedRoute> if auth required,
   add requireAdmin if admin-only)
6. npx tsc --noEmit -p tsconfig.app.json
7. npm run lint
```

---

## 6. Troubleshooting — Backend Won't Start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `JWT_SECRET environment variable is required` | `.env` has BOM or isn't loaded | Rewrite `.env` without BOM (see §2 above) |
| `mongodb connection failed: context deadline exceeded` | MongoDB container not healthy when server starts | Wait for `gg-cms-mongodb` to be healthy, then restart server |
| `migration failed` | SQL error in migration file | Check `backend/go-cms/migrations/postgres/NNN.sql`; migrations are idempotent on re-run |
| Port `:1337` already in use | Previous server still running | `Stop-Process -Name server -Force` or `taskkill /f /im server.exe` |
| `Admin login failed` (teardown warning) | Backend not reachable from teardown | Non-fatal — teardown catches error and skips cleanup |

---

## 7. Troubleshooting — Frontend / E2E Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login times out in E2E (`waitForURL` 30s timeout) | CORS blocking API call from `:8080` | Add `http://localhost:8080` to `CORS_ALLOWED_ORIGINS` in backend `.env` |
| Rate limit after 9 logins | `apiLogin` called per-test hits IP rate limiter | Use `getToken(creds)` with module-level `_tokenCache` map |
| Strict mode: `getByText` resolves to N elements | Multiple items with same title from repeated runs | Use `.first()` on the locator |
| `injectFakeSession` re-injects after `loginViaUI` | `addInitScript` persists across page navigations | Call `page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('__session_cleared','1') })` before `loginViaUI` |
| `Tooltip must be used within TooltipProvider` in tests | Radix Tooltip needs provider context | Wrap test render in `<TooltipProvider>` |
| Vitest worker crash on Settings.test.tsx | 1,500-line component + 30+ icon imports → OOM | Don't import Settings page directly; use lightweight stubs instead. Full coverage in E2E. |
| `npm run lint` fails with 60+ errors | ESLint `no-explicit-any`, `rules-of-hooks`, etc. | See `.ai/context/lint-security-guidelines.md` §5 for fix patterns |
| E2E tests skip despite services running | `.e2e-state.json` references stale DB (fresh containers) | Delete `e2e/.e2e-state.json` and re-run (global-setup will re-seed) |

---

## 8. Troubleshooting — Docker / Deployment

| Symptom | Cause | Fix |
|---------|-------|-----|
| `go-cms-postgres` / `go-cms-mongo` containers (wrong naming) | Compose file lacked `name: gg-cms` when containers were first started | `docker compose down`, delete volumes, `docker compose up -d` with correct compose file |
| Frontend nginx container restarting | nginx.conf written with BOM | Rewrite with `System.Text.UTF8Encoding($false)` |
| `docker ps` shows 500 error | Docker Desktop still initialising | Wait 30–60 s for daemon to become ready |
| Postgres unhealthy on fresh start | `gg_cms` database doesn't exist yet during healthcheck window | Wait — healthcheck retries 5×; container becomes healthy once `CREATE DATABASE` completes |
| mTLS certs missing | `generate-certs.sh` not run | `cd release/certs && bash generate-certs.sh` (requires OpenSSL, bundled with Git for Windows) |
| Backend Docker build fails | Docker Hub blocked by proxy | Use `deploy-backend.ps1 -Load` with pre-built image, or run `generate-certs.ps1` when network is available |

---

## 9. Adding E2E Tests

### Pattern for new spec file
```typescript
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Feature — description', () => {
  test('scenario', async ({ page }) => {
    await injectFakeSession(page, 'admin');   // or 'reviewer', 'creator', 'learner'
    await page.goto('/route');
    await expect(page).toHaveURL(/\/route/);
    await expect(page).not.toHaveURL(/\/auth/);
    // ... assertions
  });

  test('unauthenticated redirected', async ({ page }) => {
    // No injectFakeSession — tests redirect
    await page.goto('/protected-route');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});
```

### Real-credentials test pattern (workflow tests)
```typescript
// Cache tokens to avoid rate limiting across tests
const _tokenCache = new Map<string, string | null>();
async function getToken(creds: { email: string; password: string }) {
  if (_tokenCache.has(creds.email)) return _tokenCache.get(creds.email)!;
  const tok = await apiLogin(creds.email, creds.password);
  _tokenCache.set(creds.email, tok);
  return tok;
}

test('full cycle', async ({ page }) => {
  const adminToken = await getToken(ADMIN);
  if (!adminToken) { test.skip(); return; }   // graceful skip if backend down
  
  // Use injectFakeSession for reviewer UI verification (avoids CORS/rate-limit on reviewer login)
  await injectFakeSession(page, 'reviewer', { userId: state.reviewerId });
  await page.goto('/my-tasks');
  
  // Clear before switching to real admin login
  await page.evaluate(() => {
    sessionStorage.clear();
    sessionStorage.setItem('__session_cleared', '1');
  });
  await loginViaUI(page, ADMIN.email, ADMIN.password);
});
```

---

## 10. Content Workflow Operations

### Submit article for review (API)
```bash
POST /api/cms/:id/submit                 # Creator action — DRAFT → REVIEW
POST /api/cms/:id/assign-reviewer        # Admin only — body: { userId: <number> }
POST /api/cms/:id/approve                # Reviewer — REVIEW → APPROVED
POST /api/cms/:id/reject                 # Reviewer — body: { comment: "..." }
POST /api/cms/:id/send-back              # Reviewer — body: { comment: "..." } → DRAFT
POST /api/cms/:id/publish                # Admin/Publisher — APPROVED → PUBLISHED
POST /api/cms/:id/claim-review           # Reviewer self-assigns
```

For courses, append `?type=COURSE` to all CMS endpoints.

### Assign reviewer (Admin UI)
Navigate to the article/course → open "Assign Reviewer" panel → select from group members.

### Disable social login
```sql
-- Migration 026 already sets this:
UPDATE app_settings SET value = 'false' WHERE key = 'feature.social_login';
-- Or via Admin Settings UI → Features tab → Social Login toggle
```
