---
title: "Postgres BRIN Indexes: Shrinking Time-Series Index Size by 99%"
description: "Why B-Tree indexes collapse under billion-row time-series tables, how BRIN's block-range min/max metadata prunes scans instead, and how to size, tune, and maintain it correctly."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "brin-index"
  - "time-series"
  - "indexing"
  - "query-performance"
---

# Postgres BRIN Indexes: Shrinking Time-Series Index Size by 99%

## The Problem: B-Tree Index Bloat at Billion-Row Scale

B-Tree indexes are the right default for most OLTP workloads — fast point lookups, fast range scans. But time-series data (IoT sensor readings, application logs, financial tick data) breaks that model at scale.

A B-Tree stores a pointer for *every single row*, so index size scales linearly (`O(N)`) with row count. A B-Tree on a `timestamp` column for a billion-row table can consume tens to hundreds of gigabytes. Once the index no longer fits in `shared_buffers`/RAM, every lookup forces random disk I/O to traverse the tree, and performance falls off a cliff.

## The Architecture: Block Range Indexes (BRIN)

PostgreSQL's answer for this exact shape of data is **BRIN (Block Range INdex)**. Instead of indexing individual rows, BRIN indexes metadata about *ranges of physical disk pages*. A table's data file is divided into 8KB pages; BRIN groups adjacent pages into a "range" — 128 pages (1MB) by default, tunable via `pages_per_range`. For each range, BRIN stores only the **minimum** and **maximum** value of the indexed column across all rows in that range.

```text
B-Tree Index (row-level pointers)
[Node] -> [Node] -> [Leaf: row1, row2, row3, row4, row5, ...]
(Size: huge — every row gets an entry.)

BRIN Index (block-range metadata)
[Range 1: Blocks 0-127]   min: 2026-03-01 00:00, max: 2026-03-01 23:59
[Range 2: Blocks 128-255] min: 2026-03-02 00:00, max: 2026-03-02 23:59
[Range 3: Blocks 256-383] min: 2026-03-03 00:00, max: 2026-03-03 23:59
(Size: tiny — two values per 1MB of table data.)
```

When a query filters on the indexed column, Postgres walks the BRIN range map and compares the filter bound against each range's min/max:

```text
Query: WHERE created_at >= '2026-03-02 12:00:00'

Range 1 (2026-03-01): max < filter  -> SKIP entirely
Range 2 (2026-03-02): overlaps      -> scan pages 128-255
Range 3 (2026-03-03): overlaps      -> scan pages 256-383
```

Ranges that can't possibly contain a match are skipped outright; ranges that might are handled with a **Bitmap Heap Scan** over just those pages — sequential I/O over a small physical slice of the table, not a full-table scan.

## The Physical Correlation Requirement

BRIN only works if the indexed column's values are physically correlated with their insertion order on disk — `pg_stats.correlation` close to `1.0` or `-1.0`. Time-series data satisfies this naturally: rows are appended in timestamp order, so newer timestamps land in physically later blocks.

If data is inserted out of correlation order (random UUID primary keys, backfills interleaved with live writes), each block range's min/max spans nearly the entire keyspace, and no range can be pruned:

```text
Random-insertion BRIN degradation:
[Range 1 (Pages 0-127)]:   Min: 001, Max: 999  --> overlaps everything
[Range 2 (Pages 128-255)]: Min: 002, Max: 998  --> overlaps everything
(No range can be excluded; the planner falls back to a full sequential scan)
```

Check correlation before committing to BRIN on a given column:

```sql
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'sensor_readings';
```

## Creating and Tuning a BRIN Index

```sql
CREATE TABLE sensor_readings (
    id BIGSERIAL,
    sensor_id INT NOT NULL,
    reading NUMERIC NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sequential, naturally-correlated inserts (typical time-series ingestion)
INSERT INTO sensor_readings (sensor_id, reading, created_at)
SELECT
    (random() * 100)::int,
    random() * 50.0,
    g
FROM generate_series('2026-01-01 00:00:00'::timestamp, '2026-03-01 00:00:00'::timestamp, '5 seconds'::interval) g;

-- Default: 128 pages (1MB) per range
CREATE INDEX idx_sensor_readings_brin
ON sensor_readings USING brin (created_at);

-- Finer-grained: 32 pages (256KB) per range — larger index, more precise pruning
CREATE INDEX idx_sensor_readings_brin_fine
ON sensor_readings USING brin (created_at) WITH (pages_per_range = 32);
```

**Tuning trade-off:**

- **Smaller `pages_per_range` (e.g., 32)**: slightly larger index, but the sequential-scan portion of each matched range is smaller, so queries run faster.
- **Larger `pages_per_range` (e.g., 512)**: index shrinks to the extreme, but each matched range means scanning more blocks, so queries slow down.

### Verifying the size difference directly

```sql
CREATE INDEX idx_sensor_readings_btree ON sensor_readings (created_at);

SELECT
    c.relname AS relation_name,
    pg_size_pretty(pg_relation_size(c.oid)) AS physical_size
FROM pg_class c
WHERE c.relname IN ('sensor_readings', 'idx_sensor_readings_brin', 'idx_sensor_readings_btree');
```

Expect the B-Tree index to be hundreds of megabytes to gigabytes, and the BRIN index to be single-digit megabytes or less for the same column and table.

## Maintenance: Summarization Is Not Automatic in Real Time

Unlike a B-Tree, BRIN does not update a range's min/max the instant a row is inserted — that would require locking against the insert path. Newly written blocks remain **unsummarized** until `autovacuum` sweeps them or you trigger summarization manually. Until summarized, Postgres treats an unsummarized range as "might contain a match" (not prunable), which quietly degrades pruning efficiency right after a bulk load.

```sql
-- Summarize all currently unsummarized ranges
SELECT brin_summarize_new_values('idx_sensor_readings_brin');

-- Force a rebuild of one specific range (e.g., after out-of-order backfill writes)
SELECT brin_desummarize_range('idx_sensor_readings_brin', 500);
SELECT brin_summarize_range('idx_sensor_readings_brin', 500);
```

Run `brin_summarize_new_values` as a scheduled maintenance step right after any bulk-ingestion job, rather than waiting for the next autovacuum pass to catch up.

## Performance Reality Check

**The upside:** a BRIN index can be 99% smaller than the equivalent B-Tree — a 50GB B-Tree can become a 50MB BRIN index. That frees RAM for caching actual table data, and BRIN write overhead is negligible compared to B-Tree page splits and rebalancing.

**The downside:** point lookups (`WHERE created_at = '2026-03-01 10:15:30'`) are slower than a B-Tree — Postgres still has to scan the full 1MB (or configured) block range to find the exact row, it just skips the ranges that can't contain it.

Use BRIN when the table is append-only or near-append-only, chronologically ordered, and queried with range predicates over large time windows. Avoid it for heavily updated tables, tables ordered by random UUIDs/hashes, or workloads dominated by exact-match point lookups.
