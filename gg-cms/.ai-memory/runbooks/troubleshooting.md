# GG-CMS — Troubleshooting Runbook

---

## Backend Issues

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `JWT_SECRET environment variable is required` | `.env` has BOM (PowerShell `-Encoding utf8` adds it) | Rewrite: `[System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding($false))` |
| `mongodb connection failed: context deadline exceeded` | MongoDB container not healthy when server starts | `docker ps` → wait for `(healthy)`, then restart server |
| Port `:1337` already in use | Previous process still running | `Stop-Process -Name server -Force` or `taskkill /f /im server.exe` |
| `migration failed` | SQL error in migration | Check `migrations/postgres/NNN.sql`; safe to re-run (idempotent) |
| Server starts but returns 403 on OPTIONS | CORS misconfigured | Add calling origin to `CORS_ALLOWED_ORIGINS` in `.env` |
| `go build ./...` fails | Import cycle or missing dependency | Run from `backend/go-cms/`, check error output |

---

## Frontend / E2E Issues

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Login times out (30s) in E2E | CORS blocking API call from `:8080` | Add `http://localhost:8080` to `CORS_ALLOWED_ORIGINS` |
| E2E rate-limited after 9 logins | `apiLogin` called per-test hits IP limiter (10/min) | Use module-level `_tokenCache` map — login once per user per file |
| `strict mode violation: N elements` | Multiple content rows with same title from repeated runs | Use `.first()` on the locator |
| `injectFakeSession` re-injects after `loginViaUI` | `addInitScript` persists across navigations | `page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('__session_cleared','1') })` before `loginViaUI` |
| `Tooltip must be used within TooltipProvider` | Missing provider in test render | Wrap with `<TooltipProvider>` from `@/components/ui/tooltip` |
| Vitest worker OOM crash | Large component (1,500+ lines) imported directly | Use lightweight stubs; full coverage in E2E instead |
| E2E tests all skip | Stale `.e2e-state.json` with fresh DB | Delete `e2e/.e2e-state.json` and re-run to trigger re-seed |
| `npm run lint` — 60+ errors | `no-explicit-any`, `rules-of-hooks`, etc. | See `.ai/context/lint-security-guidelines.md` §5 |
| `tsc --noEmit` fails | Type errors after ESLint fix | Fix types — use `unknown` not `any`, type catch blocks |
| Tab click doesn't switch in tests | `fireEvent.click` doesn't fire Radix pointer events | Use `userEvent.setup().click()` for Radix tabs/dropdowns |

---

## Docker / Deployment Issues

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Container named `go-cms-*` instead of `gg-cms-*` | Compose lacked `name: gg-cms` when first started | `docker compose down -v` then `docker compose up -d` with correct file |
| Nginx container restarting | `nginx.conf` written with BOM | Rewrite without BOM (see above) |
| `docker ps` returns 500 | Docker Desktop still initialising | Wait 30–60s for daemon |
| Postgres unhealthy on fresh start | `gg_cms` DB not created during healthcheck window | Healthcheck retries 5×; becomes healthy once `CREATE DATABASE` completes |
| mTLS certs missing for full Docker mode | `generate-certs.sh` not run | `cd release/certs && bash generate-certs.sh` |
| Backend Docker build fails | Docker Hub blocked by proxy | Pre-pull base images or use `deploy-backend.ps1 -Load` |

---

## Content Workflow Issues

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Article stuck in REVIEW | Reviewer not assigned | Admin: `POST /api/cms/:id/assign-reviewer` with `{ userId }` |
| `assign-reviewer` returns 400 | Body uses `reviewerId` instead of `userId` | Backend DTO field is `userId` — match it |
| Course actions need `?type=COURSE` | Default CMS type is ARTICLE | Append `?type=COURSE` to submit/approve/publish/assign-reviewer |
| Published article shows old content | Snapshot fields not updated | `published_title/description/body` updated only on Publish action |
| Publish succeeds but status still APPROVED | `has_pending_draft=true` | Normal — published version + pending draft both exist |

---

## Quick Diagnostic Commands

```bash
# Is backend healthy?
curl -s http://localhost:1337/api/features | head -c 100

# Check backend logs
tail -30 release/dist/native/logs/app.log

# Check startup errors
tail -20 release/dist/native/logs/stderr.txt

# Docker container health
docker ps --filter "name=gg-cms" --format "{{.Names}}: {{.Status}}"

# Run unit tests (fastest sanity check)
cd backend/go-cms && go test ./internal/... -short -count=1

# Frontend lint + types
cd frontend/react-ui && npm run lint && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```
