# Playbook: Onboarding a New Developer

## Prerequisites
- Go 1.25+ · Node.js 20+ · Docker Desktop · Git

---

## Step 1 — Clone & Verify Tools
```bash
git clone <repo> && cd gg-cms
go version         # must be 1.25+
node --version     # must be 20+
docker --version   # must be running
```

## Step 2 — Backend Setup
```bash
cd backend/go-cms
cp .env.example .env
# Edit .env: set JWT_SECRET (≥32 chars), ADMIN_PASSWORD, CORS_ALLOWED_ORIGINS
go build ./...     # Must exit 0 — validates all Go code
```

> **CORS Warning:** If you'll use Vite dev server (port 8080), add `http://localhost:8080` to `CORS_ALLOWED_ORIGINS`.

## Step 3 — Start Databases
```bash
# From backend/go-cms/
docker compose up -d
# Containers: gg-cms-postgres (:5433) + gg-cms-mongodb (:27017)
docker ps          # Both should be "healthy" within 30s
```

## Step 4 — Run Backend
```bash
go run ./cmd/server/main.go
# Runs 27 migrations → seeds admin user → listens :1337
# Login: ADMIN_EMAIL / ADMIN_PASSWORD from .env
```

## Step 5 — Frontend Setup
```bash
cd ../../frontend/react-ui
npm install
cp .env.example .env
# .env: VITE_API_BASE_URL=http://localhost:1337/api
npm run dev        # Vite at :8080
```

## Step 6 — Verify Everything
```
✅ http://localhost:8080          — React SPA loads
✅ http://localhost:1337/api/features — Returns JSON
✅ Login with admin credentials   — Redirects to /dashboard
```

## Step 7 — Read the AI Docs
```
.ai/memory-bank.md        — architecture overview (read first)
.ai/session-init.md       — AI behavior contract
.ai/context/backend.md    — Go patterns
.ai/context/frontend.md   — React patterns
CLAUDE.md                 — authoritative project conventions
```

## Step 8 — Run Tests
```bash
# Backend
cd backend/go-cms && go test ./internal/... -short -count=1

# Frontend unit
cd frontend/react-ui && node node_modules/vitest/vitest.mjs run

# E2E (full stack must be running)
cd frontend/react-ui
PLAYWRIGHT_BASE_URL=http://localhost:8080 \
  node node_modules/@playwright/test/cli.js test --config=playwright.local.config.ts
```

---

## Common First-Day Issues

| Problem | Fix |
|---------|-----|
| `JWT_SECRET required` on server start | `.env` has BOM — rewrite without BOM |
| MongoDB connection timeout | Docker not healthy yet — wait 30s, retry |
| CORS errors in browser | Add `http://localhost:8080` to `CORS_ALLOWED_ORIGINS` |
| `go build` fails | Run from `backend/go-cms/`, not `gg-cms/` root |
| Port 1337 in use | `taskkill /f /im server.exe` (Windows) |
| E2E tests skip | Delete `e2e/.e2e-state.json` — fresh DB needs re-seed |

See `.ai-memory/runbooks.md` §7 for more troubleshooting.
