# Full-Stack Best Practices Review (1M-User Edition)

Run a comprehensive security + Go + React + scalability review for the feature or file(s) described in `$ARGUMENTS`.

Read all relevant files first, then work through each section. Skip sections that don't apply to the target (e.g. skip Go for a pure-frontend change). Always run Section 4 — scalability applies to every change.

---

## 1. Security

### Auth & Authorization
- [ ] Every non-public route guarded by `middleware.AuthMiddleware` (Go) / `PrivateRoute` (React)
- [ ] Permission checks use the group-based `GroupPermissions` model — not just "is authenticated"
- [ ] No IDOR: URL param IDs validated against the authenticated user's ownership or role before any DB mutation
- [ ] `GetUserID(c)` for actor identity — never `userId` from request body for ownership decisions
- [ ] Admin-only actions (publish, assign reviewer, delete) check for admin role explicitly
- [ ] JWT `aud` + `iss` claims validated; short-lived tokens (≤ 15 min) + refresh rotation

### Input & Injection
- [ ] All handler inputs bound via `ShouldBindJSON` with `binding:"required"` tags
- [ ] GORM queries use `?` placeholders — no string interpolation of user input
- [ ] File uploads: MIME type validated by reading magic bytes (not just `Content-Type`); size cap enforced
- [ ] React: no `dangerouslySetInnerHTML` without DOMPurify sanitization
- [ ] Rich-text `body` field sanitised server-side with an HTML allowlist policy before store and serve

