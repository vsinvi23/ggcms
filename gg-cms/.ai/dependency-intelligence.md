# Dependency Intelligence

> Critical dependencies, upgrade risks, and coupling analysis.

---

## Backend Dependencies (go.mod)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| `github.com/gin-gonic/gin` | v1.9.1 | HTTP framework | Low — stable API |
| `gorm.io/gorm` | v1.25.12 | ORM | Medium — serializer behavior changes between minor versions |
| `gorm.io/driver/postgres` | v1.5.9 | PG driver via pgx | Low |
| `github.com/jackc/pgx/v5` | v5.5.5 | PostgreSQL driver | Low — `lib/pq` NOT available, use pgx patterns |
| `go.mongodb.org/mongo-driver` | v1.16.1 | MongoDB driver | Low |
| `github.com/golang-jwt/jwt/v5` | v5.2.1 | JWT signing/validation | Low |
| `github.com/graphql-go/graphql` | v0.8.1 | GraphQL (public API) | Low — limited usage |
| `go.uber.org/zap` | v1.27.0 | Structured logging | Low |
| `github.com/spf13/viper` | v1.19.0 | Config loading | Low |
| `github.com/joho/godotenv` | v1.5.1 | .env loading | Low |
| `github.com/google/uuid` | v1.6.0 | UUID generation | Low |
| `github.com/gosimple/slug` | v1.14.0 | Slug generation | Low |

**Critical:**  
- `lib/pq` is NOT in go.mod — use `pgx` patterns. GORM's JSONB serializer (`gorm:"type:jsonb;serializer:json"`) works without `lib/pq`.
- `golang.org/x/oauth2` is indirect — must remain as indirect until OAuth fully implemented.

---

## Frontend Dependencies (package.json highlights)

| Package | Purpose | Risk |
|---------|---------|------|
| `react` | v19 | UI framework — concurrent features enabled |
| `@tanstack/react-query` | v5 | Server state — v5 API differs significantly from v4 |
| `@reduxjs/toolkit` | State management | Low — minimal usage |
| `axios` | HTTP client | Low |
| `@radix-ui/*` | Headless UI primitives (Shadcn) | Low |
| `tailwindcss` | Styling | Low |
| `react-router-dom` | v6 routing | Low |
| `zod` | Form validation | Low |
| `lucide-react` | Icons | Low |
| `sonner` | Toast notifications | Low |
| `date-fns` | Date formatting | Low |
| `vite` | Build tool | Low |

**Critical:**  
- React Query v5 uses `{ queryKey, queryFn }` object form — never use v4's positional arguments
- React 19 — strict mode is enabled; double-invocation of effects in dev is expected

---

## Infrastructure Dependencies (docker-compose)

| Service | Image | Purpose |
|---------|-------|---------|
| PostgreSQL | postgres:15 (assumed) | Primary relational DB |
| MongoDB | mongo:7 (assumed) | Document store |
| Redis | redis:7 (assumed) | Cache + rate limiting |
| Kafka | confluentinc/cp-kafka | Message queue |
| Zookeeper | confluentinc/cp-zookeeper | Kafka coordination |

---

## Critical Coupling Map

```
main.go
  └── ALL repositories (direct dependency — tight coupling by design)
  └── ALL services (assembled here — acceptable for app composition)
  └── httpserver.Services struct (must stay in sync with all services)

router.go
  └── Services struct (must be updated for every new service)
  └── Every handler (handler init must match router registration)

interfaces.go
  └── ALL repository interfaces (breaking change = compile error everywhere)

entity/ files
  └── repository/interfaces.go (entity types used in all signatures)
  └── application/*/service.go (entities used in business logic)
  └── dto/ files (entity → DTO mapping in handlers)
```

**High-Risk Change Areas:**
- `interfaces.go` — changing any interface signature breaks ALL implementations
- `router.go` Services struct — forgetting to add a new service = nil pointer panic
- Migration files — any modification to existing migrations breaks idempotency
- `api/types.ts` — shared TS types; changes break multiple components

---

## Missing Integrations (Declared but Not Implemented)

| Feature | Status | Where |
|---------|--------|-------|
| Redis caching | Declared in stack, not wired in app | `pkg/database/` (no redis.go) |
| Kafka producer | Listed in arch docs, not in application services | No kafka package in internal/ |
| Rate limiting across pods | In-memory only | `middleware/rate_limit.go` |
| Email IMAP/Graph | Stub | No email package beyond SMTP proxy in DLP |
| SSO / LDAP | Planned Phase 0 | Not in repo |

---

## Upgrade Risks

| Upgrade | Risk | Impact |
|---------|------|--------|
| Go 1.25 → next | Low | Check for deprecated APIs |
| GORM v1.25 → v2 major | High | Serializer API may change |
| React Query v5 → v6 | Medium | Hook API changes likely |
| React 19 → 20 | Low | Concurrent features are stable |
| Gin v1.9 → v2 | Medium | Router API changes expected |
| MongoDB driver v1 → v2 | High | Breaking changes in collection API |
