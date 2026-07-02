# Backend — Go CMS (CLAUDE.md)

> Component-level conventions for `backend/go-cms/`. Supplements root `CLAUDE.md`.

---

## Verify After Every Change

```bash
go build ./...                              # must exit 0
go vet ./...                                # must exit 0
go test ./internal/... -short -count=1      # all pass
```

---

## Layer Rules (Clean Architecture)

```
cmd/server/        — entry only; wires everything, no logic
internal/domain/   — entities + repository interfaces; NO imports from outer layers
internal/application/ — business logic; depends only on domain interfaces
internal/infrastructure/ — DB implementations; depends on domain + stdlib
internal/interfaces/http/ — HTTP handlers/DTOs; depends on application layer
pkg/               — shared helpers (response, logger, jwt, config, pagination)
```

**Violation check:** `grep -r "gorm.DB" internal/application/` must be empty.

---

## Adding a New Service

```
1. internal/domain/entity/xxx.go          — GORM struct
2. backend/go-cms/migrations/postgres/NNN_xxx.sql — idempotent migration
3. internal/domain/repository/interfaces.go      — add interface
4. internal/infrastructure/persistence/postgres/xxx_repository.go — implement
5. internal/application/xxx/service.go    — business logic
6. internal/interfaces/http/dto/xxx_dto.go — request/response structs
7. internal/interfaces/http/handler/xxx_handler.go — Gin handler
8. internal/interfaces/http/router.go     — wire into Services + routes
9. cmd/server/main.go                     — inject repo into service
```

---

## Patterns

### Handler
```go
func (h *XxxHandler) Create(c *gin.Context) {
    var req dto.CreateXxxRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.BadRequest(c, err.Error())
        return
    }
    userID := middleware.GetUserID(c)
    result, err := h.service.Create(c.Request.Context(), userID, req.Name)
    if err != nil {
        response.InternalError(c, err.Error())
        return
    }
    response.Created(c, result)
}
```

### Repository Method Names
`FindByID` · `FindAll` · `FindByUserID` · `Create` · `Update` · `Delete` · `Upsert` · `Count`

### Response Helpers (pkg/response/)
`OK(c, data)` · `Created(c, data)` · `BadRequest(c, msg)` · `Unauthorized(c)` · `Forbidden(c)` · `NotFound(c, msg)` · `InternalError(c, msg)`

### Middleware
- `middleware.GetUserID(c)` — extract user ID from JWT (never trust body)
- `middleware.AdminOnly()` — 403 if not admin
- `middleware.AuthRateLimit()` — on auth endpoints only
- `middleware.LogAudit(c, action, entityType, entityID, ...)` — audit trail

---

## Migration Rules

```sql
-- NNN_description.sql (idempotent)
ALTER TABLE xxx ADD COLUMN IF NOT EXISTS yyy TEXT;
INSERT INTO app_settings (key, value) VALUES ('x.y', 'z') ON CONFLICT (key) DO NOTHING;
```

File naming: `027_short_description.sql` — increment from current max.  
Also copy to: `release/dist/native/migrations/postgres/`

---

## Test Location

```
internal/application/cms/service_security_test.go   — service-level security
internal/interfaces/http/handler/cms_handler_security_test.go  — handler-level
internal/interfaces/http/middleware/rate_limit_test.go
tests/api/review_workflow_test.go  — integration (needs live DB)
```
