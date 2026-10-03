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

## 4. The Scenario: Connections Exhausted, CPU Idle

### Why "Just Add More Connections" Makes It Worse

A team notices their API returns `FATAL: sorry, too many clients already` under moderate load and responds by raising `max_connections` from 100 to 500. CPU usage actually gets WORSE, not better. The reason: PostgreSQL forks a full OS process per connection (roughly 2-10MB of memory each, plus its own set of internal locks and buffer-cache bookkeeping). Beyond a fairly low number of ACTIVE connections — typically close to `(CPU cores × 2) + effective_spindle_count` — additional connections mostly cause processes to contend for the same CPU cores and buffer cache locks rather than doing useful work in parallel.

```text
  Without pooling: every app instance opens its own connections directly
  ─────────────────────────────────────────────────────────────────────
  App Pod 1 (10 conns) ──┐
  App Pod 2 (10 conns) ──┼──► PostgreSQL: 100+ OS processes, most IDLE
  App Pod 3 (10 conns) ──┘     between queries but still holding memory
  ... (10 pods)                and consuming a process slot

  With PgBouncer (transaction pooling mode):
  ─────────────────────────────────────────────────────────────────────
  App Pod 1 (10 conns) ──┐
  App Pod 2 (10 conns) ──┼──► PgBouncer ──► PostgreSQL: ~20 REAL connections,
  App Pod 3 (10 conns) ──┘      (pools)      each one busy, none idle-but-reserved
  ... (10 pods)
```

### PgBouncer Transaction Pooling Configuration

```ini
[databases]
gg_cms_prod = host=10.0.0.5 port=5432 dbname=gg_cms

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
pool_mode = transaction   # release the connection back to the pool as soon
                          # as the CURRENT transaction commits, not when the
                          # client disconnects — this is what lets 500 app
                          # connections share 20 real Postgres connections
max_client_conn = 1000
default_pool_size = 20
```

`transaction` pooling mode is the reason this works: a client connection is only bound to a real PostgreSQL backend process for the duration of one transaction, then immediately returned to the pool for another client to use — it is NOT safe for session-level features like `SET` variables or prepared statements that must persist across multiple transactions on the same connection, which is the one tradeoff teams need to be aware of before switching.

💡 **Interactive Takeaway**: The `too many clients` error and high CPU under load were two symptoms of the same root cause — connection COUNT, not query complexity. PgBouncer fixes it by decoupling how many client connections exist from how many real PostgreSQL backend processes actually need to run concurrently.

---

## 5. Autovacuum: Why Ignoring It Silently Bloats Every Index

### The Scenario: A Table That Only Gets Bigger, Never Smaller

An `orders` table gets a constant stream of `UPDATE`s (status transitions: `PENDING` → `SHIPPED` → `DELIVERED`). PostgreSQL's MVCC design means every `UPDATE` doesn't overwrite a row in place — it writes a brand new row version and marks the old one as a "dead tuple." Without autovacuum reclaiming that dead space, both the table AND every index on it grow indefinitely, even though the actual live row count never changes.

```sql
-- Diagnose bloat: dead tuples approaching or exceeding live tuples
-- is a strong signal autovacuum isn't keeping up
SELECT relname, n_live_tup, n_dead_tup,
       round(n_dead_tup::numeric / GREATEST(n_live_tup, 1) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY dead_pct DESC;
```

```sql
-- A high-churn table often needs a MORE AGGRESSIVE autovacuum schedule
-- than the cluster-wide default (which triggers at 20% dead tuples —
-- far too infrequent for a table this hot)
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.02,  -- vacuum at 2% dead tuples, not 20%
  autovacuum_vacuum_cost_delay = 2        -- throttle I/O impact of the vacuum itself
);
```

💡 **Interactive Takeaway**: Autovacuum isn't a background cleanup task you can safely ignore — on a high-churn table, a stock configuration that waits for 20% dead tuples can let an index bloat to several times its necessary size between runs, degrading every query that uses it. Tuning `autovacuum_vacuum_scale_factor` per-table is a targeted fix for exactly this class of table.

---

## 6. Key Performance Takeaways

1. **Avoid Sequential Scans on Large Tables**: If `EXPLAIN` shows `Seq Scan` on tables over 10,000 rows, evaluate adding targeted composite or partial indexes.
2. **Use PgBouncer for Connection Pooling**: PostgreSQL forks a separate operating system process per connection (~2-10MB memory per connection). Use PgBouncer in transaction pooling mode — but be aware it's incompatible with session-level `SET` state and multi-statement prepared session features.
3. **Monitor Autovacuum Health Per-Table, Not Just Cluster-Wide**: Ensure autovacuum runs regularly to clean dead tuples and prevent index bloat; a high-churn table often needs a lower `autovacuum_vacuum_scale_factor` than the cluster default.
