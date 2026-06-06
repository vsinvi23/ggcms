# Database Context

## PostgreSQL — Connection Model

```go
// Two connections: write (primary) + read (replica or same)
pgDB.Write  // all INSERT, UPDATE, DELETE, transactions
pgDB.Read   // all SELECT queries

// Usage in repositories:
r.write.WithContext(ctx).Create(entity)
r.read.WithContext(ctx).Where(...).Find(&items)
```

## Migration System

- Files: `migrations/postgres/001_initial.sql` → `025_user_profile_multiprofile.sql`
- Run on every server start via `migrations.Run(pgDB.Write)` in main.go
- ALL migrations must be idempotent:
  ```sql
  CREATE TABLE IF NOT EXISTS ...
  ALTER TABLE x ADD COLUMN IF NOT EXISTS y ...
  CREATE INDEX IF NOT EXISTS ...
  INSERT INTO ... ON CONFLICT DO NOTHING;
  ALTER TABLE x DROP CONSTRAINT IF EXISTS ...
  ```
- Next number: check existing files, use sequential number
- File naming: `NNN_description.sql`

## Migration Template

```sql
-- NNN_feature_name.sql
-- Brief description of what this migration does

ALTER TABLE target_table ADD COLUMN IF NOT EXISTS new_col VARCHAR(100) NOT NULL DEFAULT 'value';

CREATE TABLE IF NOT EXISTS new_table (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL DEFAULT 'Default',
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_table_user_id ON new_table(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_new_table_unique_key ON new_table(user_id, name);
```

## GORM Entity Template

```go
package entity

import "time"

type Xxx struct {
    ID        uint      `gorm:"primaryKey;autoIncrement"`
    UserID    uint      `gorm:"index;not null"`
    Name      string    `gorm:"type:varchar(255);not null"`
    IsActive  bool      `gorm:"not null;default:true"`
    Data      []int64   `gorm:"type:jsonb;serializer:json;not null;default:'[]'"`
    Meta      *string   `gorm:"type:text"`
    CreatedAt time.Time
    UpdatedAt time.Time
    // For soft delete:
    // DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (Xxx) TableName() string { return "xxxs" }
```

## JSONB Columns (No lib/pq needed)

```go
// Use GORM's built-in JSON serializer
Data []int64 `gorm:"type:jsonb;serializer:json;not null;default:'[]'"`
Meta map[string]interface{} `gorm:"type:jsonb;serializer:json"`
```

## Partial Unique Index (PostgreSQL)

```sql
-- Only one active profile per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_one_default
    ON user_profiles(user_id) WHERE is_default = TRUE;
```

In GORM upsert:
```go
Clauses(clause.OnConflict{
    Where:     clause.Where{Exprs: []clause.Expression{clause.Expr{SQL: "is_default = TRUE"}}},
    Columns:   []clause.Column{{Name: "user_id"}},
    DoUpdates: clause.AssignmentColumns([]string{"field1", "updated_at"}),
})
```

## Key Relationships

```
users ←→ groups            (M2M: user_groups)
categories → categories    (self-referential: parent_id)
categories ←→ groups       (M2M: category_reviewer_groups — for review routing)
categories ←→ tags         (M2M: category_tags)
articles → categories      (FK: category_id)
courses → categories       (FK: category_id)
courses → sections → lessons (1:N:N)
users → enrollments → courses (with completed_lessons M2M)
users → tasks → articles/courses
users → user_profiles      (1:N — multiple named profiles)
learning_paths → courses   (M2M: learning_path_courses with sort_order)
articles/courses → content_reviews (1:N — multi-reviewer tracking)
```

## MongoDB Collections

| Collection | Key Fields | Indexes Needed |
|-----------|-----------|---------------|
| `analytics_events` | event_type, user_id, content_id, created_at | user_id, event_type |
| `audit_logs` | action, target_type, actor_id, created_at | actor_id, action |
| `comments` | content_type, content_id, parent_id | (content_type, content_id) |
| `reactions` | user_id, content_type, content_id | unique(user_id, content_type, content_id) |
| `notes` | user_id, content_type, content_id | unique(user_id, content_type, content_id) |
| `favourites` | user_id, content_type, content_id | (user_id, content_type, content_id) |
| `highlights` | user_id, content_type, content_id | (user_id, content_type, content_id) |

## MongoDB Repository Template

```go
type xxxRepository struct {
    col *mongo.Collection
}

func NewXxxRepository(db *mongo.Database) repository.XxxRepository {
    return &xxxRepository{col: db.Collection("xxx_collection_name")}
}

func (r *xxxRepository) Create(ctx context.Context, x *entity.Xxx) error {
    x.ID = primitive.NewObjectID()
    x.CreatedAt = time.Now()
    _, err := r.col.InsertOne(ctx, x)
    return err
}

func (r *xxxRepository) FindByUser(ctx context.Context, userID uint) ([]*entity.Xxx, error) {
    filter := bson.M{"user_id": userID}
    opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
    cursor, err := r.col.Find(ctx, filter, opts)
    if err != nil {
        return nil, err
    }
    var items []*entity.Xxx
    if err := cursor.All(ctx, &items); err != nil {
        return nil, err
    }
    return items, nil
}
```

## Redis (Declared, Not Yet Wired)

Redis is in the Docker stack but no Go Redis client is in go.mod yet.  
When implementing Redis caching:
1. Add `github.com/redis/go-redis/v9` to go.mod
2. Create `pkg/database/redis.go` connection factory
3. Add `RedisDB` to config struct
4. Wire in main.go

Planned uses: rate limiting (shared across pods), token cache, URL category TTL, recommendation score cache.

## Soft Delete Pattern

```go
// Entity must have DeletedAt field
DeletedAt gorm.DeletedAt `gorm:"index"`

// GORM automatically adds WHERE deleted_at IS NULL to all queries
// Hard delete: db.Unscoped().Delete(&entity)
```

## Common Query Patterns

```go
// Preload associations
r.read.WithContext(ctx).Preload("Category").Preload("CreatedBy").First(&article, id)

// Scoped query
r.read.WithContext(ctx).
    Where("status = ? AND category_id = ?", status, catID).
    Order("created_at DESC").
    Offset(page * size).Limit(size).
    Find(&items)

// Count + fetch
var total int64
q := r.read.WithContext(ctx).Model(&entity.Article{}).Where(conditions)
q.Count(&total)
q.Offset(page * size).Limit(size).Find(&items)
```
