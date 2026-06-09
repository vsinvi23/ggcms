# Backend Context — Go CMS

## Entry Point Flow

```
main.go
  1. Load config (Viper + .env)
  2. Init zap logger
  3. Connect PostgreSQL (write + read)
  4. Run migrations (migrations/postgres/*.sql in order)
  5. Seed admin user + geek category (bootstrap.SeedAdmin)
  6. Connect MongoDB
  7. Init JWT manager
  8. Construct all repositories
  9. Construct all services
  10. Build Gin router (httpserver.NewRouter)
  11. Start HTTP server with graceful shutdown
```

## Service Constructor Pattern

```go
// In application/xxx/service.go
type Service interface {
    List(ctx context.Context, ...) ([]*entity.Xxx, error)
    GetByID(ctx context.Context, id uint) (*entity.Xxx, error)
    Create(ctx context.Context, req CreateRequest) (*entity.Xxx, error)
    Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Xxx, error)
    Delete(ctx context.Context, id uint) error
}

type service struct {
    repo repository.XxxRepository
}

func NewService(repo repository.XxxRepository) Service {
    return &service{repo: repo}
}
```

## Handler Pattern

```go
// In interfaces/http/handler/xxx_handler.go
type XxxHandler struct {
    svc xxxsvc.Service
}

func NewXxxHandler(svc xxxsvc.Service) *XxxHandler {
    return &XxxHandler{svc: svc}
}

func (h *XxxHandler) GetAll(c *gin.Context) {
    items, err := h.svc.List(c.Request.Context())
    if err != nil {
        response.InternalError(c, "failed to list items")
        return
    }
    response.OK(c, items)
}

func (h *XxxHandler) Create(c *gin.Context) {
    var body dto.CreateXxxRequest
    if err := c.ShouldBindJSON(&body); err != nil {
        response.BadRequest(c, err.Error())
        return
    }
    userID := middleware.GetUserID(c)
    req := xxxsvc.CreateRequest{...}
    item, err := h.svc.Create(c.Request.Context(), req)
    if err != nil {
        response.InternalError(c, "failed to create")
        return
    }
    response.Created(c, item)
}
```

## Repository Pattern (PostgreSQL)

```go
// In infrastructure/persistence/postgres/xxx_repository.go
type xxxRepository struct {
    write *gorm.DB
    read  *gorm.DB
}

func NewXxxRepository(write, read *gorm.DB) repository.XxxRepository {
    return &xxxRepository{write: write, read: read}
}

func (r *xxxRepository) FindByID(ctx context.Context, id uint) (*entity.Xxx, error) {
    var x entity.Xxx
    err := r.read.WithContext(ctx).First(&x, id).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil  // return nil, nil for not found
        }
        return nil, fmt.Errorf("find xxx: %w", err)
    }
    return &x, nil
}

func (r *xxxRepository) Create(ctx context.Context, x *entity.Xxx) error {
    return r.write.WithContext(ctx).Create(x).Error
}

func (r *xxxRepository) FindAll(ctx context.Context, page, size int) ([]*entity.Xxx, int64, error) {
    var items []*entity.Xxx
    var total int64
    q := r.read.WithContext(ctx).Model(&entity.Xxx{})
    if err := q.Count(&total).Error; err != nil {
        return nil, 0, err
    }
    err := q.Offset(page * size).Limit(size).Order("created_at DESC").Find(&items).Error
    return items, total, err
}
```

## MongoDB Repository Pattern

```go
// In infrastructure/persistence/mongodb/xxx_repository.go
type xxxRepository struct {
    col *mongo.Collection
}

func NewXxxRepository(db *mongo.Database) repository.XxxRepository {
    return &xxxRepository{col: db.Collection("xxx")}
}

func (r *xxxRepository) Create(ctx context.Context, x *entity.Xxx) error {
    x.ID = primitive.NewObjectID()
    x.CreatedAt = time.Now()
    _, err := r.col.InsertOne(ctx, x)
    return err
}
```

## Upsert Pattern (ON CONFLICT)

```go
result := r.write.WithContext(ctx).
    Clauses(clause.OnConflict{
        Columns: []clause.Column{{Name: "user_id"}},
        DoUpdates: clause.AssignmentColumns([]string{"field1", "field2", "updated_at"}),
    }).
    Create(entity)
```

## Transaction Pattern

```go
return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
    if err := tx.Model(&Xxx{}).Where("user_id = ?", userID).Update("field", val1).Error; err != nil {
        return err
    }
    return tx.Model(&Xxx{}).Where("id = ?", id).Update("field", val2).Error
})
```

## Pagination in Handlers

```go
page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
items, total, err := h.svc.List(c.Request.Context(), page, size)
response.Paged(c, items, total, page, size)
```

## New Service Wiring Checklist

When adding a new service:
1. `interfaces.go` — add repository interface
2. `entity/xxx.go` — create entity struct with `TableName()`
3. `migrations/postgres/0NN_xxx.sql` — idempotent schema
4. `persistence/postgres/xxx_repository.go` — implement
5. `application/xxx/service.go` — implement service
6. `dto/xxx_dto.go` — request/response structs
7. `handler/xxx_handler.go` — implement handler
8. `router.go` — add to Services struct + init handler + register routes
9. `main.go` — init repo + wire into svcs

## Error Wrapping Convention

```go
return nil, fmt.Errorf("operation context: %w", err)
// Never: return nil, err  (loses context)
```

## Pagination Helper (pkg/pagination)

```go
// if available, use from pkg/pagination
// Otherwise inline:
page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
if size > 100 { size = 100 }
if size < 1 { size = 20 }
```
