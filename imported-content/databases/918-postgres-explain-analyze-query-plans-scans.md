# Reading Postgres Query Plans: Hash Joins, Nested Loops, and Bitmap Scans

## The Problem: The "Black Box" Query Optimizer and Guesswork Tuning
When a SQL query takes several seconds to execute, developers often resort to guess-driven performance tuning: they blindly add index after index, alter schema fields, or rewrite queries at random. This guesswork rarely solves the root performance problem. In fact, it often introduces index bloat, slows down write operations, and wastes database storage.

To optimize database performance, you must treat the PostgreSQL optimizer not as a black box, but as a predictable engine. You need to read and interpret execution query plans, identify bottlenecks, and understand why the engine chooses specific scan and join operations.

---

## Technical Architecture: Scans and Joins Under the Hood
Before executing a query, PostgreSQL parses, rewrites, and plans its execution path. The **Planner** generates an execution tree composed of physical operators. The **Executor** then runs these operators in a demand-driven pipeline (from bottom to top).

```
          [ Merge Join / Hash Join / Nested Loop ]  (Join Stage)
                         ▲
            ┌────────────┴────────────┐
            │                         │
     [ Index Only Scan ]     [ Bitmap Heap Scan ]   (Scan Stage)
                                      ▲
                                      │
                             [ Bitmap Index Scan ]
```

### 1. Scan Operators
The executor has several ways to fetch rows from a table:
* **Sequential Scan (Seq Scan):** Postgres scans the table from beginning to end, reading every block sequentially. This is highly efficient for small tables or queries that retrieve a large percentage (e.g., > 15-20%) of the table's total rows.
* **Index Scan:** The executor navigates a B-Tree index to find pointers (TIDs) to matching rows, then performs a random read from the table's heap file for each match. It is optimal for fetching a small number of rows.
* **Index Only Scan:** If all columns requested by the query are covered by the index, Postgres reads from the index file directly and completely bypasses the table heap. This relies heavily on the **Visibility Map** (maintained by `VACUUM`) to ensure the index data is visible to current transactions.
* **Bitmap Index Scan and Bitmap Heap Scan:** Under a standard Index Scan, if multiple keys are matched, Postgres can fetch the same heap block multiple times, leading to redundant random disk I/O. To prevent this:
  1. A **Bitmap Index Scan** reads the index and builds an in-memory bitmask of all physical heap pages containing matching rows.
  2. A **Bitmap Heap Scan** sorts these physical block addresses sequentially and performs a sequential-like scan of only those targeted heap pages, avoiding random I/O thrashing.

### 2. Join Operators
When combining multiple tables, the planner chooses between three algorithms:
* **Nested Loop:** For each row in the outer table, Postgres scans the inner table for a match. This is extremely fast if the outer table is small and the inner table has a highly selective index on the join column.
* **Hash Join:** Postgres builds an in-memory hash table of the join keys of the smaller (inner) table. It then sequentially scans the larger (outer) table, probing the hash table for matches. This is highly efficient for large, unsorted datasets. If the hash table exceeds `work_mem`, it spills to disk, destroying performance.
* **Merge Join:** Both tables are sorted on the join key, and Postgres walks through them in parallel to find matches. It is optimal for massive datasets where both inputs are already sorted (e.g., due to an index scan or parent sorting stage).

---

## Technical Implementation: Analyzing and Tuning a Slow Query

To inspect a query plan, never run a bare `EXPLAIN`. Always use `EXPLAIN (ANALYZE, BUFFERS)` in a test environment. The `ANALYZE` flag actually executes the query, showing the exact time taken, while `BUFFERS` displays the exact number of 8KB database pages read from the cache (shared hit) vs disk (read).

### Sample Execution Plan Diagnosis
Consider two relational tables: `users` and `orders`.

