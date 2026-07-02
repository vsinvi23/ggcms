# GG-CMS — Feature Development Runbook

How to add features end-to-end, plus E2E test patterns and content-workflow API reference.

---

## 1. Adding a Backend Feature

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
10. MANDATORY: re-index code graph (see §5)
```

---

## 2. Adding a Frontend Feature

```
1. Add types to src/api/types.ts
2. Add service: src/api/services/xxxService.ts
3. Add hook: src/api/hooks/useXxx.ts
4. Create component/page
5. Wire route in src/App.tsx (wrap with <ProtectedRoute> if auth required,
   add requireAdmin if admin-only)
6. npx tsc --noEmit -p tsconfig.app.json
7. npm run lint
8. MANDATORY: re-index code graph (see §5)
```

---

## 3. Adding E2E Tests

### Standard pattern (fake session)
```typescript
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Feature — description', () => {
  test('scenario', async ({ page }) => {
    await injectFakeSession(page, 'admin');   // or 'reviewer', 'creator', 'learner'
    await page.goto('/route');
    await expect(page).toHaveURL(/\/route/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('unauthenticated redirected', async ({ page }) => {
    await page.goto('/protected-route');       // no injectFakeSession
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});
```

### Real-credentials pattern (workflow tests)
```typescript
// Cache tokens to avoid IP rate limiting (10 logins/min)
const _tokenCache = new Map<string, string | null>();
async function getToken(creds: { email: string; password: string }) {
  if (_tokenCache.has(creds.email)) return _tokenCache.get(creds.email)!;
  const tok = await apiLogin(creds.email, creds.password);
  _tokenCache.set(creds.email, tok);
  return tok;
}

test('full cycle', async ({ page }) => {
  const adminToken = await getToken(ADMIN);
  if (!adminToken) { test.skip(); return; }          // graceful skip if backend down

  // Use injectFakeSession for reviewer UI (avoids CORS/rate-limit on reviewer login)
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

> E2E gotchas: see `runbooks/troubleshooting.md` → Frontend / E2E Issues table.

---

## 4. Content Workflow Operations (API)

```bash
POST /api/cms/:id/submit             # Creator — DRAFT → REVIEW
POST /api/cms/:id/assign-reviewer    # Admin — body: { userId: <number> }
POST /api/cms/:id/approve            # Reviewer — REVIEW → APPROVED
POST /api/cms/:id/reject             # Reviewer — body: { comment: "..." }
POST /api/cms/:id/send-back          # Reviewer — body: { comment: "..." } → DRAFT
POST /api/cms/:id/publish            # Admin/Publisher — APPROVED → PUBLISHED
POST /api/cms/:id/claim-review       # Reviewer self-assigns
```

For **courses**, append `?type=COURSE` to all CMS endpoints (default type is ARTICLE).

### Disable social login
```sql
-- Migration 026 already sets this:
UPDATE app_settings SET value = 'false' WHERE key = 'feature.social_login';
-- Or via Admin Settings UI → Features tab → Social Login toggle
```

---

## 5. MANDATORY — Update the Code Graph After Any Feature

Every feature change MUST refresh the code graph so `.ai-memory/` stays accurate:

```
# 1. Re-index (in a Claude Code session)
mcp__codebase-memory-mcp__index_repository(
  repo_path="c:\\Vivek\\Pesonal\\Serenya\\Project\\CMS\\gocms\\gg-cms",
  mode="moderate"
)

# 2. Detect what changed and its blast radius
mcp__codebase-memory-mcp__detect_changes(
  project="C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms",
  since="HEAD~1", depth=2
)

# 3. Regenerate affected .ai-memory/ files (summaries/overview.md at minimum)
```

This is a hard rule — see `CLAUDE.md` and `.ai/project-rules.md`.
