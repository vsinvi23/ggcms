---
title: "PostgreSQL Indexing Strategies & Query Performance Tuning"
description: "A comprehensive reference guide covering B-Tree, GIN, GiST, BRIN, pgvector indexes, EXPLAIN ANALYZE execution plans, and connection pooling."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "sql"
  - "postgresql"
---

# PostgreSQL Indexing Strategies & Query Performance Tuning

PostgreSQL is one of the world's most versatile relational database engines. However, as table sizes grow from thousands to millions of rows, poorly tuned SQL queries cause high CPU utilization, disk I/O bottlenecks, and connection pool starvation.

This guide explores index selection strategies, parsing `EXPLAIN (ANALYZE, BUFFERS)` execution plans, partial indexing, autovacuum tuning, and connection pooling with PgBouncer.

---

## 1. Index Type Matrix & Use Cases

| Index Type | Underlying Data Structure | Primary Use Cases & Operators |
| :--- | :--- | :--- |
| **B-Tree** | Balanced Multi-way Search Tree | Default index for equality (`=`), range (`<`, `>`, `BETWEEN`), and sorting (`ORDER BY`). |
| **GIN (Generalized Inverted Index)** | Inverted Index (lists items to keys) | Full-text search (`to_tsvector`), JSONB document searching (`@>`), array queries. |
| **GiST (Generalized Search Tree)** | Hierarchical Lossy Structure | Geometric data types, spatial search (PostGIS), range overlaps (`&&`). |
| **BRIN (Block Range Index)** | Min/Max range summaries per block | Large append-only time-series data tables (100M+ rows) with minimal storage footprint. |
| **HNSW (Vector)** | Hierarchical Navigable Small World | AI vector embeddings similarity search (`pgvector` `<=>` distance). |

---

## 2. Advanced SQL Indexing Strategies

### Partial Indexing
Create indexes covering only a subset of rows to save disk space and reduce write amplification:

```sql
-- Index only active published articles for public catalog queries
CREATE INDEX idx_articles_published_active 
ON articles (published_at DESC, category_id) 
WHERE status = 'PUBLISHED';
```

### Expression / Functional Indexing
Index the result of a function or expression:

```sql
-- Case-insensitive lookup index
CREATE INDEX idx_users_lower_email 
ON users (LOWER(email));
```

---

## 3. Analyzing Execution Plans with `EXPLAIN (ANALYZE, BUFFERS)`

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT a.id, a.title, c.slug 
FROM articles a
JOIN categories c ON a.category_id = c.id
WHERE a.status = 'PUBLISHED'
ORDER BY a.published_at DESC
LIMIT 10;
```

```text
========================================================================================================
                                      READING EXPLAIN OUTPUT
========================================================================================================
 ┌─────────────────────────┐ ──► Cost: Estimated startup and total execution cost (units: disk page fetches)
 │ Limit                   │ ──► Rows: Estimated vs Actual number of rows returned
 └────────────┬────────────┘ ──► Buffers: shared hit=42 (Read from RAM memory cache)
              │                          shared read=3  (Read from disk - slower)
              ▼
 ┌─────────────────────────┐
 │ Index Scan              │ ──► Look for "Sequential Scan" on large tables (signaling missing indexes)
 │ idx_articles_pub        │
 └─────────────────────────┘
```

---

## 4. Key Performance Takeaways

1. **Avoid Sequential Scans on Large Tables**: If `EXPLAIN` shows `Seq Scan` on tables over 10,000 rows, evaluate adding targeted composite or partial indexes.
2. **Use PgBouncer for Connection Pooling**: PostgreSQL forks a separate operating system process per connection (~2-10MB memory per connection). Use PgBouncer in transaction pooling mode.
3. **Monitor Autovacuum Health**: Ensure autovacuum runs regularly to clean dead tuples and prevent index bloat.
