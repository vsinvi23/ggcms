# GG-CMS — Onboarding Runbook

---

## First Setup (Windows — Dev Mode)

```powershell
# 1. Prerequisites
go version          # 1.25+
node --version      # 20+
docker --version    # Desktop running

# 2. Backend
cd gg-cms/backend/go-cms
cp .env.example .env
# Edit .env: JWT_SECRET (≥32 chars), ADMIN_PASSWORD, CORS_ALLOWED_ORIGINS
go build ./...      # must exit 0

# 3. Databases
docker compose up -d
# gg-cms-postgres (:5433) + gg-cms-mongodb (:27017) — wait for "healthy"

# 4. Run backend
go run ./cmd/server/main.go
# Applies 27 migrations → seeds admin → listens :1337

# 5. Frontend
cd ../../frontend/react-ui
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:1337/api
npm run dev            # Vite at :8080

# 6. Verify
curl http://localhost:1337/api/features   # → {"success":true,"data":{...}}
open http://localhost:8080                # → React app loads
```

> **CORS:** Add `http://localhost:8080` to `CORS_ALLOWED_ORIGINS` for browser API calls.

---

## Release Package (Windows — No Build Tools)

```powershell
cd release

# Edit dist/native/.env (UTF-8 NoBOM — critical!)
# PowerShell tip: use [System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding($false))

docker compose -f docker-compose.native.yml up -d   # Postgres + MongoDB + Nginx

cd dist/native
.\server.exe   # reads .env, runs migrations, listens :1337

# Open http://localhost  (nginx serves React + proxies /api → :1337)
```

---

## First Commit Checklist

- [ ] `go build ./...` — 0 errors
- [ ] `go vet ./...` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` — 0 errors
- [ ] Read `CLAUDE.md` and `.ai/memory-bank.md`

---

## Where Is X?

| Question | Answer |
|----------|--------|
| Entry point | `backend/go-cms/cmd/server/main.go` |
| Route wiring | `backend/go-cms/internal/interfaces/http/router.go` |
| Business logic | `backend/go-cms/internal/application/*/service.go` |
| DB migrations | `backend/go-cms/migrations/postgres/*.sql` (27 files) |
| API types | `frontend/react-ui/src/api/types.ts` |
| Auth context | `frontend/react-ui/src/contexts/AuthContext.tsx` |
| Axios instance | `frontend/react-ui/src/api/client.ts` |
| Feature flags | `app_settings` table → `GET /api/features` |
| Content workflow rules | `.ai/memory-bank.md` §Content Workflow |
| Security guidelines | `.ai/context/lint-security-guidelines.md` |
| Test patterns | `.ai/templates/test-template.md` |
| Architecture decisions | `.ai/adr/` (8 ADRs) |
