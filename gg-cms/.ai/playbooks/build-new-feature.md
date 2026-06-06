# Playbook: Build New Feature

## Pre-Work Checklist

- [ ] Load `memory-bank.md` and `session-init.md`
- [ ] Identify all affected layers (migration? entity? service? handler? frontend?)
- [ ] Read all files that will be modified — understand current state
- [ ] Identify the pattern to follow (find the most similar existing feature)

---

## Step-by-Step Order

### Step 1: Database (if new table/column needed)

1. Check next migration number: `ls migrations/postgres/`
2. Create `migrations/postgres/NNN_feature_name.sql` (idempotent SQL)
3. Add `IF NOT EXISTS` to all DDL statements
4. Add `ON CONFLICT DO NOTHING` to all inserts

### Step 2: Go Entity

```go
// internal/domain/entity/feature_name.go
type FeatureName struct {
    ID        uint      `gorm:"primaryKey;autoIncrement"`
    // ... fields
    CreatedAt time.Time
    UpdatedAt time.Time
}
func (FeatureName) TableName() string { return "feature_names" }
```

### Step 3: Repository Interface

Add to `internal/domain/repository/interfaces.go`:
```go
type FeatureNameRepository interface {
    Create(ctx context.Context, x *entity.FeatureName) error
    FindByID(ctx context.Context, id uint) (*entity.FeatureName, error)
    FindAll(ctx context.Context, page, size int) ([]*entity.FeatureName, int64, error)
    Update(ctx context.Context, x *entity.FeatureName) error
    Delete(ctx context.Context, id uint) error
}
```

### Step 4: Repository Implementation

Create `internal/infrastructure/persistence/postgres/feature_name_repository.go`:
- Copy pattern from nearest similar repository
- Use `r.write` for mutations, `r.read` for queries
- Return `nil, nil` for not-found (not an error)

### Step 5: Application Service

Create `internal/application/featurename/service.go`:
- Define `Service interface` first
- Define request structs (`CreateRequest`, `UpdateRequest`)
- Implement `service` struct with `NewService(repo) Service`

### Step 6: DTOs

Add to or create `internal/interfaces/http/dto/featurename_dto.go`:
- Request DTO with binding tags
- Response DTO mapping from entity

### Step 7: Handler

Create `internal/interfaces/http/handler/featurename_handler.go`:
- `NewFeatureNameHandler(svc featurenamesvc.Service) *FeatureNameHandler`
- Standard CRUD methods: GetAll, GetByID, Create, Update, Delete

### Step 8: Wire into Router

In `internal/interfaces/http/router.go`:
```go
// 1. Add to Services struct:
FeatureName featurenamesvc.Service

// 2. Add handler init:
fnH := handler.NewFeatureNameHandler(svcs.FeatureName)

// 3. Add routes:
api.GET("feature-names", fnH.GetAll)
api.GET("feature-names/:id", fnH.GetByID)
p.POST("feature-names", fnH.Create)
p.PUT("feature-names/:id", fnH.Update)
p.DELETE("feature-names/:id", fnH.Delete)
```

### Step 9: Wire into main.go

```go
// In main.go, after repository declarations:
featureNameRepo := pgrepo.NewFeatureNameRepository(pgDB.Write, pgDB.Read)

// In svcs declaration:
FeatureName: featurenamesvc.NewService(featureNameRepo),
```

### Step 10: Backend Verification

```bash
cd backend/go-cms && go build ./...
```
Must produce zero output (no errors).

---

## Frontend Steps (if UI needed)

### Step 11: Types

Add to `src/api/types.ts`:
```typescript
export interface FeatureNameDto { id: number; name: string; createdAt: string; }
export interface CreateFeatureNameDto { name: string; }
```

### Step 12: Service

Create `src/api/services/featureNameService.ts`:
- Follow pattern from nearest existing service
- All methods return typed promises

### Step 13: Hook

Create `src/api/hooks/useFeatureName.ts`:
- Query keys: `['feature-names', ...]`
- Queries + mutations with proper invalidation

### Step 14: Component/Page

- Add to `App.tsx` routes if a new page
- Create component file under appropriate `components/` subdirectory
- Use hooks — never fetch directly in component

### Step 15: Frontend Verification

```bash
cd frontend/react-ui && npx tsc --noEmit -p tsconfig.app.json
```
Must produce zero output.

---

## Done Criteria

- [ ] `go build ./...` passes
- [ ] `tsc --noEmit` passes
- [ ] Route is accessible (no nil pointer in router)
- [ ] Response matches expected JSON shape
- [ ] Frontend type matches backend response shape
