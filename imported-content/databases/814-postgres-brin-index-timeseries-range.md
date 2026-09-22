# Postgres BRIN Indexes: Block Range Indexing for Time-Series Datasets

## The Problem: Large-Scale Time-Series Storage and B-Tree Overhead

When managing massive time-series datasets or log databases in PostgreSQL (e.g., hundreds of millions of rows of IoT sensor metrics or application audit trails), index size becomes a primary storage and performance bottleneck. 

Under these write-heavy workloads, a traditional B-Tree index has significant architectural limitations:
* **Size Scale:** A B-Tree index contains pointer references for every single row in the table, meaning the index size scales linearly ($O(N)$) with the row count. For tables with billions of rows, a single B-Tree index file can easily grow to hundreds of gigabytes.
* **Cache Eviction:** When indexes exceed the physical RAM of the database server, Postgres can no longer cache the B-Tree leaf pages. Every query search triggers slow, random disk read I/O, degrading index update rates during inserts.
* **Write Amplification:** Maintaining a balanced B-Tree structure during high-concurrency inserts requires continuous page splits and WAL generation, drastically limiting database ingestion performance.

## The Architecture: Block Range Indexing (BRIN)

PostgreSQL resolves this scaling issue for large, sorted datasets by introducing **Block Range Indexes (BRIN)**. 

Unlike B-Tree indexes, which store a physical pointer for every row, BRIN operates on the physical layout of the database on disk. A BRIN index divides the table into contiguous sets of disk pages called **Block Ranges** (configured via `pages_per_range`, defaulting to 128 pages, which equals 1MB of storage). For each block range, the BRIN index stores only two values:
1. The **minimum** value of the indexed column within that block range.
2. The **maximum** value of the indexed column within that block range.

```
Table Heap File (Disk Blocks)
+------------------------+------------------------+------------------------+
| Pages 0 to 127         | Pages 128 to 255       | Pages 256 to 383       |
| Min: 2026-03-01 00:00  | Min: 2026-03-02 00:00  | Min: 2026-03-03 00:00  |
| Max: 2026-03-01 23:59  | Max: 2026-03-02 23:59  | Max: 2026-03-03 23:59  |
+------------------------+------------------------+------------------------+
            \                        |                        /
             \                       |                       /
+--------------------------------------------------------------------------+
|                            BRIN INDEX MAP                                |
|  [Range 1: Pages 0-127]   -> [Min: 2026-03-01, Max: 2026-03-01]          |
|  [Range 2: Pages 128-255] -> [Min: 2026-03-02, Max: 2026-03-02]          |
|  [Range 3: Pages 256-383] -> [Min: 2026-03-03, Max: 2026-03-03]          |
+--------------------------------------------------------------------------+
```

When a user executes a query with a filter (e.g., `WHERE created_at >= '2026-03-02 12:00:00'`), Postgres scans the BRIN index map. It compares the filter value against the min/max bounds of each block range:
* Range 1 bounds are lower than the query filter; Postgres skips Pages 0-127 completely.
* Range 2 bounds overlap the query filter; Postgres executes a sequential scan over Pages 128-255.
* This range elimination capability yields search performance comparable to index scans while dramatically reducing the index footprint.

### Physical Correlation Requirement

For BRIN to function effectively, there must be a strong physical correlation between the values of the column and their physical order on disk (known as **Correlation**). Time-series datasets naturally align with this pattern: events are inserted sequentially over time, meaning newer dates are written to physically higher-numbered blocks. 

If data is inserted randomly (e.g., UUID keys or random strings), the min/max values of adjacent block ranges will overlap heavily. For example, if every block range contains values spanning the entire keyspace, the BRIN index cannot eliminate any ranges. This forces Postgres to fall back to a full, slow sequential scan of the table, making the index useless.

```
Random Insertion Overlaps (Degraded BRIN):
[Range 1 (Pages 0-127)]:   Min: 001, Max: 999  --> Overlaps completely
[Range 2 (Pages 128-255)]: Min: 002, Max: 998  --> Overlaps completely
(No pages can be excluded; index scans fallback to full sequential sweeps)
```

## Practical SQL Implementation and Maintenance Runbook

### Creating a BRIN Index on a Time-Series Table

```sql
-- Step 1: Create a highly correlated time-series table
CREATE TABLE sensor_readings (
    id BIGSERIAL,
    sensor_id INT NOT NULL,
    reading NUMERIC NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 2: Insert data sequentially (natural correlation)
INSERT INTO sensor_readings (sensor_id, reading, created_at)
SELECT 
    (random() * 100)::int, 
    random() * 50.0, 
    g
FROM generate_series('2026-01-01 00:00:00'::timestamp, '2026-03-01 00:00:00'::timestamp, '5 seconds'::interval) g;

-- Step 3: Create the BRIN index
-- Adjust pages_per_range: lower values increase precision but increase index size.
CREATE INDEX idx_sensor_readings_brin 
ON sensor_readings USING brin (created_at) 
WITH (pages_per_range = 64);
```

### Checking Index Footprint Comparison

Verify the extreme space savings of BRIN vs B-Tree:

```sql
-- Create a temporary B-Tree index to verify size differences
CREATE INDEX idx_sensor_readings_btree ON sensor_readings (created_at);

-- Check relation sizes
SELECT
    c.relname AS relation_name,
    pg_size_pretty(pg_relation_size(c.oid)) AS physical_size
FROM pg_class c
WHERE c.relname IN ('sensor_readings', 'idx_sensor_readings_brin', 'idx_sensor_readings_btree');
```
*Expected Output:* The B-Tree index will consume hundreds of megabytes, while the BRIN index will measure only a few kilobytes.

### Essential BRIN Maintenance Operations

Unlike B-Trees, BRIN indexes do not automatically update min/max ranges for newly appended rows in real time to avoid locking insert pipelines. Newly inserted blocks remain **unsummarized** until a vacuum sweeps them or an administrator manually triggers a range summarization.

1. **Verify Corrupted or Unsummarized Ranges:**
```sql
-- Check the correlation factor of columns (Should be close to 1.0 or -1.0 for BRIN)
SELECT attname, correlation 
FROM pg_stats 
WHERE tablename = 'sensor_readings';
```

2. **Manually Force Summarization of New Blocks:**
Run this maintenance command during quiet hours or post-bulk-ingestion pipelines to ensure new ranges are indexed:
```sql
-- Summarize all unsummarized blocks in the index
SELECT brin_summarize_new_values('idx_sensor_readings_brin');
```

3. **Rebuilding Stale Ranges:**
If out-of-order writes have corrupted specific ranges, desummarize and force rebuild:
```sql
-- Desummarize a specific block range (e.g., range containing block 500)
SELECT brin_desummarize_range('idx_sensor_readings_brin', 500);

-- Summarize range back
SELECT brin_summarize_range('idx_sensor_readings_brin', 500);
```
