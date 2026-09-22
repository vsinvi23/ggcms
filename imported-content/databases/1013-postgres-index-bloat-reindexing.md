# Postgres Index Bloat: Reclaiming Disk Space with REINDEX CONCURRENTLY

## The Problem: B-Tree Fragmentation & Write Outages

In PostgreSQL, Multi-Version Concurrency Control (MVCC) dictates that `UPDATE` and `DELETE` queries do not modify records in-place. Instead, they write a new version of the row (a tuple) to the table heap and mark the old one as dead. 

While the background autovacuum process eventually scans table heaps and marks deleted spaces as reusable, it cannot easily consolidate B-Tree index structures. Over time, high-throughput write-and-delete patterns leave B-Tree leaf pages partially empty or completely fragmented. This is known as **index bloat**.

Bloated indexes:
- Consume unnecessary disk space.
- Starve the OS page cache by forcing the engine to load highly fragmented index blocks into RAM.
- Slow down query execution times by expanding the depth of index scans.

Historically, the only remedy was executing the `REINDEX` command. However, running a standard `REINDEX` acquires an exclusive `ShareLock` on the target table, blocking all concurrent writes (`INSERT`, `UPDATE`, `DELETE`) until the process completes, which can take hours on multi-gigabyte tables.

---

## Technical Architecture & The Concurrent Reindexing Pipeline

To eliminate high-severity write outages, modern PostgreSQL releases support `REINDEX CONCURRENTLY`. This command rebuilds indexes in the background without blocking concurrent writes on the parent table.

```
+----------------------------------------------------------------------------+
|                        REINDEX CONCURRENTLY Pipeline                       |
+----------------------------------------------------------------------------+

  1. Create New Index Placeholder (Catalog Level)
     - Lock: ShareUpdateExclusiveLock (Allows SELECT, INSERT, UPDATE, DELETE)
     - Status: Invalid index entry registered in pg_class
 
  2. First Heap Scan (Initial Build)
     - Scans table heap; writes B-Tree entries for current active tuples.
 
  3. Wait for Active Transactions
     - Blocks until all concurrent transactions that started before Phase 2 finish.
     - Ensures any concurrent modifications to the table are caught.
 
  4. Second Index Build (Catch-Up)
     - Merges subsequent modifications occurring during Step 2 & 3.
 
  5. Wait for Secondary Active Transactions
     - Blocks until subsequent transactions that might need to write to the old index finish.
 
  6. Catalog Swap & Old Index Deprecation
     - Swaps the OIDs of the old and new indexes.
     - Marks old index as "invalid" and new index as "valid" and active.
 
  7. Drop Old Index Concurrently
     - Marks old index as "dead".
     - Drops the physical file of the old, bloated index.
```

By splitting the index creation into distinct transaction boundaries and relying on a dual-phase build with multiple wait steps, Postgres ensures that all writing clients continue to operate normally during the reindexing lifecycle.

---

## Diagnostic Query: Identifying Bloated Indexes

Before running reindexing commands, you must identify which indexes suffer from high fragmentation. The following catalog query estimates expected B-Tree index page sizes versus actual disk allocations to flag bloated indexes.

```sql
-- Diagnostic query to estimate index bloat percentages
WITH index_bloat_estimation AS (
    SELECT
        schemaname,
        tablename,
        indexname,
        pg_relation_size(index_oid) AS actual_size_bytes,
        -- Approximate calculation of minimum required pages assuming 85% fill factor
        COALESCE(
            ceil((reltuples * (index_item_width + 8) / (8192 - 120)::float) / 0.85) * 8192,
            8192
        ) AS estimated_size_bytes,
        index_oid
    FROM (
        SELECT
            n.nspname AS schemaname,
            c.relname AS tablename,
            i.relname AS indexname,
            c.reltuples,
            -- Estimate average index key width
            COALESCE(avg_width, 32) AS index_item_width,
            i.oid AS index_oid
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN (
            -- Query statistics for index key column widths
            SELECT s.schemaname, s.tablename, s.attname, s.avg_width
            FROM pg_stats s
        ) stat ON stat.schemaname = n.nspname AND stat.tablename = c.relname
        WHERE c.relkind = 'r' AND i.relam = 403 -- 403 represents btree in system catalogs
    ) sub
)
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(actual_size_bytes) AS actual_size,
    pg_size_pretty(estimated_size_bytes::bigint) AS estimated_minimum_size,
    pg_size_pretty((actual_size_bytes - estimated_size_bytes)::bigint) AS wasted_space,
    ROUND(
        (CASE 
            WHEN actual_size_bytes > estimated_size_bytes 
            THEN (actual_size_bytes - estimated_size_bytes)::float / actual_size_bytes * 100 
            ELSE 0 
         END)::numeric, 2
    ) AS bloat_percentage
FROM index_bloat_estimation
WHERE actual_size_bytes > 52428800 -- Filter out small indexes (under 50MB)
ORDER BY (actual_size_bytes - estimated_size_bytes) DESC;
```

---

## Resolving Bloat Concurrently

Once bloated indexes are identified, execute targeted rebuild operations.

```sql
-- Rebuild a specific index concurrently (safe for production write loads)
REINDEX INDEX CONCURRENTLY idx_users_email;

-- Rebuild all indexes of a table concurrently
REINDEX TABLE CONCURRENTLY users;
```

### Handling Failed Concurrent Reindex Attempts
If a client connection drops, a transaction aborts, or an out-of-memory error occurs during `REINDEX CONCURRENTLY`, the operation fails. Crucially, the invalid index placeholder created during Step 1 will remain in the database catalog as an orphan, marked as `invalid`. This orphan continues to consume write overhead because Postgres updates invalid indexes on write transactions even if they are not used for queries.

To identify and resolve failed, invalid indexes:

```sql
-- 1. Locate all invalid indexes in the database catalog
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    i.relname AS index_name
FROM pg_index x
JOIN pg_class c ON c.oid = x.indrelid
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE x.indisvalid = false;

-- 2. Drop the invalid index concurrently to clean up disk allocation
DROP INDEX CONCURRENTLY idx_users_email_ccnew;
```
*(Note: Concurrent index drops require `DROP INDEX CONCURRENTLY`, which itself takes a few seconds and uses background waiting blocks).*
