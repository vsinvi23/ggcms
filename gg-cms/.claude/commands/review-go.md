# Go Best Practices Review

Review the Go file or package described in `$ARGUMENTS` against this project's architecture standards and 1M-user scalability targets.

## Project architecture
```
go-cms/
  cmd/server/main.go          ← wiring only; no business logic
  internal/
    domain/
      entity/                 ← plain structs + constants; no framework imports
      repository/interfaces.go ← pure Go interfaces; no implementation
    application/<domain>/
      service.go              ← business logic; depends on repository interfaces
    infrastructure/
      persistence/postgres/   ← GORM implementations
      persistence/mongodb/    ← mongo-driver implementations
      media/                  ← file storage
    interfaces/http/
      handler/                ← Gin handlers; thin; delegate to service
      dto/                    ← request/response structs with binding tags
      middleware/             ← JWT auth, CORS, logger, audit, rate-limit
      router/router.go        ← route registration only
  migrations/postgres/        ← numbered SQL files (NNN_description.sql)
```

---

## Architecture rules
- [ ] **Dependency direction**: `interfaces → application → domain ← infrastructure`. Domain must not import application or infrastructure.
- [ ] **No framework leakage into domain**: `entity/` files must not import `gin`, `gorm`, or any external package beyond `time` / `database/sql` base types.
- [ ] **Thin handlers**: Handlers bind input, call one service method, return response. No business logic in handlers.
- [ ] **Constructor injection**: Dependencies injected via `NewXxx(repo, ...)` — no `init()` magic or global variables.
- [ ] **Interface at the boundary**: Repositories consumed through interfaces in `repository/interfaces.go`, never the concrete struct.

---

## Error handling
- [ ] Errors wrapped with context: `fmt.Errorf("finding article %d: %w", id, err)` — never silently swallowed
- [ ] `errors.Is` / `errors.As` for sentinel checks — never `err.Error() == "..."` string comparison
- [ ] Handler returns the correct HTTP status: 404 not found, 400 bad input, 403 forbidden, 409 conflict, 500 unexpected
- [ ] `context.Context` is the first argument of every service and repository method and is actually passed to every DB call
- [ ] No `context.Background()` inside a handler chain — always propagate the request context
- [ ] All DB calls and outbound HTTP calls have a deadline: `ctx, cancel := context.WithTimeout(ctx, 5*time.Second)`

---

## Concurrency & resources
- [ ] Database connections reused via GORM DB pool — no per-request `sql.Open`
- [ ] **Connection pool tuned for 1M traffic** — verify `main.go` or infrastructure setup sets:
  ```go
  sqlDB, _ := db.DB()
  sqlDB.SetMaxOpenConns(100)        // tune to (DB max_connections / replicas) - buffer
  sqlDB.SetMaxIdleConns(20)
  sqlDB.SetConnMaxLifetime(30 * time.Minute)
  sqlDB.SetConnMaxIdleTime(5 * time.Minute)
  ```
- [ ] `defer rows.Close()` / `defer stmt.Close()` on every manual SQL resource
- [ ] Goroutines have a clear lifecycle — no fire-and-forget without a `WaitGroup` or shutdown channel
- [ ] Shared mutable state guarded by `sync.RWMutex` (prefer `RWMutex` over `Mutex` for read-heavy data)
- [ ] **Graceful shutdown**: `http.Server.Shutdown(ctx)` called on `SIGTERM`/`SIGINT` with a drain timeout (≥ 30 s) so in-flight requests complete

---

## Performance & query discipline
- [ ] No N+1 query: use `Preload("Relation")` or a JOIN — never a loop of single-row selects
- [ ] `SELECT *` avoided where a column subset suffices — name columns explicitly
- [ ] Indexes exist for every column used in `WHERE` / `ORDER BY` / `JOIN ON` (check migration files)
- [ ] **Cursor-based pagination for large result sets**: `OFFSET` degrades past ~10 k rows; use `WHERE id > :cursor ORDER BY id LIMIT :size` for public listing endpoints
- [ ] **Bulk inserts** used for batch writes — not looped single-row `INSERT` statements
- [ ] MongoDB queries on `analytics`, `audit_logs`, `comments` always scoped by an indexed field (`content_id`, `user_id`, `created_at`) — never full-collection scans
- [ ] Slow-query logging enabled in development (`log_min_duration_statement = 100ms` in Postgres)

---

