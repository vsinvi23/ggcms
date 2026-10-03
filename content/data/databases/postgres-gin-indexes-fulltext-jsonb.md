---
title: "Postgres GIN Indexes: Accelerating Full-Text Search and JSONB Queries"
description: "How GIN's inverted-index structure (entry tree, posting lists/trees) makes array-containment and JSONB queries fast where a B-Tree can't help, including fastupdate write-amplification trade-offs."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "gin-index"
  - "jsonb"
  - "full-text-search"
  - "indexing"
---

# Postgres GIN Indexes: Accelerating Full-Text Search and JSONB Queries

## The Multi-Value Query Bottleneck

B-Tree indexes are built for scalar values: one column value maps to one row. That model breaks for multi-valued columns — text documents (many lexemes per row), JSONB documents (many keys/paths per row), or array columns (many elements per row).

Take a `skills TEXT[]` column on a profiles table. A B-Tree index on that array only helps if you match the *entire array* exactly. A query like `WHERE skills @> ARRAY['sql']` (array containment — "does this row's array include 'sql'") can't use a B-Tree at all; Postgres falls back to a full sequential scan, evaluating the containment check against every row. The same problem shows up in full-text search against arbitrary terms within a document.

## Mental Model: The Inverted Textbook Index

PostgreSQL's answer is the **GIN (Generalized Inverted Index)**. Think of the index at the back of a textbook: instead of mapping a page to all the words on it, it maps each individual word to every page it appears on. GIN does the same thing for database rows — it maps each individual array element, JSONB key/value pair, or text lexeme to the list of row identifiers (TIDs) containing it.

```text
+-------------------------------------------------------------+
|                         ENTRY TREE                          |
|               (B-Tree of isolated keys / lexemes)           |
|                [ "go"  |  "rust"  |  "sql" ]                |
+-------+---------------+---------------+---------------------+
        |               |               |
        v               v               v
  +-----------+   +-----------+   +----------------------------+
  |  Posting  |   |  Posting  |   |        POSTING TREE        |
  |   List    |   |   List    |   | (B-Tree of TIDs for "sql") |
  |  [TID 1]  |   |  [TID 2]  |   |   [TID 3 -> TID 8 -> ...]  |
  +-----------+   +-----------+   +----------------------------+
```

## Storage Internals: Entry Tree, Posting Lists, Posting Trees

A GIN index has two structural parts:

1. **The Entry Tree**: a standard B-Tree whose keys are the individual *elements* — array values, JSONB keys/paths, or text lexemes — rather than whole column values. A row with `{'sql', 'go', 'rust'}` inserts three distinct entry-tree keys, not one.
2. **Posting Lists vs. Posting Trees**: each entry-tree key needs a list of matching TIDs. Rare keys get a flat array — a **Posting List**. Frequent keys (e.g., `sql` appearing in millions of rows) would make that list huge and slow to scan, so Postgres promotes it to a **Posting Tree** — a dedicated internal B-Tree just for that key's TIDs, giving it the same logarithmic lookup/update behavior a regular B-Tree has.

## Write Amplification and `fastupdate`

A single row with a ten-element array requires ten separate entry-tree insertions, not one — GIN writes are inherently more expensive than B-Tree writes. To amortize this, Postgres offers `fastupdate` (on by default): new inserts are appended to an unsorted **Pending List** buffer instead of immediately updating the structured entry tree. Reads scan both the entry tree and the pending list and merge results, so correctness isn't affected. Once the pending list exceeds `gin_pending_list_limit` (4MB by default), or during `VACUUM`, Postgres flushes and reorganizes it into the main index structure in one batched pass — much cheaper per-row than updating the tree on every insert.

The trade-off: a large pending list means more work happening on read (scanning the unsorted buffer in addition to the tree) until the next flush. For write-heavy tables with tight read-latency SLAs, consider disabling `fastupdate` on that index and eating the higher, but more predictable, per-write cost.

## Schema and Queries

```sql
CREATE TABLE developer_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    skills TEXT[] NOT NULL,
    meta JSONB NOT NULL
);

-- GIN index over the array column — enables containment queries
CREATE INDEX idx_profiles_skills ON developer_profiles USING GIN (skills);

-- GIN index over JSONB using jsonb_path_ops for faster containment lookups
CREATE INDEX idx_profiles_meta_path ON developer_profiles USING GIN (meta jsonb_path_ops);

-- Now index-backed: profiles containing both 'sql' and 'postgres'
EXPLAIN ANALYZE
SELECT name
FROM developer_profiles
WHERE skills @> ARRAY['sql', 'postgres'];

-- Index-backed nested JSON containment query
EXPLAIN ANALYZE
SELECT name
FROM developer_profiles
WHERE meta @> '{"experience": {"level": "Senior"}}';
```

### `jsonb_ops` vs. `jsonb_path_ops`

The default `jsonb_ops` operator class indexes each key and each value as *separate* entry-tree keys — more flexible (supports key-existence operators like `?`), but a larger index. `jsonb_path_ops` instead hashes the full path-plus-value (e.g., `experience.level = "Senior"`) into a single entry-tree key. That makes the index smaller and containment queries (`@>`) faster, at the cost of not supporting the `?`/`?|`/`?&` key-existence operators — pick `jsonb_path_ops` when your queries are containment-only, which is the common case for filtering structured JSONB metadata.

## When GIN Is (and Isn't) the Right Choice

Use GIN when queries filter on "does this row contain X" against arrays, JSONB, or full-text — `@>`, `?`, `@@` against `tsvector`. Avoid it as a blanket replacement for B-Tree on scalar equality/range columns; GIN's write overhead and index size for that use case are worse than a plain B-Tree, which is exactly what it's built for.
