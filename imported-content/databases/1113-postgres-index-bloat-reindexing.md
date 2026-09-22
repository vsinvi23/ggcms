# Postgres Index Bloat: Reclaiming Disk Space with REINDEX CONCURRENTLY

## The Problem: MVCC and Dead Tuples
PostgreSQL relies on Multiversion Concurrency Control (MVCC) to handle concurrent transactions without locking. When an `UPDATE` or `DELETE` occurs, Postgres does not immediately remove or overwrite the old data. Instead, it marks the old row as a "dead tuple" and inserts a completely new row. 

While the background Autovacuum process eventually cleans up dead tuples in the table heap, **indexes are highly susceptible to fragmentation and bloat**.

When Autovacuum cleans an index, it removes pointers to dead tuples, but it *rarely shrinks the physical size of the index*. If a B-Tree page becomes mostly empty, it remains allocated to the index. Over time, heavy `UPDATE`/`DELETE` workloads result in massive, sparse indexes that destroy cache efficiency and degrade read performance.

## Architecture: B-Tree Fragmentation

```text
[ Healthy Index Page ]
+-----------------------------------+
| ptr1 | ptr2 | ptr3 | ptr4 | ptr5 |
+-----------------------------------+
(100% Fill Factor)

[ Bloated Index Page (After Deletes/Updates) ]
+-----------------------------------+
| ptr1 | DEAD | DEAD | ptr4 | DEAD |
+-----------------------------------+
(40% Fill Factor - Autovacuum clears DEAD pointers, 
 but the 8KB page is still taking up RAM/Disk)
```
When queries traverse bloated B-Trees, Postgres must load significantly more 8KB pages from disk into `shared_buffers` to retrieve the same amount of data, drastically increasing I/O and memory pressure.

## Identifying Index Bloat
You can use the `pgstattuple` extension to accurately measure bloat at the page level.

```sql
-- Enable the extension
CREATE EXTENSION pgstattuple;

-- Analyze a specific index
SELECT * FROM pgstatindex('users_email_idx');
```
Key metrics to look for in the output:
*   `index_size`: Total physical size on disk.
*   `avg_leaf_density`: The percentage of data vs empty space in leaf pages. If this drops below 50-60%, the index is heavily bloated.

## The Solution: REINDEX CONCURRENTLY
To reclaim the space, the index must be entirely rebuilt. Historically, the `REINDEX` command required an exclusive lock on the table, blocking all writes (and sometimes reads) for the duration of the rebuild—unacceptable for production.

PostgreSQL 12 introduced `REINDEX INDEX CONCURRENTLY`.

### How it Works
`REINDEX CONCURRENTLY` builds a fresh, perfectly packed B-Tree in the background without blocking concurrent `INSERT`, `UPDATE`, or `DELETE` operations on the table.

1.  **Phase 1 (Setup):** Postgres creates a temporary, empty index in the system catalog and takes a `ShareUpdateExclusiveLock` (which allows concurrent reads/writes).
2.  **Phase 2 (Build):** It scans the table and builds the new index. Concurrent modifications to the table are logged.
3.  **Phase 3 (Catchup):** It applies the logged concurrent modifications to the new index to catch up.
4.  **Phase 4 (Swap):** Postgres swaps the internal catalog pointers, marking the new index as valid and the old index as invalid.
5.  **Phase 5 (Cleanup):** The old bloated index is dropped.

### Execution
```sql
-- Rebuild a single bloated index without downtime
REINDEX INDEX CONCURRENTLY users_email_idx;

-- Rebuild ALL indexes on a specific table
REINDEX TABLE CONCURRENTLY users;
```

### Caveats
*   **CPU/IO Overhead:** Building an index concurrently takes significantly more CPU, disk I/O, and time than a standard `REINDEX`.
*   **Failure States:** If `REINDEX CONCURRENTLY` fails (e.g., due to a unique constraint violation or out-of-memory error), it leaves behind an `INVALID` index that you must drop manually using `DROP INDEX`.

## Conclusion
Index bloat is an unavoidable consequence of MVCC in write-heavy PostgreSQL databases. By routinely monitoring leaf density with `pgstatindex` and executing `REINDEX CONCURRENTLY` during off-peak hours, you can maintain compact B-Trees, optimal cache hit ratios, and blazing-fast query performance without compromising uptime.