```sql
-- Query to analyze: Get total spend for active premium users
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING, SUMMARY)
SELECT u.username, SUM(o.amount)
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.tier = 'premium' AND u.status = 'active'
GROUP BY u.username;
```

#### The Query Plan Output:
```text
GroupAggregate  (cost=1015.42..1020.15 rows=120 width=40) (actual time=14.250..14.312 rows=110 loops=1)
  Group Key: u.username
  Buffers: shared hit=421 read=35
  ->  Sort  (cost=1015.42..1015.92 rows=200 width=40) (actual time=14.221..14.234 rows=200 loops=1)
        Sort Key: u.username
        Sort Method: quicksort  Memory: 45kB
        Buffers: shared hit=421 read=35
        ->  Hash Join  (cost=12.45..1007.80 rows=200 width=40) (actual time=0.210..13.980 rows=200 loops=1)
              Hash Cond: (o.user_id = u.id)
              Buffers: shared hit=421 read=35
              ->  Seq Scan on orders o  (cost=0.00..850.00 rows=50000 width=16) (actual time=0.010..8.250 rows=50000 loops=1)
                    Buffers: shared hit=310
              ->  Hash  (cost=12.20..12.20 rows=20 width=24) (actual time=0.180..0.180 rows=20 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 10kB
                    Buffers: shared hit=111 read=35
                    ->  Bitmap Heap Scan on users u  (cost=4.30..12.20 rows=20 width=24) (actual time=0.050..0.150 rows=20 loops=1)
                          Recheck Cond: (tier = 'premium'::text)
                          Filter: (status = 'active'::text)
                          Rows Removed by Filter: 2
                          Buffers: shared hit=111 read=35
                          ->  Bitmap Index Scan on idx_users_tier  (cost=0.00..4.25 rows=20 width=0) (actual time=0.030..0.030 rows=22 loops=1)
                                Index Cond: (tier = 'premium'::text)
                                Buffers: shared hit=10 read=12
Planning Time: 0.182 ms
Execution Time: 14.450 ms
```

### Step-by-Step Plan Diagnosis
1. **The Entry Point:** Look at the innermost nodes. Postgres starts by executing a **Bitmap Index Scan** on `idx_users_tier` to find users with `tier = 'premium'`. It uses 10 buffer pages from RAM cache and 12 pages from disk.
2. **The Heap Scan:** The resulting bitmap is passed to a **Bitmap Heap Scan** on the `users` table to verify visibility and evaluate the secondary filter `status = 'active'`. It discards 2 rows that did not match the filter.
3. **The Hash Table Build:** A **Hash** operator reads the 20 filtered users and builds a 10KB hash table in memory.
4. **The Join Stage:** Postgres performs a **Seq Scan** on the `orders` table (reading 50,000 rows across 310 pages from shared memory) and probes the `Hash` table using a **Hash Join**. Because `orders` is large and unsorted, a Hash Join is the ideal choice here.
5. **The Final Sort and Grouping:** A **Sort** node sorts the output by `username` in memory (quicksort taking 45kB of `work_mem`). Finally, **GroupAggregate** groups the rows and computes `SUM(o.amount)`.

---

## Key Tuning Guidelines Based on Plan Diagnostics
If you identify bottlenecks in your plans, use these rules to tune them:

1. **Avoid Temp Files on Disk:** If your query plan shows `Sort Method: external merge Disk: XXXkB`, the dataset sorted exceeded your `work_mem`. Increase `work_mem` for the query's session to force sorting in RAM:
   ```sql
   SET work_mem = '64MB';
   ```
2. **Repair Inaccurate Row Estimations:** If `rows` estimated by the planner differs drastically from `rows` actually processed in `actual time`, the table statistics are stale. Run an explicit update:
   ```sql
   ANALYZE table_name;
   ```
3. **Turn Seq Scans into Index Scans:** If a large table uses a Seq Scan and processes millions of rows, add a composite index on the filtering and join columns:
   ```sql
   CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id, amount);
   ```