## Caching (Redis) — required at 1M scale
- [ ] **Published content** (`GET /api/public/articles/:slug`) served from Redis cache (TTL 5–15 min); invalidated on publish/send-back
- [ ] **Category tree** cached in Redis (TTL 10 min); invalidated on category create/update/delete
- [ ] **User permission lookup** (group memberships → `GroupPermissions`) cached per user (TTL 5 min, keyed by `user_id`)
- [ ] **Rate limiting counters** stored in Redis (sliding window or token bucket) — not in-process memory, so horizontal pods share the same counter
- [ ] Cache keys follow a consistent namespace: `cms:{env}:{resource}:{id}`
- [ ] Cache stampede protection: use `singleflight.Group` for concurrent misses on the same key
  ```go
  var sf singleflight.Group
  data, _, _ = sf.Do(cacheKey, func() (any, error) { return fetchFromDB(ctx, id) })
  ```

---

## Rate limiting & throttling
- [ ] **Global middleware** enforces per-IP rate limits (e.g. 300 req/min on public endpoints)
- [ ] **Authenticated endpoints** rate-limited per user (e.g. 600 req/min) to prevent scripted abuse
- [ ] **Auth endpoints** (`/login`, `/register`) rate-limited aggressively (e.g. 10 req/min per IP) with exponential back-off to block brute force
- [ ] **File upload endpoints** have a dedicated lower limit (e.g. 10 uploads/min per user)
- [ ] Rate limit headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- [ ] Response is `429 Too Many Requests` — not 403 or 500

---

## Async / background processing
- [ ] **Notifications and emails never sent synchronously inside a handler** — enqueue to a channel or job queue; a separate goroutine/worker pool processes them
- [ ] Worker pool sized explicitly:
  ```go
  const notificationWorkers = 10
  for range notificationWorkers {
      go notificationWorker(ctx, jobs)
  }
  ```
- [ ] Job queue uses Redis or a DB-backed table (`pending_jobs`) so jobs survive pod restarts — no in-memory channel as the only queue
- [ ] Failed jobs retried with exponential back-off; dead-lettered after N attempts with an alert
- [ ] Long-running admin operations (bulk publish, report generation) processed asynchronously and polled by the client — not blocked on a single HTTP request

---

## Database scalability
- [ ] **Read replica** used for all read-only queries (`articleRepo.FindByID`, list endpoints) — only writes go to primary. GORM supports this via two `*gorm.DB` instances (`readDB`, `writeDB`) injected into repositories.
- [ ] **PgBouncer** (or RDS Proxy) sits between the Go service and Postgres in production — prevents connection exhaustion at 1M concurrent users
- [ ] **Table partitioning** planned for `workflow_events` and `audit_logs` (by `created_at` range) before they exceed 50M rows
- [ ] **Partial indexes** used for common filtered queries, e.g.:
  ```sql
  CREATE INDEX idx_articles_review ON articles(category_id, created_at)
  WHERE status = 'REVIEW' AND reviewer_id IS NULL;
  ```
- [ ] **`VACUUM` / `ANALYZE`** scheduled for high-churn tables (`articles`, `courses`, `workflow_events`)
- [ ] No unbounded `IN (...)` clauses — use a `JOIN` or a temp table for large ID sets
- [ ] MongoDB collections have TTL indexes on `created_at` for analytics/audit data (auto-purge data > 2 years)

---

## Observability
- [ ] **Structured logging** (`slog` or `zerolog`) — every log line includes `request_id`, `user_id`, `duration_ms`
- [ ] **Prometheus metrics** exposed on `/metrics`: request count, latency histogram (p50/p95/p99), DB pool stats, cache hit/miss ratio
- [ ] **Distributed tracing** (OpenTelemetry) propagated through all service and repository calls
- [ ] **Health endpoints**: `GET /healthz` (liveness) and `GET /readyz` (readiness — checks DB and Redis connectivity)
- [ ] **Alerting thresholds defined**: p95 latency > 500 ms, error rate > 1%, DB pool exhaustion > 80%

---

## Code quality
- [ ] Functions ≤ 40 lines; methods ≤ 60 lines — split if larger
- [ ] No magic numbers — use named constants from `entity/` package
- [ ] `time.Time` for timestamps — never bare `string` fields for dates
- [ ] Exported types and functions have a one-line doc comment
- [ ] `golint` / `staticcheck` findings addressed (especially G104 — unchecked errors)

---

## Testing
- [ ] Repository integration tests hit a real Postgres container — never mocked (project policy)
- [ ] Service unit tests use mock repositories (`testify/mock` or hand-written)
- [ ] Table-driven tests for all functions with multiple input paths
- [ ] **Load test** added for critical paths (publish, list, submit) using `k6` or `vegeta`; baseline p99 < 200 ms at 500 RPS

---

## Output format
For each finding:
1. **File + line number**
2. **Rule violated** (from the checklist above)
3. **Before** (current code snippet)
4. **After** (corrected snippet)

Group by: Architecture → Correctness → Scalability → Performance → Style.
End with a **Scalability Gap Summary** — the top two or three changes that would have the highest impact on reaching 1M users.
