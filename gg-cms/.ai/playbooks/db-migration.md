# Playbook: Database Migration

## Rules (Non-Negotiable)

1. ALL migrations are idempotent — they can run multiple times without error
2. NEVER modify an existing migration file that has already been applied
3. Always use IF NOT EXISTS, ON CONFLICT DO NOTHING, ADD COLUMN IF NOT EXISTS
4. Next migration number = last file number + 1

## Finding the Next Number

```bash
ls backend/go-cms/migrations/postgres/ | sort
# Use the next sequential number
```

## Migration File Template

```sql
-- NNN_description.sql
-- What this migration does and why.

-- Add column to existing table
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name VARCHAR(100) NOT NULL DEFAULT 'default';

-- Create new table
CREATE TABLE IF NOT EXISTS table_name (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_name_user_id ON table_name(user_id);
CREATE INDEX IF NOT EXISTS idx_table_name_name ON table_name(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_name_unique ON table_name(user_id, name);

-- Partial unique index (conditional uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_name_one_default
    ON table_name(user_id) WHERE is_default = TRUE;

-- Seed data
INSERT INTO table_name (key, value) VALUES
    ('key1', 'value1'),
    ('key2', 'value2')
ON CONFLICT (key) DO NOTHING;

-- Remove constraint before adding a different one
ALTER TABLE table_name DROP CONSTRAINT IF EXISTS old_constraint_name;
```

## Common Patterns

### Add nullable column
```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS subtitle TEXT;
```

### Add non-nullable column with default
```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
```

### Add foreign key column
```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_profile_id INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_articles_author_profile_id ON articles(author_profile_id);
```

### JSONB column
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
```

### M2M junction table
```sql
CREATE TABLE IF NOT EXISTS article_tags (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags(tag_id);
```

### Rename constraint pattern
```sql
-- First drop old unique constraint (may or may not exist)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_key;
-- Add new partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_one_default
    ON user_profiles(user_id) WHERE is_default = TRUE;
```

## After Creating Migration

1. Update entity struct in `internal/domain/entity/` to match
2. If adding new table: create new repository interface + implementation
3. If adding column: update relevant repository queries that need the new field
4. Run `go build ./...` to verify compile
5. Test migration runs clean on a fresh DB (migrations run automatically on server start)

## Entity Sync Checklist

After a migration that adds/changes columns:

```go
// Entity must match migration EXACTLY
type Entity struct {
    // Every column in the migration must have a corresponding struct field
    // Use correct GORM tags:
    ID        uint   `gorm:"primaryKey;autoIncrement"`           // SERIAL PRIMARY KEY
    UserID    uint   `gorm:"index;not null"`                     // INTEGER NOT NULL + INDEX
    Name      string `gorm:"type:varchar(255);not null"`         // VARCHAR(255) NOT NULL
    IsActive  bool   `gorm:"not null;default:true"`              // BOOLEAN NOT NULL DEFAULT TRUE
    Data      []int64 `gorm:"type:jsonb;serializer:json"`        // JSONB
    Meta      *string `gorm:"type:text"`                         // TEXT (nullable)
    CreatedAt time.Time                                          // TIMESTAMPTZ DEFAULT NOW()
    UpdatedAt time.Time                                          // TIMESTAMPTZ DEFAULT NOW()
}
```

## Rollback Strategy

There is no automated rollback. To undo a migration:
1. Write a new migration that reverses the change (e.g., DROP COLUMN IF EXISTS)
2. NEVER edit the original migration file
