# Postgres Index Bloat: Reclaiming Disk Space with REINDEX CONCURRENTLY

## The Problem: Dead Tuples and Index Fragmentation
PostgreSQL implements Multi-Version Concurrency Control (MVCC). When a row is updated or deleted, Postgres does not overwrite the existing data. Instead, it creates a new version of the row and marks the old version as a "dead tuple," which is eventually cleaned up by the autovacuum process.

However, indexes (like B-Trees) point to physical locations on disk. When a row updates, new index entries must be created pointing to the new tuple. As autovacuum removes dead tuples from the table, it also removes the corresponding index entries. This leaves "holes" or fragmented empty pages within the B-Tree index structure. Over time, in update-heavy workloads, the index grows massively on disk—a phenomenon known as **Index Bloat**. Bloated indexes increase memory pressure and drastically slow down index scans because more physical blocks must be read.

## The Solution: Index Rebuilding
While standard `VACUUM` can mark index pages as reusable, it cannot shrink the physical size of the B-Tree or re-balance deeply fragmented trees. To reclaim disk space and optimize scan speeds, the index must be rebuilt from scratch.

### Technical Architecture: B-Tree Fragmentation
```text
[ Healthy B-Tree ]
Root -> [Page 1 (Values 1-50)]
        [Page 2 (Values 51-100)]

[ Bloated B-Tree (After heavy updates) ]
Root -> [Page 1 (Values 1, 4...)] (90% empty space)
        [Page 2 (Values 6, 8...)] (80% empty space)
        [Page 3 (Values 51, 55.)] (85% empty space)
```
A bloated index requires the database to load 3x to 10x more pages into `shared_buffers` to satisfy the same query.

### The Locking Dilemma
Historically, to rebuild an index, developers used the `REINDEX INDEX index_name` command. 
The fatal flaw: standard `REINDEX` takes an `ACCESS EXCLUSIVE` lock on the underlying table. This blocks all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` queries for the duration of the rebuild, causing an unacceptable production outage.

### REINDEX CONCURRENTLY
PostgreSQL 12 introduced `REINDEX CONCURRENTLY`. This command builds a fresh, perfectly packed B-Tree in the background without taking an exclusive lock, allowing the application to continue reading and writing to the table.

How it works:
1. **Creation**: Creates a new, temporary index in the system catalogs.
2. **First Pass**: Scans the table and builds the new index.
3. **Wait**: Waits for active transactions that modify the table to finish.
4. **Second Pass**: Applies any changes made to the table during the first pass to the new index.
5. **Swap**: Swaps the names of the old and new indexes.
6. **Drop**: Marks the old index as dead and drops it.

### Identifying and Fixing Bloat
We can use the `pgstattuple` extension to inspect B-Tree health.

```sql
-- Enable the extension
CREATE EXTENSION pgstattuple;

-- Analyze index fragmentation
SELECT * FROM pgstatindex('users_email_idx');
```

```text
 version | tree_level | index_size | root_block_no | internal_pages | leaf_pages | empty_pages | deleted_pages | avg_leaf_density | leaf_fragmentation 
---------+------------+------------+---------------+----------------+------------+-------------+---------------+------------------+--------------------
       4 |          3 |  536870912 |           412 |            205 |      65012 |       24000 |           512 |            32.45 |              65.20
```
*Notice the low `avg_leaf_density` (32%) and high `empty_pages`. This index is severely bloated.*

To safely fix it without downtime:

```sql
-- Rebuild the index concurrently without locking out reads/writes
REINDEX INDEX CONCURRENTLY users_email_idx;
```

*Note: `REINDEX CONCURRENTLY` takes longer to execute than a standard `REINDEX` and requires extra disk space temporarily (to hold both the old and new indexes simultaneously).*

By aggressively monitoring `avg_leaf_density` and scheduling concurrent reindexes, DBAs can ensure B-Tree indexes remain compact, keeping memory utilization low and query performance razor-sharp.