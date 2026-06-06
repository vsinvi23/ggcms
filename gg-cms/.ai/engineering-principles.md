# Engineering Principles

> Non-negotiable quality standards for this codebase.

---

## Architecture Principles

**1. Layer Isolation**
- Each layer communicates only with the layer directly below it
- No layer skipping — handlers → services → repositories → DB
- Domain entities are never passed to HTTP handlers (use DTOs)

**2. Interface-First**
- Define the contract (interface) before the implementation
- Service interfaces and repository interfaces are the specification
- All inter-layer dependencies are on interfaces, not concrete types

**3. Single Responsibility**
- One service per domain concept
- One handler file per domain
- One repository implementation per storage backend per domain
- DTOs are transport-only — no business logic

**4. Minimal Surface Area**
- Expose only what is needed at each layer
- Keep Service interfaces small — add methods only when required
- Prefer explicit over implicit dependencies

---

## Go Principles

**Explicit error handling**
```go
// Always check errors and wrap with context
if err != nil {
    return nil, fmt.Errorf("create article: %w", err)
}
```

**Constructor pattern**
```go
func NewService(repo repository.XxxRepository) Service {
    return &service{repo: repo}
}
```

**Context propagation**
```go
// Always thread ctx through DB calls
r.write.WithContext(ctx).Create(entity)
r.read.WithContext(ctx).Where(...).First(&entity)
```

**Nil checks on optional relations**
```go
// Preload optional associations, check before use
if entity.Category != nil {
    // use entity.Category.Name
}
```

---

## TypeScript/React Principles

**No data fetching in components**
```typescript
// Bad
function MyComponent() {
  const [data, setData] = useState([]);
  useEffect(() => { fetch('/api/x').then(r => setData(r.json())); }, []);
}

// Good
function MyComponent() {
  const { data } = useX();  // hook handles everything
}
```

**Typed boundaries**
- All API response types declared in `src/api/types.ts`
- No `any` except at extreme API boundaries (legacy compat)
- Service functions return typed promises, not `Promise<any>`

**Immutable state**
- Redux state updated via reducers/slices only
- React Query cache invalidated via queryClient, not manual mutation

**Component boundaries**
- Pages = route-level orchestration, minimal logic
- Components = pure presentation + local state
- Complex logic → custom hooks
- Cross-component state → React Query cache or Redux

---

## Database Principles

**Idempotent migrations**
```sql
CREATE TABLE IF NOT EXISTS ...;
ALTER TABLE x ADD COLUMN IF NOT EXISTS y ...;
CREATE INDEX IF NOT EXISTS ...;
INSERT INTO ... ON CONFLICT DO NOTHING;
```

**Read/write split**
```go
r.write.WithContext(ctx).Create(...)  // mutating operations
r.read.WithContext(ctx).Find(...)     // read operations
```

**No raw SQL in application code**
- All queries through GORM
- Raw SQL only in migration files

**Pagination always**
- FindAll methods always accept `page, size int`
- Never return unbounded result sets from APIs
- Current: OFFSET/LIMIT (cursor pagination is a scalability upgrade)

---

## API Principles

**Consistent response shape**
```go
// Success: always wrap in response helpers
response.OK(c, data)
response.Paged(c, items, total, page, size)

// Errors: always use response helpers
response.BadRequest(c, "descriptive message")
response.NotFound(c, "resource not found")
```

**Route naming**
```
GET    /api/resource          list
POST   /api/resource          create
GET    /api/resource/:id       get one
PUT    /api/resource/:id       replace
DELETE /api/resource/:id       delete
POST   /api/resource/:id/action  state transition
```

**DTO validation**
```go
// Use binding tags on DTOs
type CreateRequest struct {
    Name string `json:"name" binding:"required,min=1,max=255"`
    Email string `json:"email" binding:"required,email"`
}
if err := c.ShouldBindJSON(&body); err != nil {
    response.BadRequest(c, err.Error())
    return
}
```

---

## Security Principles

- All protected routes behind `authMW := middleware.Auth(jwtManager)`
- Admin-only routes additionally wrapped with `middleware.AdminOnly()`
- User ID always from `middleware.GetUserID(c)` — never from request body
- File uploads stored in `/uploads/` only — no path traversal
- JWT in HttpOnly cookie (preferred) or Authorization header (fallback)
- CORS must be restricted to known origins in production

---

## Testing Principles

- Test behavior, not implementation — test the service interface, not internals
- One test file per source file (`*_test.go` / `*.test.ts` in same directory)
- Table-driven tests for Go services with multiple input cases
- Happy path + at least one failure path per public function
- No test that only verifies the mocks were called — verify outcomes

---

## Performance Principles

- Category tree is unbounded — add pagination if dataset grows past 500 nodes
- Task list GetUserTasks: avoid N+1 by preloading CMS relations in one query
- Frontend: staleTime ≥ 2 min for mostly-static data (tags, categories, content-types)
- MongoDB: create indexes before writing high-volume event data
- Never block the audit shipper — use fire-and-forget with buffering
