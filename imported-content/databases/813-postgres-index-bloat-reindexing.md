# Postgres Index Bloat: Reclaiming Disk Space with REINDEX CONCURRENTLY

## The Problem: MVCC Overhead, Leaf-Page Splits, and Persistent Index Bloat

PostgreSQL manages write concurrency using Multi-Version Concurrency Control (MVCC). Under MVCC, executing an `UPDATE` does not modify the target row in place, and executing a `DELETE` does not physically erase the row. Instead, the database creates a new version of the row (a tuple) and marks the old version as dead. 

While the **Autovacuum** process sweeps the heap tables to mark these dead tuple locations as reusable for future inserts, index files (primarily B-Trees) handle dead space much less efficiently.
* **Index Pointer Accumulation:** When rows are updated, new index pointers are appended, even if the index columns themselves did not change.
* **Page Splits:** Under heavy write pressure, B-Tree leaf pages split to accommodate new keys, dividing the keyspace. 
* **The Bloat Trapped on Disk:** Once the heavy write burst subsides, or massive deletes occur, many B-Tree pages are left virtually empty (containing only a few active pointers). However, B-Trees cannot easily merge adjacent non-sequential leaf pages. This empty space remains trapped inside the index file. Since Postgres index pages on disk are almost never returned to the OS, the index file remains bloated, occupying massive amounts of storage, degrading cache hit ratios, and forcing unnecessary random read I/O during scans.

```
Before Bloat (Compact Index File):
[ Page 1 (90% full) ] -> [ Page 2 (90% full) ]

After Heavy MVCC Updates/Deletes (Bloated Index File):
[ Page 1 (15% full) ] -> [ Page 2 (20% full) ] -> [ Page 3 (10% full) ] -> [ Page 4 (15% full) ]
(Index takes 2x the space, requires 4 disk page reads instead of 2 for scans)
```

Running a standard `REINDEX` is highly disruptive because it acquires an exclusive `SHARE` lock on the parent table. This block prevents any write operations (`INSERT`, `UPDATE`, `DELETE`) on the table, resulting in application failures or severe connection-pool exhaustion in production environments.

## The Architecture: Safe Space Reclamation via REINDEX CONCURRENTLY

To resolve this production hazard, PostgreSQL implements `REINDEX CONCURRENTLY`. This architectural pattern rebuilds the index completely from scratch in the background using a multi-phase commit model that avoids locking active writes.

```
                           +------------------------+
                           |  REINDEX CONCURRENTLY  |
                           +------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
         [Phase 1: Catalog Init]                 [Phase 2: Initial Build]
   Creates secondary index placeholder      Scans heap table to build index from
   in catalogs (Invisible to reads/writes)  current snapshot. Writes allowed.
                   |                                       |
                   +-------------------+-------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
        [Phase 3: Catch-Up Scan]                [Phase 4: Swap & Validate]
   Scans WAL for concurrent changes made    Swaps catalog entries. New index active.
   since Phase 2. Replays changes.          Old index marked dead.
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                           [Phase 5: Drop Old Index]
                             Removes bloated index
```

### The Detailed Build Sequence

1. **Phase 1: Catalog Initialization:** Postgres creates a new, temporary index catalog entry. It is marked as *invalid* and *not ready* for writes.
2. **Phase 2: The First Build Pass (Initial Build):** Postgres performs a sequential scan of the table (heap) to find all active tuples and builds the new index. During this phase, concurrent write transactions are free to insert, update, or delete rows. These transactions continue updating the *old* index, but they also write their changes to the *new* index because its catalog status has transitioned to *ready-for-writes*.
3. **Phase 3: The Second Pass (Catch-Up Scan):** Because concurrent transactions may have updated rows while the first pass sequential scan was reading, the new index must catch up. Postgres executes a second pass, querying the WAL for changes made since the start of Phase 2, and merges these records into the new index.
4. **Phase 4: Catalog Swap and Activation:** The new index is marked *valid* and *ready for reads*. The old index is marked *invalid* and *not ready for reads*, redirecting all new incoming query plans to the compact new index.
5. **Phase 5: Cleanup and Deletion:** The old index is physically unlinked from the table and dropped, releasing the trapped disk space back to the operating system.

## Practical Bloat Diagnosis and Reindexing Runbook

### SQL Script to Identify Severely Bloated Indexes
Execute this query to calculate real index efficiency vs. allocated disk space:

```sql
WITH btree_index_stats AS (
    SELECT
        pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
        pg_relation_size(i.indexrelid) AS index_size_bytes,
        c.relname AS table_name,
        i.relname AS index_name,
        coalesce(stat.idx_blks_read, 0) AS blocks_read,
        coalesce(stat.idx_blks_hit, 0) AS blocks_hit
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_statio_all_indexes stat ON stat.indexrelid = i.indexrelid
    WHERE n.nspname = 'public' 
      AND i.relam = 403 -- B-Tree access method
)
-- Rank by size to find high-impact optimization targets
SELECT 
    table_name,
    index_name,
    index_size,
    blocks_read,
    blocks_hit,
    ROUND((100.0 * blocks_hit) / NULLIF((blocks_hit + blocks_read), 0), 2) AS hit_ratio_pct
FROM btree_index_stats
ORDER BY index_size_bytes DESC 
LIMIT 15;
```

### Rebuilding Bloated Indexes

Once a target index is identified as bloated, perform the rebuild concurrently:

```sql
-- Rebuild a specific bloated index safely in the background
REINDEX INDEX CONCURRENTLY idx_users_email_address;
```

### Crucial Production Safeguards and Failure Handling

Because `REINDEX CONCURRENTLY` runs across multiple transactions, it cannot execute inside a transactional block (`BEGIN ... COMMIT`). It is susceptible to specific production hazards:

1. **Deadlocks and Locking Hangs:** Although it does not lock table writes, the command must wait for active transactions that started *before* the reindex run to complete. If a long-running reporting query or transactional lock persists, the reindex will block. Monitor it using:
   ```sql
   SELECT pid, query, state, wait_event_type, wait_event 
   FROM pg_stat_activity 
   WHERE query ILIKE '%REINDEX%';
   ```
2. **Recovering from Failed Builds:** If a network drop, timeout, or deadlock terminates the reindex session midway, the temporary index catalog entry remains on disk marked as **invalid**. It continues to consume storage and intercept concurrent writes, worsening the bloat.
   To identify and clear failed concurrent indexes, run:
   ```sql
   -- Find invalid indexes
   SELECT c.relname AS index_name, i.indisvalid
   FROM pg_class c
   JOIN pg_index i ON i.indexrelid = c.oid
   WHERE i.indisvalid = false;

   -- Clean up the failed index safely
   DROP INDEX CONCURRENTLY idx_users_email_address_ccnew;
   ```
