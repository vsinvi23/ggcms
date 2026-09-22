# Postgres BRIN Indexes: Block Range Indexing for Time-Series Datasets

## The Problem: The B-Tree RAM & Storage Tax on Time-Series Data

Time-series tables, such as those storing IoT sensor telemetry, application metrics, or financial transaction logs, grow rapidly, often accumulating billions of rows. Creating a standard B-Tree index on a timestamp column for a table of this scale introduces two severe scaling bottlenecks:

1. **Storage Footprint:** A B-Tree index must maintain a reference pointer pointing back to the physical disk location (TID) of *every single row* in the table. Consequently, the index file itself can balloon to hundreds of gigabytes, consuming valuable storage.
2. **Page Cache Eviction:** Because B-Tree index lookups require traversing hierarchical pointer structures, Postgres must load large sections of the index into memory. This evicts active data pages from the operating system's page cache, starving active queries and slowing down the entire system.

If the data is naturally appended in chronological order, using a massive B-Tree index is an inefficient storage and memory "tax."

---

## Technical Architecture & BRIN Internals

PostgreSQL solves this with **Block Range Indexing (BRIN)**. Instead of tracking individual rows, BRIN indexes physical ranges of contiguous disk pages.

```
       +--------------------------------------------------------------+
       |                         Heap Table                           |
       +--------------------------------------------------------------+
       | Block Range 0 (Pages 0 - 127)                                |
       | [Row 1: 2026-06-01] ... [Row 5000: 2026-06-02]               |
       +--------------------------------------------------------------+
       | Block Range 1 (Pages 128 - 255)                              |
       | [Row 5001: 2026-06-02] ... [Row 10000: 2026-06-04]           |
       +--------------------------------------------------------------+
                                      |
                                      | Summarized by
                                      v
       +--------------------------------------------------------------+
       |                      BRIN Index Table                        |
       +--------------------------------------------------------------+
       | Range 0 (Pages 0-127)   | Min: 2026-06-01 | Max: 2026-06-02  |
       +-------------------------+-----------------+------------------+
       | Range 1 (Pages 128-255) | Min: 2026-06-02 | Max: 2026-06-04  |
       +--------------------------------------------------------------+
```

### 1. Block Ranges and pages_per_range
A BRIN index divides the table’s physical blocks into uniform ranges of size `pages_per_range` (the default is 128 blocks, which corresponds to 1MB of physical disk space per range in standard configurations). 

For each range, BRIN stores only the **minimum** and **maximum** values of the indexed column. In the diagram above, instead of storing 10,000 distinct B-Tree leaf pointers, BRIN stores only two min/max boundaries.

### 2. Lossless Scan Strategy
When you execute a query with a filter (e.g., `WHERE reading_time >= '2026-06-03'`), Postgres scans the tiny BRIN index:
- It compares the query parameter against the min/max values of each block range.
- It identifies block ranges where the filter condition evaluates to true (in this case, Range 1).
- It performs a **Bitmap Heap Scan**, fetching and scanning *only* the physical pages in Range 1. It skips Range 0 entirely.

### 3. High Physical Correlation (Prerequisite)
A BRIN index is only effective if the physical layout of the rows on disk closely matches their logical order (a high **correlation** coefficient in `pg_stats`). 
- **Excellent fit:** Append-only tables where `created_at` or `auto_increment_id` increments sequentially with each disk block.
- **Poor fit:** Tables with heavy random updates or deletions, as these fragment the sorting, causing min/max ranges to overlap until almost every block must be scanned.

---

## Code: Implementing and Comparing B-Tree vs. BRIN Indexes

The following SQL script demonstrates creating a highly correlated time-series table, populating it with data, building both a B-Tree and a BRIN index, and comparing their sizes and execution profiles.

```sql
-- 1. Create a typical IoT time-series table
CREATE TABLE sensor_readings (
    id BIGSERIAL,
    sensor_id INT NOT NULL,
    reading_time TIMESTAMP NOT NULL,
    temperature NUMERIC(5, 2) NOT NULL,
    payload TEXT
);

-- 2. Populate with 10 Million rows of chronologically sorted data
INSERT INTO sensor_readings (sensor_id, reading_time, temperature, payload)
SELECT
    (random() * 1000)::int,
    -- Monotonically increasing times over 100 days
    '2026-01-01 00:00:00'::timestamp + (interval '1 second' * g),
    (random() * 40 + 10)::numeric(5, 2),
    repeat('A', 50) -- Add minor physical payload to expand page footings
FROM generate_series(1, 10000000) AS g;

-- Force the table to write physically to disk immediately
VACUUM ANALYZE sensor_readings;

-- 3. Create a traditional B-Tree index on the chronological column
CREATE INDEX idx_sensor_btree ON sensor_readings USING btree (reading_time);

-- 4. Create a BRIN index on the same column (using default 128 pages per range)
CREATE INDEX idx_sensor_brin ON sensor_readings USING brin (reading_time) WITH (pages_per_range = 128);

-- 5. Compare physical index sizes
SELECT
    relname AS index_name,
    pg_size_pretty(pg_relation_size(oid)) AS index_size
FROM pg_class
WHERE relname IN ('idx_sensor_btree', 'idx_sensor_brin');

-- Typical results showing B-Tree is ~220 MB while BRIN is ~48 KB:
-- idx_sensor_btree | 220 MB
-- idx_sensor_brin  | 48 KB
```

---

## Querying and Maintenance Optimization

Let's inspect how the query optimizer handles a range scan using BRIN.

```sql
-- Query plan inspection
EXPLAIN (ANALYZE, BUFFERS)
SELECT AVG(temperature)
FROM sensor_readings
WHERE reading_time BETWEEN '2026-02-15 00:00:00' AND '2026-02-16 00:00:00';
```

The output plan reveals a `Bitmap Index Scan on idx_sensor_brin` followed by a `Bitmap Heap Scan on sensor_readings`.

### BRIN Maintenance: The Summarization Delay
Because BRIN indexes are append-only, when new rows are inserted into new pages, Postgres does not immediately update the BRIN index (to prevent lock contention on writes). These new ranges are marked as "unsummarized". 

During a query scan, unsummarized ranges must be scanned sequentially, slowing down performance. You must periodically run manual summarization or configure autovacuum to handle it:

```sql
-- Manually summarize any unsummarized pages in the table
SELECT brin_summarize_new_values('idx_sensor_brin');

-- Tune the pages_per_range parameter based on read patterns
-- Smaller values (e.g., 32) reduce the data scanned in exchange for a slightly larger index
CREATE INDEX idx_sensor_brin_fine ON sensor_readings 
USING brin (reading_time) WITH (pages_per_range = 32);
```
**Decision Matrix:** Use B-Tree for time-series under 50 Million rows where instantaneous point queries are frequent. Use BRIN for tables exceeding 100 Million rows with sequentially written, range-queried datasets to reclaim precious RAM and disk block.
