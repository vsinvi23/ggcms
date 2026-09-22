# Postgres Index Bloat: Reclaiming Disk Space with REINDEX

## The Problem: The Invisible Disk Eater
In PostgreSQL, updating a row doesn't overwrite the existing data. Because of Multi-Version Concurrency Control (MVCC), an `UPDATE` is actually a `DELETE` of the old row and an `INSERT` of the new row. Over time, tables and their associated indexes accumulate "dead tuples"—versions of rows that are no longer visible to any active transaction.

While the `autovacuum` daemon periodically sweeps through and marks these dead tuples as reusable space, it does not shrink the physical file size of the index. If an index undergoes heavy update/delete churn, it becomes highly fragmented and bloated. This "Index Bloat" destroys cache hit ratios, causes excessive sequential disk reads, and unnecessarily consumes gigabytes of storage.

## The Solution: Index Rebuilding
To reclaim physical disk space and restore the index to a contiguous, highly packed state, the index must be rebuilt from scratch based on the current live data in the table. PostgreSQL provides the `REINDEX` command to accomplish this.

### Mental Model: The Swiss Cheese Library Catalog
Imagine a library catalog (the index). Every time a book is removed, the card is erased but the physical card slot is left empty (a dead tuple). Over years, the catalog takes up 10 cabinets, but is 80% empty slots. 
Autovacuum is the librarian writing new cards into the empty slots. 
`REINDEX` is the librarian buying a brand new, smaller cabinet and meticulously copying only the active cards into it, packed tightly together, then throwing the 10 old cabinets away.

```text
[ Bloated Index Pages ] (80% empty space)
+---+---+---+---+---+
| a |   | b |   |   | -> Page 1
+---+---+---+---+---+
|   | c |   | d |   | -> Page 2
+---+---+---+---+---+
       |
   (REINDEX)
       v
[ Rebuilt Index Pages ] (Packed contiguous space)
+---+---+---+---+---+
| a | b | c | d |   | -> Page 1
+---+---+---+---+---+
```

## Deep Dive: How REINDEX Works

### Standard REINDEX
The standard `REINDEX INDEX index_name;` command creates a brand new index file on disk. 
**The Catch:** It acquires an `ACCESS EXCLUSIVE` lock on the underlying table. This absolutely blocks all read and write queries to the table until the index rebuild is complete. In a production environment with a massive table, this means downtime.

### REINDEX CONCURRENTLY (Postgres 12+)
To solve the downtime issue, PostgreSQL 12 introduced `REINDEX INDEX CONCURRENTLY index_name;`. 

**How it works without locking:**
1. It creates a new, temporary index alongside the old one.
2. It waits for existing transactions to finish.
3. It scans the table and builds the new index. During this time, standard reads/writes continue normally (utilizing the old index).
4. It catches up on any writes that happened during the build phase.
5. It seamlessly swaps the new index for the old one in the system catalogs and drops the bloated old index.

*Trade-off:* `CONCURRENTLY` takes longer to execute and uses more CPU/Disk I/O during the process, but zero downtime is achieved.

## Identifying Index Bloat
Before blindly reindexing, you should verify if bloat exists. Postgres doesn't have a built-in "bloat meter," but you can estimate it using system views like `pg_class` and `pg_stat_user_indexes`.

A common extension to install for this is `pgstattuple`:
```sql
CREATE EXTENSION pgstattuple;

-- Inspect the bloat of a specific index
SELECT * FROM pgstatindex('users_email_idx');
```
*Key metrics to look for:*
- `avg_leaf_density`: If this drops below 60-70%, the index is heavily fragmented.
- `leaf_empty_len`: High values indicate massive wasted space.

## Execution and Automation
```sql
-- Rebuild a single index with zero downtime
REINDEX INDEX CONCURRENTLY users_email_idx;

-- Rebuild ALL indexes on a specific table concurrently
REINDEX TABLE CONCURRENTLY users;
```

## Conclusion
Index bloat is an unavoidable consequence of MVCC in write-heavy PostgreSQL databases. While autovacuum prevents unbounded growth, it cannot shrink existing fragmentation. Routinely monitoring `avg_leaf_density` and executing `REINDEX INDEX CONCURRENTLY` during off-peak hours is a mandatory DBA practice to maintain blazing fast query performance and optimize storage costs.
