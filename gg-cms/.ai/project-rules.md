# Project Rules — Hard Constraints

> These rules override any general programming advice. They are derived from CLAUDE.md and codebase conventions.

---

## Verification Gates (Always Run)

```bash
# Backend — run from backend/go-cms/
go build ./...

# Frontend — run from frontend/react-ui/
npx tsc --noEmit -p tsconfig.app.json
```

Both must pass before any change is considered complete.

---

## Code Graph Gate (MANDATORY for every feature)

The codebase-memory MCP graph is the project's discovery + memory layer.

1. **Before coding:** locate code via `search_graph` / `trace_path` (not raw grep).
2. **After any feature/refactor/schema change:** re-index and refresh `.ai-memory/`:
   ```
   index_repository(repo_path="…/gocms/gg-cms", mode="moderate")
   detect_changes(project="C-Vivek-…-gg-cms", since="HEAD~1", depth=2)
   # regenerate .ai-memory/summaries/overview.md + any affected module/arch file
   ```
3. A change is NOT complete until the graph + `.ai-memory/` reflect it.

Procedure: `.ai-memory/runbooks/feature-development.md` §5.

---

## Architecture Rules

### Layering
```
Handler → Service → Repository → Database
```
- Handlers call services. Services call repositories. Repositories call databases.
- Handlers NEVER access DB directly.
- Services NEVER access Gin context.
- Repositories NEVER contain business logic.

### Clean Architecture Order (when adding new functionality)
```
SQL migration → Entity → Repository interface → Repository impl → Service → DTO → Handler → Router → main.go wiring
```

### Repository Interface First
Every new repository method MUST be declared in `internal/domain/repository/interfaces.go` before implementation.

### Service Interface First
Every new service method MUST be declared in the `Service interface` before implementation on the struct.

---

## Database Rules

- All schema changes via numbered migration files in `migrations/postgres/`
- Migration files must use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` (idempotent)
- Next migration number: check existing files + 1
- NEVER alter tables directly — always through migrations
- New PostgreSQL entity → must have `TableName() string` method
- GORM serializer for JSONB arrays: `gorm:"type:jsonb;serializer:json"`
- Partial unique indexes for conditional uniqueness (see user_profiles example)

---

## Security Rules (Non-Negotiable)

```
dangerouslySetInnerHTML  → ALWAYS wrap with sanitizeHtml() from @/lib/sanitize
catch block error msg    → ALWAYS use toUserMessage(err) from @/lib/errors, never err.message
visitor profile storage  → sessionStorage only (lib/visitorProfile.ts) — never localStorage
auth groups              → React state only — NEVER write to sessionStorage
withCredentials          → false in api/client.ts — Bearer header is the auth mechanism
```

## Virtual Category Rule

```go
// Backend: always pass false to hide geek root from users
GetTree(ctx, false)   // user-facing
GetTree(ctx, true)    // admin/internal use only
```

```tsx
// Frontend: always filter before rendering
categories.filter(c => !c.isVirtual)
```

---

## Response Helpers (Backend)

```go
response.OK(c, data)           // 200 with data
response.Created(c, data)      // 201 with data
response.Paged(c, items, total, page, size)
response.BadRequest(c, msg)    // 400
response.Unauthorized(c, msg)  // 401
response.Forbidden(c, msg)     // 403
response.NotFound(c, msg)      // 404
response.InternalError(c, msg) // 500
response.Conflict(c, msg)      // 409
```

Never use `c.JSON(http.StatusXxx, ...)` directly in handlers.

---

## User ID Extraction (Backend)

```go
userID := middleware.GetUserID(c)  // always use this
```

Never decode the JWT manually in handlers.

---

## Frontend Data Patterns

```typescript
// Service: axios call → typed return
// src/api/services/xService.ts
export const xService = {
  getAll: async (): Promise<XDto[]> => {
    const res = await apiClient.get('/x');
    return res.data.data ?? [];
  },
};

// Hook: React Query wrapper
// src/api/hooks/useX.ts
export const useX = () => useQuery({
  queryKey: ['x'],
  queryFn: () => xService.getAll(),
  staleTime: 5 * 60 * 1000,
});

// Mutation pattern
export const useCreateX = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateXDto) => xService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['x'] }),
  });
};
```

---

## Scope Restrictions

| Action | Rule |
|--------|------|
| Fix bug | Change ONLY the failing code. Do not clean up surroundings. |
| Add feature | Touch ONLY the layers the feature requires. |
| Refactor | Only when explicitly requested. |
| Comments | Only if WHY is non-obvious and not derivable from code. |
| Docstrings | Never. |
| Abstractions | Only when a pattern repeats 3+ times AND explicitly requested. |
| Error handling | Only for inputs that can actually fail. Not defensive coding. |

---

## Go Import Style

```go
import (
    "standard library"

    "third-party packages"

    "github.com/serenya/go-cms/internal/..."
    "github.com/serenya/go-cms/pkg/..."
)
```

Three groups separated by blank lines. Match exactly what adjacent files use.

---

## Naming Conventions

### Go
- Service constructors: `NewXxxService(deps...) Service`
- Repository constructors: `NewXxxRepository(write, read *gorm.DB) repository.XxxRepository`
- Handler constructors: `NewXxxHandler(svc xsvc.Service) *XxxHandler`
- Entity constants: `CMSStatusDraft CMSStatus = "DRAFT"`

### TypeScript
- DTOs: `XxxDto`, `XxxCreateDto`, `XxxUpdateDto`, `XxxResponse`
- Service exports: named object `export const xService = { ... }`
- Hook exports: named function `export const useXxx = () => ...`
- Query keys: `['resource-name', 'sub-action', ...params]`
