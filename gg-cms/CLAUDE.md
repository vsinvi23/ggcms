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

## Scalability targets (1 M users)

- DB: PgBouncer + read replica (separate GORM instances); cursor pagination over OFFSET
- Cache: Redis with `singleflight.Group` for thundering-herd prevention
- Rate limiting: Redis counters shared across pods (not in-memory)
- Frontend: `React.lazy` per route, bundle ≤ 300 KB gzip, `@tanstack/react-virtual` for long lists
