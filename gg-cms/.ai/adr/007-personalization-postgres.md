# ADR-007: User Profiles in PostgreSQL with JSONB Arrays

**Status:** Accepted  
**Date:** 2026

## Context

The personalization module needed to store per-user learning profiles (experience level, role type, interested tags, preferred categories). Multiple profiles per user needed to be supported, with exactly one active "default" at a time.

## Decision

Store `user_profiles` in PostgreSQL with:
- `interested_tag_ids` and `preferred_category_ids` as JSONB columns (not PostgreSQL arrays)
- `is_default` boolean with a **partial unique index** enforcing one default per user
- Named profiles (multiple rows per user, one with `is_default=TRUE`)

```sql
CREATE UNIQUE INDEX idx_user_profiles_one_default
    ON user_profiles(user_id) WHERE is_default = TRUE;
```

GORM entity uses `gorm:"type:jsonb;serializer:json"` to avoid `lib/pq` dependency.

## Consequences

**Positive:**
- PostgreSQL handles the uniqueness constraint at the DB level (no application-level locking needed)
- JSONB allows flexible array storage without additional junction tables
- Profiles are relational with users (FK cascade delete)
- Fast reads for recommendation scoring (all profile data in one row)

**Negative:**
- JSONB arrays don't support indexed lookup by element (acceptable — profiles are small)
- Tag/category IDs stored as integers in JSONB — must match IDs from relational tables (no FK constraint)

## Alternatives Considered

- **PostgreSQL native arrays** — rejected because `lib/pq` would be required as a dependency
- **MongoDB** — rejected because profile data is relational (tied to users) and low-write
- **Separate junction tables** for tag/category interests — rejected as over-normalization for a profile with <50 interests
