# CLAUDE.md — Project conventions for AI assistance

## Key conventions

- **Backend**: Go (`backend/go-cms/`), **Frontend**: React+Vite (`frontend/react-ui/`)
- Always run `go build ./...` from `backend/go-cms/` to verify backend changes compile
- Always run `npx tsc --noEmit -p tsconfig.app.json` from `frontend/react-ui/` to verify frontend changes
- Category entity lives in `backend/go-cms/internal/domain/entity/category.go`
- Frontend hooks pattern: `src/api/hooks/use*.ts` → `src/api/services/*Service.ts`
- Do NOT add comments, docstrings, or error handling beyond what is asked
- Do NOT refactor surrounding code when fixing a bug — minimal, targeted changes only
- Do NOT add new abstractions, helpers, or utilities for one-off operations

## Code graph — MANDATORY

This project is indexed by the **codebase-memory MCP**. Graph-derived docs live in `.ai-memory/`.

- **Discovery FIRST:** before editing, use `search_graph` / `trace_path` / `get_code_snippet`
  to locate code and understand call chains — not raw grep/glob.
- **Update on EVERY feature:** after any feature, refactor, or schema change you MUST
  re-index the graph and refresh affected `.ai-memory/` files. This is a hard gate, not optional.
  ```
  index_repository(repo_path="…/gocms/gg-cms", mode="moderate")
  detect_changes(project="C-Vivek-…-gg-cms", since="HEAD~1", depth=2)
  # then regenerate .ai-memory/summaries/overview.md (+ any affected module/arch file)
  ```
- Full procedure: `.ai-memory/runbooks/feature-development.md` §5 and `.ai-memory/README.md`.

## Architecture at a glance

```
backend/go-cms/
  cmd/server/main.go              — entry point; runs migrations then starts server
  migrations/postgres/*.sql       — idempotent SQL migrations (run on every start)
  internal/domain/entity/         — GORM entities
  internal/domain/repository/     — repository interfaces
  internal/infrastructure/persistence/postgres/  — GORM implementations
  internal/application/*/service.go  — business logic services
  internal/interfaces/http/
    router.go                     — Gin route wiring
    handler/                      — HTTP handlers
    dto/                          — request/response DTOs
  internal/bootstrap/admin.go     — seed admin user + Geek virtual category

frontend/react-ui/src/
  api/services/*Service.ts        — axios API calls
  api/hooks/use*.ts               — React Query hooks wrapping services
  api/types.ts                    — shared TS types/interfaces
  pages/                          — route-level React components
  components/                     — reusable UI components
```

## Virtual "geek" category

The root category `geek` (`is_virtual = true`) is hidden from all regular UI.
- Backend: `GetTree(ctx, false)` strips it; pass `true` only for internal/admin use
- Frontend: filter with `.filter(c => !c.isVirtual)` before rendering
- Admin group is auto-linked to Geek so admins review all categories

## Lint & security gates (run before every commit)

```bash
# Backend
cd backend/go-cms && go build ./... && go vet ./...
cd backend/go-cms && go test ./internal/... -short -count=1

# Frontend
cd frontend/react-ui && npm run lint           # must exit 0, no output
cd frontend/react-ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json

# Before commit  →  /pre-commit
# Before PR      →  /review-change  then  /review-security
# Full guidelines →  .ai/context/lint-security-guidelines.md
```

**HARD-blocking lint rules (never suppress):**
- `react-hooks/rules-of-hooks` — conditional hook = runtime crash; move all hooks above early returns
- `@typescript-eslint/no-explicit-any` — use `unknown` or a typed interface
- `no-control-regex` — embedded null/control bytes in regex; write the char class explicitly
- `@typescript-eslint/no-require-imports` — use ESM `import` in TS files

## Scalability targets (1 M users)

- DB: PgBouncer + read replica (separate GORM instances); cursor pagination over OFFSET
- Cache: Redis with `singleflight.Group` for thundering-herd prevention
- Rate limiting: Redis counters shared across pods (not in-memory)
- Frontend: `React.lazy` per route, bundle ≤ 300 KB gzip, `@tanstack/react-virtual` for long lists
