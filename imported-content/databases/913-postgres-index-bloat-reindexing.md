# Postgres Index Bloat: Reclaiming Disk Space with REINDEX CONCURRENTLY

## The Problem: MVCC Side-Effects and Index Fragmentation
PostgreSQL uses Multi-Version Concurrency Control (MVCC) to support high-concurrency read and write operations. Under MVCC, an `UPDATE` statement does not modify a row in place; instead, it writes a new version of the row (a tuple) and marks the old version as dead. A `DELETE` statement merely marks an existing tuple as dead.

While the autovacuum process eventually reclaims space in the main table heap, indexes—specifically B-Tree indexes—suffer from structural fragmentation known as **index bloat**. 

When rows are updated or deleted, their corresponding index leaf nodes point to dead tuples. Because of B-Tree page split rules, these leaf pages cannot always be merged or packed efficiently. Over time, indexes become sparse, taking up far more disk space than necessary and consuming valuable memory in Postgres `shared_buffers`, which degrades query scan performance.

---

## Technical Architecture: The Mechanics of Bloat and REINDEX
A standard B-Tree index page in Postgres is typically 8KB. When an index page is filled and a new key must be inserted, a **page split** occurs, dividing the keys between the old page and a newly allocated page. If updates are random, pages become filled with empty spaces (dead pointers) that cannot be reused until the entire key range of that page is completely cleared.

```
Bloated B-Tree Index (Sparse Pages, High Depth):
+───────────────────────────+      +───────────────────────────+
| Page 1 (30% used)         |      | Page 2 (40% used)         |
| [Key 10] [Dead]  [Dead]   | ───► | [Key 45] [Dead]  [Key 60] |
+───────────────────────────+      +───────────────────────────+

Rebuilt B-Tree Index (Dense Pages, Low Depth):
+──────────────────────────────────────────────────────────────+
| Page 1 (90% used)                                            |
| [Key 10] [Key 45] [Key 60] [Empty Space...]                  |
+──────────────────────────────────────────────────────────────+
```

### The Locking Nightmare of Standard REINDEX
Executing a simple `REINDEX INDEX index_name;` or `REINDEX TABLE table_name;` is a blocking operation. It acquires an `AccessExclusiveLock` on the table. This lock blocks **all** read and write operations on the table, which can crash high-traffic application workloads.

### The Non-Blocking Solution: REINDEX CONCURRENTLY
`REINDEX CONCURRENTLY` rebuilds the index in the background without blocking concurrent writes. To achieve this, Postgres executes the rebuild across several distinct transaction phases:

```
[Phase 1: Catalog Init] ──► Create new index shell (marked invalid)
                                  │ (Acquires ShareUpdateExclusiveLock)
                                  ▼
[Phase 2: Initial Build] ─► Scan table, build new index from current tuples
                                  │ (Writes logged to BOTH indexes)
                                  ▼
[Phase 3: Validation] ────► Wait for old txs to finish, scan again to catch up
                                  │ (Marks new index as VALID)
                                  ▼
[Phase 4: Swap & Drop] ───► Swap names in pg_class, mark old index invalid, DROP old
```

1. **Phase 1 (Registering):** Postgres creates a new index entry in the system catalogs (`pg_class`) with a temporary name, marked as invalid (`indisready = false`, `indisvalid = false`). It acquires a `ShareUpdateExclusiveLock`, which permits reads and writes on the main table.
2. **Phase 2 (Building):** Postgres performs a sequential table scan to build the new index from all currently visible tuples. During this phase, any concurrent inserts, updates, or deletes write to **both** the old and new indexes.
3. **Phase 3 (Validation):** Postgres performs a second scan to index any tuples added or modified since the initial build started. It then waits for all concurrent transactions that started before this validation phase to complete, ensuring no active sessions are still using the old index. The new index is then marked as valid (`indisvalid = true`).
4. **Phase 4 (Swap & Drop):** Postgres swaps the names of the old and new indexes in the system catalogs, marks the old index as invalid, and safely drops it.

---

## Technical Implementation: Identifying and Reclaiming Bloated Indexes

### 1. Identifying Bloat via pgstatindex
You can inspect the exact fill rate and internal fragmentation of a B-Tree index using the `pgstatindex` extension.

```sql
-- Enable the extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS pgstattuple;

-- Analyze index leaf pages and free space
SELECT 
    version,
    tree_level,
    index_size,
    pages_count,
    reclaimed_percent,
    avg_page_free_percent -- High value (e.g., > 30%) indicates bloat
FROM pgstatindex('idx_orders_customer_id');
```

### 2. Identifying Table-Wide Index Bloat via Catalog Query
If you cannot run `pgstatindex` on every index, you can estimate bloat across the database using this catalog estimation query:

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(index_relid)) AS current_size,
    pg_size_pretty(estimated_bloat_bytes) AS estimated_bloat,
    ROUND(estimated_bloat_bytes * 100.0 / pg_relation_size(index_relid), 2) AS bloat_ratio
FROM (
    SELECT 
        ns.nspname AS schemaname,
        tbl.relname AS tablename,
        idx.relname AS indexname,
        i.indexrelid AS index_relid,
        GREATEST(0, pg_relation_size(i.indexrelid) - (COALESCE(sub.reltuples, 0) * 50)) AS estimated_bloat_bytes
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    LEFT JOIN (SELECT relid, reltuples FROM pg_stat_user_tables) sub ON sub.relid = i.indrelid
    WHERE idx.relpages > 100 -- Only check larger indexes
) bloat_summary
ORDER BY estimated_bloat_bytes DESC;
```

### 3. Executing REINDEX CONCURRENTLY Safely
Once bloated indexes are found, rebuild them concurrently:

```sql
-- Rebuild a single index safely
REINDEX INDEX CONCURRENTLY idx_orders_customer_id;

-- Rebuild all indexes on a table safely
REINDEX TABLE CONCURRENTLY orders;
```

---

## Production Precautions & Failure Recovery
Because `REINDEX CONCURRENTLY` runs across multiple transactions, it cannot be executed inside a single transaction block (`BEGIN ... COMMIT`). Additionally, if a failure occurs during execution (e.g., due to a unique constraint violation or a database crash), Postgres will abort, leaving behind an **invalid, half-built index** (prefixed with `ccnew`).

These invalid indexes still consume disk space and must be removed:

```sql
-- 1. Locate invalid/broken indexes
SELECT 
    c.relname AS index_name, 
    i.indisvalid, 
    i.indisready
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid;

-- 2. Drop the invalid index to free space
DROP INDEX CONCURRENTLY idx_orders_customer_id_ccnew;
```