### Rate Limiting & Abuse
- [ ] Auth endpoints: ≤ 10 req/min per IP; exponential back-off; returns `429` + `Retry-After`
- [ ] Authenticated writes: per-user rate limit; file uploads: separate stricter limit
- [ ] Rate limit counters in Redis — not in-process memory (doesn't survive pod restart or multi-instance)
- [ ] Account lockout after 10 consecutive failed logins

### Secrets & Transport
- [ ] No secrets hardcoded — all from environment variables
- [ ] CORS origin allowlist explicit (not `*` in production)
- [ ] Security headers on all responses: `X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `HSTS`
- [ ] Auth token in memory / `HttpOnly` cookie — not `localStorage`
- [ ] `.env` files in `.gitignore`; secrets never logged

---

## 2. Go Architecture & Quality

### Architecture
- [ ] Dependency direction respected: `interfaces → application → domain ← infrastructure`
- [ ] `entity/` package free of framework imports (gin, gorm, etc.)
- [ ] Handlers are thin: bind input → call service → return response. No business logic in handlers.
- [ ] All dependencies injected via constructors; no package-level global state

### Correctness
- [ ] Errors wrapped with `fmt.Errorf("context: %w", err)` — never swallowed
- [ ] `errors.Is` / `errors.As` for error comparison
- [ ] `context.Context` propagated through every service and repository call; deadlines on all DB calls
- [ ] Correct HTTP status codes: 404 not found, 400 bad input, 403 forbidden, 409 conflict, 500 unexpected

### Concurrency & Resources
- [ ] DB connection pool tuned (`SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`)
- [ ] Graceful shutdown: `http.Server.Shutdown(ctx)` on `SIGTERM` with ≥ 30 s drain
- [ ] No fire-and-forget goroutines without a `WaitGroup` or shutdown channel

### Testing
- [ ] Repository integration tests hit a real Postgres container (not mocks) — project policy
- [ ] Service unit tests use mock repositories (`testify/mock` or hand-written)
- [ ] Table-driven tests for all functions with multiple input paths

---

## 3. React / TypeScript Quality

### Component Design
- [ ] Single responsibility — split if > ~200 lines or mixing data-fetch + complex UI
- [ ] Props typed with a named `interface Props {}`; no `any`
- [ ] Keys are stable entity IDs, never array index for mutable lists

### State & Data Fetching
- [ ] Server state in React Query — no manual `useEffect` + `fetch`
- [ ] Query keys follow the `xxxKeys` factory pattern
- [ ] `staleTime` appropriate: search → 0; reference data (categories, groups) → 5 min+
- [ ] Mutations seed cache with `setQueryData`; invalidate only the narrowest key
- [ ] `enabled` guard prevents queries firing with `id=0` or `slug=undefined`

### TypeScript
- [ ] No `any`, no unchecked `!` assertions, no `as Type` outside API transform layer
- [ ] New API types in `src/api/types.ts`, not defined inline in components

### Bundle & Runtime Performance
- [ ] Heavy pages loaded via `React.lazy` + `<Suspense>` (code splitting)
- [ ] Admin lists with > 100 rows use `@tanstack/react-virtual` (virtualised rendering)
- [ ] Search inputs debounced ≥ 300 ms before triggering a query
- [ ] Expensive computations (`parseBodyToBlocks`, category tree flatten) in `useMemo`

### UX & Accessibility
- [ ] Every mutation has `onError → toast.error(...)` — silent failures are not acceptable
- [ ] Loading states show `<Skeleton>` — no blank space; error boundaries on every route
- [ ] Interactive elements are semantic (`<button>`, `<a>`), not `<div onClick>`
- [ ] Form inputs have associated `<Label htmlFor>` or `aria-label`

---

## 4. Scalability: 1M-User Readiness

This section applies to **every** change. Evaluate the impact on throughput, latency, and cost at 1M active users.

### Infrastructure & Horizontal Scaling
- [ ] **Stateless service**: no in-process session state — JWT carries all identity, so any pod can serve any request. Verify the feature being reviewed doesn't introduce in-process state that breaks this.
- [ ] **Health checks**: `GET /healthz` (liveness) and `GET /readyz` (readiness — checks Postgres + Redis + MongoDB). Required for Kubernetes HPA to work correctly.
- [ ] **Graceful shutdown**: in-flight requests complete before pod exits; connection draining configured on the load balancer (deregistration delay ≥ 30 s).
- [ ] **Horizontal Pod Autoscaler** targets CPU ≤ 70% and p95 latency ≤ 500 ms — scale out before saturation, not after.
- [ ] **Deployment strategy**: rolling update or blue-green; new pods pass readiness check before traffic shifts.

### Database — PostgreSQL
- [ ] **PgBouncer** (or RDS Proxy) between Go service and Postgres. At 1M users, direct connections exhaust `max_connections` (default 100). PgBouncer pools thousands of client connections into a small number of server connections.
- [ ] **Read replicas**: all read-only queries (`FindByID`, list endpoints) routed to replica; only writes go to primary. Implement with two GORM instances (`readDB`, `writeDB`) injected per-repository.
  ```go
  // repository constructor
  func NewArticleRepository(readDB, writeDB *gorm.DB) ArticleRepository
  ```
- [ ] **Cursor-based pagination** on public listing endpoints: `OFFSET N` scans N rows every time; cursor (`WHERE id > :last_seen_id`) is O(log N) regardless of page depth. Switch any endpoint expected to serve deep pages.
- [ ] **Partial indexes** for hot query patterns:
  ```sql
  -- Only index REVIEW rows with no reviewer assigned — much smaller than a full index
  CREATE INDEX idx_articles_unassigned_review
    ON articles(category_id, created_at)
    WHERE status = 'REVIEW' AND reviewer_id IS NULL;
  ```
- [ ] **Table partitioning** by `created_at` for high-churn tables (`workflow_events`, `audit_logs`) before they exceed 50M rows. Partition pruning keeps queries fast.
- [ ] **`VACUUM` / `ANALYZE` schedule**: high-churn tables (`articles`, `courses`, `workflow_events`) need frequent autovacuum; verify `autovacuum_vacuum_scale_factor` is tuned down for these tables.
- [ ] **No unbounded `IN (ids...)`**: use a `JOIN` or temp table for large ID sets to avoid query plan regression.
- [ ] **Query budget enforced**: `statement_timeout = '5s'` in Postgres; every slow query investigated before it reaches production.

### Database — MongoDB
- [ ] **Compound indexes** on `(content_id, created_at)` and `(user_id, created_at)` for comments, notes, analytics — every query scoped to a specific content item or user.
- [ ] **TTL indexes** on `created_at` for analytics and audit_logs to auto-purge data older than your retention policy (e.g. 2 years).
- [ ] **Sharding strategy** planned for collections expected to exceed 100 GB (analytics events, audit_logs) — shard key must distribute writes evenly (avoid monotonic timestamp as shard key; use hashed `_id`).
- [ ] **Replica set** (3 nodes) for HA — single-node MongoDB is a single point of failure.
- [ ] Write concern `majority` for workflow-critical writes (audit events, comment creation).

### Caching — Redis
- [ ] **Published content cache** (`GET /api/public/articles/:slug`): cache the full response in Redis (TTL 5–15 min); invalidate on publish, send-back, or re-publish. This is the highest-traffic read path and should rarely touch the DB.
  ```go
  key := fmt.Sprintf("cms:pub:article:%s", slug)
  // try cache → on miss: query DB + set cache
  ```
- [ ] **Category tree** cached (TTL 10 min) — loaded on almost every page but changes infrequently.
- [ ] **User permission / group membership** cached per `user_id` (TTL 5 min) — eliminates repeated `SELECT ... FROM user_groups` on every authenticated request.
- [ ] **`singleflight`** for concurrent cache misses on the same key (prevents thundering-herd DB load):
  ```go
  var sf singleflight.Group
  result, _, _ = sf.Do(cacheKey, func() (any, error) {
      return repo.FindBySlug(ctx, slug)
  })
  ```
- [ ] **Redis cluster** (or Sentinel) for HA — single-node Redis is a single point of failure at this scale.
- [ ] Cache hit rate monitored via Prometheus metric `cache_hits_total` / `cache_misses_total`; alert if hit rate drops below 80% on published-content endpoint.

### Async Processing
- [ ] **Notifications and emails** never sent synchronously inside a handler — enqueue to Redis Streams or a DB-backed job table; worker pool processes them independently.
- [ ] **Worker pool sized explicitly** and bounded — not an unbounded `go func()` per event:
  ```go
  const workers = 20
  jobs := make(chan NotificationJob, 500)
  for range workers { go notificationWorker(ctx, jobs, svc) }
  ```
- [ ] **Dead-letter queue**: failed jobs moved after N retries with exponential back-off; alert on DLQ growth.
- [ ] **Bulk operations** (batch publish, report export) handled as background jobs polled by the client — not as single long-lived HTTP requests that time out behind a load balancer.

### API Design for Scale
- [ ] **Response compression**: Gin's `gzip` middleware enabled; verify `Accept-Encoding: gzip` handled correctly.
- [ ] **Conditional GET** (`ETag` / `Last-Modified`) on published content — clients cache and revalidate; CDN caches too.
- [ ] **CDN in front of public read endpoints**: `/api/public/*` served from CDN edge with appropriate `Cache-Control: public, s-maxage=60` headers; API gateway / Nginx sets `Vary: Accept-Encoding`.
- [ ] **Request timeout budget**: every external call (Postgres, MongoDB, Redis, S3) has a context deadline. Hung calls must not hold a goroutine indefinitely.
- [ ] **Circuit breaker** on MongoDB and any external HTTP dependency — use `github.com/sony/gobreaker` or equivalent. A MongoDB outage must not cascade to bring down all article reads.

### Observability
- [ ] **Structured logs** (`slog` / `zerolog`): every log line includes `request_id`, `user_id`, `duration_ms`, `status_code`.
- [ ] **Prometheus metrics** at `/metrics`: request rate, error rate, p50/p95/p99 latency, DB pool utilisation, cache hit rate, worker queue depth.
- [ ] **Distributed tracing** (OpenTelemetry): trace spans for handler → service → repository → DB call, exported to Jaeger / Tempo.
- [ ] **Alerting SLOs defined**:
  - p99 API latency > 1 s → page on-call
  - Error rate > 1% over 5 min → page on-call
  - DB pool > 80% used → warn
  - Redis memory > 75% → warn
  - Worker DLQ growing → warn
- [ ] **Runbook per alert**: on-call engineer knows what to do without reading source code at 3 am.

### Frontend at Scale
- [ ] Static assets (JS, CSS, images) on CDN with `Cache-Control: immutable` — Vite fingerprints names.
- [ ] **Code splitting**: each route lazy-loaded; no single chunk > 300 KB gzipped.
- [ ] **Virtualised rendering** for any admin list expected to show > 100 items.
- [ ] **Search debounce** ≥ 300 ms — at 1M users, unthrottled keystroke queries saturate the search index.
- [ ] **React Query `staleTime` for reference data** (categories, groups, content types) ≥ 5 min — these change rarely; caching client-side cuts thousands of redundant GET requests per minute.

---

## Output format

Present findings in five labelled sections (1–4 above + 5 below). For each finding:

1. **File + line number**
2. **Severity**: Critical / High / Medium / Low / Info
3. **Rule violated**
4. **Before** (problematic code)
5. **After** (corrected code)

### Section 5: Scalability Gap Analysis

End with a prioritised table:

| Priority | Gap | Impact at 1M users | Estimated effort |
|----------|-----|--------------------|-----------------|
| P0 | e.g. No PgBouncer | DB connection exhaustion at ~500 concurrent users | 1 day |
| P1 | e.g. Published content not cached | Every page view hits Postgres | 2 days |
| P2 | ... | ... | ... |

**P0** = must fix before scaling beyond current load.
**P1** = fix in the next sprint.
**P2** = plan within the next quarter.
