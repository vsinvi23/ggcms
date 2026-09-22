# Postgres BRIN Indexes: Block Range Indexing for Time-Series Datasets

## The Problem: The Memory and Storage Tax of Timeseries B-Trees
As modern databases ingest high-volume time-series data—such as IoT metrics, application logs, or financial tick data—tables rapidly grow to hundreds of millions or billions of rows. 

If you create a standard B-Tree index on a timestamp column to speed up range queries, you will quickly face a scaling wall:
1. **Size Explosion:** A B-Tree index stores pointer references to **every single row** in the table. For a billion-row table, a B-Tree on a `timestamp` column can easily exceed 50 GB.
2. **RAM Exhaustion:** To remain performant, B-Tree indexes must reside entirely in RAM. When index size exceeds RAM, Postgres is forced to swap pages to disk, slowing down index inserts and range scans.
3. **Write Degradation:** Each new row insert forces leaf-node splits and structural updates in the B-Tree, adding substantial overhead to ingestion rates.

---

## Technical Architecture: Block Range Index (BRIN) Mechanics
PostgreSQL solves this using **Block Range Indexes (BRIN)**. BRIN is designed specifically for tables where data values are naturally correlated with their physical storage order (known as physical correlation). 

Time-series data is a prime candidate: rows are appended sequentially over time, meaning newer dates are stored physically later in the table's heap files.

Instead of indexing individual rows, a BRIN index divides the table into contiguous blocks of physical pages (called **Block Ranges**). By default, a range spans 128 disk pages (which equates to exactly 1MB of storage under standard 8KB pages). For each block range, the BRIN index stores only two values:
* The **Minimum** value in that range.
* The **Maximum** value in that range.

```
       PHYSICAL TABLE HEAP (Continuous Pages)
  ┌─────────────────────────────────────────────────────────────┐
  │ Page 0 ──► Page 127 (Block Range 1)                         │
  │ Minimum: '2026-06-01 00:00:00' | Maximum: '2026-06-01 11:59'│
  └──────────────────────────────┬──────────────────────────────┘
                                 ▲
                                 │ Checked during scan
  ┌──────────────────────────────┴──────────────────────────────┐
  │ Page 128 ──► Page 255 (Block Range 2)                       │
  │ Minimum: '2026-06-01 12:00:00' | Maximum: '2026-06-01 23:59'│
  └─────────────────────────────────────────────────────────────┘
```

### Query Processing via Block Range Exclusion
When a client executes a query such as:

```sql
SELECT * FROM sensor_readings WHERE reading_time >= '2026-06-01 14:00:00';
```

Postgres performs the following:
1. It scans the incredibly small BRIN index.
2. It evaluates each block range's Min/Max boundaries.
3. If the query value falls within a range's bounds, that range is selected for scanning. If it falls outside (such as Block Range 1), the physical pages are completely excluded from disk scans (Block Exclusion).
4. Postgres executes a sequential scan *only* on the selected blocks.

This reduces index sizes by up to 99.9% compared to B-Trees while keeping disk I/O highly focused.

---

## Technical Implementation: BRIN Index Creation and Performance Tuning

### 1. Creating a Optimized BRIN Index
When creating a BRIN index, you can tune the `pages_per_range` parameter. 
* **Smaller range (e.g., 32 pages):** Speeds up queries by scanning fewer pages, but increases index size slightly.
* **Larger range (e.g., 256 or 512 pages):** Reduces index size even further, but increases the amount of sequential disk scan required per query match.

```sql
-- Create a table designed for metrics ingestion
CREATE TABLE sensor_readings (
    id BIGSERIAL,
    sensor_id INT NOT NULL,
    reading_time TIMESTAMP NOT NULL,
    temperature NUMERIC(5,2) NOT NULL,
    humidity NUMERIC(5,2) NOT NULL
);

-- Load sample sequential timeseries data
INSERT INTO sensor_readings (sensor_id, reading_time, temperature, humidity)
SELECT 
    (random() * 100)::int,
    g,
    (random() * 40)::numeric(5,2),
    (random() * 100)::numeric(5,2)
FROM generate_series(
    '2026-01-01 00:00:00'::timestamp, 
    '2026-06-01 00:00:00'::timestamp, 
    '1 second'::interval
) g;

-- Create BRIN Index with tuned range (64 pages = 512KB blocks)
CREATE INDEX idx_sensor_readings_brin_time 
ON sensor_readings 
USING brin (reading_time) 
WITH (pages_per_range = 64);
```

### 2. Space and Performance Comparisons
Let's analyze the physical storage difference between a standard B-Tree and a tuned BRIN index:

```sql
-- Create a standard B-Tree on a duplicate test table to compare sizes
CREATE TABLE sensor_readings_btree AS SELECT * FROM sensor_readings;
CREATE INDEX idx_sensor_readings_btree_time ON sensor_readings_btree(reading_time);

-- Compare the sizes of the table and both indexes
SELECT
    pg_size_pretty(pg_relation_size('sensor_readings_btree')) AS btree_table_size,
    pg_size_pretty(pg_relation_size('idx_sensor_readings_btree_time')) AS btree_index_size,
    pg_size_pretty(pg_relation_size('sensor_readings')) AS brin_table_size,
    pg_size_pretty(pg_relation_size('idx_sensor_readings_brin_time')) AS brin_index_size;
```

**Typical Output:**
* B-Tree Index: **~350 MB**
* BRIN Index: **~192 KB** (Over 1800x smaller!)

---

## Out-of-Order Ingestion and Index Maintenance
One major pitfall with BRIN indexes is **out-of-order writes**. If you insert historical metrics (e.g., a batch of 2024 data inserted into the middle of 2026 pages), the Min/Max bounds of newly written block ranges will widen significantly. If a block range's Min is 2024 and Max is 2026, it can no longer be excluded during queries, rendering the BRIN index highly inefficient.

### Manual Summarization
When new rows are appended to the table, BRIN indexes do not update boundaries on every insert to avoid blocking. Instead, pages are summarized lazily. You should automate index summarization in your batch ingestion pipelines:

```sql
-- Force a summarization of all un-summarized block ranges
SELECT brin_summarize_new_values('idx_sensor_readings_brin_time');

-- Clean up and compress bloated ranges (anti-entropy index maintenance)
REINDEX INDEX CONCURRENTLY idx_sensor_readings_brin_time;
```
