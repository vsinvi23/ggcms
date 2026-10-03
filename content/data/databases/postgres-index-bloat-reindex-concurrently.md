---
title: "Postgres Index Bloat: Reclaiming Space with REINDEX CONCURRENTLY"
description: "How MVCC-driven dead tuples fragment B-Tree indexes over time, how to measure bloat with pgstattuple, and how REINDEX CONCURRENTLY rebuilds a bloated index without locking out reads and writes."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "postgresql"
  - "index-bloat"
  - "reindex-concurrently"
  - "mvcc"
  - "database-maintenance"
---

# Postgres Index Bloat: Reclaiming Space with REINDEX CONCURRENTLY

## The Problem: Dead Tuples and Index Fragmentation

PostgreSQL uses Multi-Version Concurrency Control (MVCC): updating or deleting a row never overwrites it in place. Instead, Postgres writes a new row version and marks the old one a "dead tuple," later reclaimed by `autovacuum`.

Indexes point to physical row locations, so every update that moves a row also requires new index entries. As autovacuum removes dead tuples from the table, it removes the corresponding index entries too — but this leaves fragmented, partially-empty pages inside the B-Tree rather than a compact structure. In update-heavy workloads, an index can balloon well beyond what the live data would require: this is **index bloat**. Bloated indexes need more memory to cache and more I/O to scan, directly slowing every query that uses them.

## Why `VACUUM` Alone Doesn't Fix It

`VACUUM` marks dead index entries as reusable space, but it does not shrink the physical size of the B-Tree or rebalance a deeply fragmented tree. Reclaiming space and restoring scan speed requires rebuilding the index from scratch.

```text
[ Healthy B-Tree ]
Root -> [Page 1 (Values 1-50)]
        [Page 2 (Values 51-100)]

[ Bloated B-Tree (after heavy updates) ]
Root -> [Page 1 (Values 1, 4...)]   (90% empty space)
        [Page 2 (Values 6, 8...)]   (80% empty space)
        [Page 3 (Values 51, 55...)] (85% empty space)
```

A bloated index can force Postgres to pull 3x-10x more physical pages into `shared_buffers` to satisfy the same query as a compact one would.

## The Locking Problem With Plain `REINDEX`

`REINDEX INDEX index_name` rebuilds an index correctly, but it takes an `ACCESS EXCLUSIVE` lock on the underlying table for the duration — blocking every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` against that table. On a production table, that's an outage, not a maintenance operation.

## `REINDEX CONCURRENTLY`

PostgreSQL 12 introduced `REINDEX CONCURRENTLY`, which builds a fresh index in the background without an exclusive table lock, so reads and writes continue throughout:

1. **Creation**: a new, temporary index entry is created in the system catalogs.
2. **First pass**: Postgres scans the table and builds the new index from current data.
3. **Wait**: it waits for in-flight transactions that modify the table to complete.
4. **Second pass**: any table changes made during the first pass are applied to the new index.
5. **Swap**: the old and new index names are swapped atomically.
6. **Drop**: the old, now-unused index is marked dead and dropped.

```sql
REINDEX INDEX CONCURRENTLY users_email_idx;
```

Trade-offs: it takes noticeably longer than a plain `REINDEX` (two passes instead of one, plus the wait step), and it needs enough free disk space to hold both the old and new index simultaneously while the rebuild is in progress. If it's interrupted, Postgres can leave behind an invalid index (visible in `\d` as `INVALID`) that needs to be dropped manually — it won't silently corrupt the original index, but check for stragglers after any interrupted run.

## Measuring Bloat With `pgstattuple`

```sql
CREATE EXTENSION pgstattuple;

SELECT * FROM pgstatindex('users_email_idx');
```

```text
 version | tree_level | index_size | root_block_no | internal_pages | leaf_pages | empty_pages | deleted_pages | avg_leaf_density | leaf_fragmentation
---------+------------+------------+---------------+----------------+------------+-------------+---------------+------------------+--------------------
       4 |          3 |  536870912 |           412 |            205 |      65012 |       24000 |           512 |            32.45 |              65.20
```

`avg_leaf_density` of 32% (versus a healthy 80-90%) and 24,000 empty pages out of 65,012 leaf pages confirm this index is severely bloated and worth rebuilding.

```sql
-- Rebuild without locking out reads/writes
REINDEX INDEX CONCURRENTLY users_email_idx;
```

## Operational Guidance

- Schedule bloat checks (`pgstatindex` over your largest/hottest indexes) on a recurring basis rather than reactively — bloat that's caught early is a quick `REINDEX CONCURRENTLY`; bloat left for months on a huge table means a rebuild that takes hours and needs a large temporary disk allowance.
- `REINDEX CONCURRENTLY` cannot run inside an explicit transaction block and cannot be run on system catalogs — it targets user indexes only.
- After a heavy bulk `UPDATE`/`DELETE` batch job, proactively reindex the affected table's indexes rather than waiting for bloat to be noticed via slow queries.

Aggressively monitoring `avg_leaf_density` and scheduling concurrent reindexes as routine maintenance — not just incident response — keeps B-Tree indexes compact, memory usage low, and query performance from degrading silently over months of write traffic.
