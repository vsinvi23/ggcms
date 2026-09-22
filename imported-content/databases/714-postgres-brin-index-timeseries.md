# Postgres BRIN Indexes: Block Range Indexing for Time-Series Datasets

## The Problem: B-Tree Memory Exhaustion on Big Data
When storing massive, append-only datasets—such as IoT sensor metrics, application access logs, or financial tick data—tables quickly grow into the multi-terabyte range. 

Developers default to creating B-Tree indexes on the `timestamp` column. However, a B-Tree creates an index entry for *every single row*. For a table with 10 billion rows, the B-Tree index itself can easily consume hundreds of gigabytes. If the index exceeds available RAM (`shared_buffers`), query performance crashes as Postgres is forced to perform random disk I/O to traverse the index tree.

## The Solution: BRIN (Block Range Indexes)
PostgreSQL introduced BRIN (Block Range Indexes) specifically for massive, naturally ordered datasets. Instead of indexing every row, BRIN indexes metadata about **ranges of physical data blocks** (pages).

### Technical Architecture
A Postgres data file is divided into 8KB pages (blocks). BRIN logically groups adjacent pages into a "range" (by default, 128 pages = 1MB). For each range, BRIN calculates and stores summary metadata—most commonly the Minimum and Maximum values of a specific column.

```text
Table Data Blocks (Ordered by Time):
Block 1-128:   [08:00 to 09:15]
Block 129-256: [09:16 to 10:30]
Block 257-384: [10:31 to 11:45]

BRIN Index Structure:
Range 1 (Blocks 1-128)   -> Min: 08:00, Max: 09:15
Range 2 (Blocks 129-256) -> Min: 09:16, Max: 10:30
Range 3 (Blocks 257-384) -> Min: 10:31, Max: 11:45
```

When a query requests data `WHERE time BETWEEN '09:00' AND '10:00'`, the executor scans the BRIN index.
1. Range 1 (`08:00-09:15`): Overlaps. Keep.
2. Range 2 (`09:16-10:30`): Overlaps. Keep.
3. Range 3 (`10:31-11:45`): Does not overlap. Skip.

Postgres then executes a Bitmap Heap Scan only on the physical blocks inside Range 1 and Range 2.

### The Benefits: Size and Speed
Because BRIN only stores a few bytes per *megabyte* of data, it is astonishingly small. A 500GB B-Tree index can often be replaced by a 5MB BRIN index. This tiny index sits comfortably in L1/L2 CPU cache, let alone RAM, making range scans remarkably fast while saving vast amounts of disk space.

### Code: Creating and Tuning BRIN
BRIN requires the data to be physically correlated with the indexed column. It excels on `INSERT`-only tables where timestamps naturally ascend as data is appended to disk.

```sql
-- Create a BRIN index on the timestamp column
CREATE INDEX idx_sensor_data_time_brin 
ON sensor_data 
USING BRIN (created_at);
```

You can tune the granularity. A smaller `pages_per_range` makes the index slightly larger but allows the executor to skip data more accurately, reducing CPU overhead during the final heap scan.

```sql
-- Create a finer-grained BRIN index (32 pages = 256KB ranges)
CREATE INDEX idx_sensor_data_time_brin_fine 
ON sensor_data 
USING BRIN (created_at) WITH (pages_per_range = 32);
```

### BRIN Maintenance
Because BRIN summarizes ranges, updates or deletes that break the physical ordering destroy BRIN's efficiency. Furthermore, as new ranges are appended, the summary index must be updated. This is handled lazily by autovacuum, but can be triggered manually:

```sql
-- Summarize newly appended ranges in the BRIN index
SELECT brin_summarize_new_values('idx_sensor_data_time_brin');
```

For time-series, log data, and data warehousing, swapping B-Trees for BRIN indexes is one of the most impactful architectural optimizations available in PostgreSQL.