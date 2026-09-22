# Reading Postgres Query Plans: Hash Joins, Nested Loops, and Bitmap Scans

## The Problem: The SQL Black Box
SQL is a declarative language; you tell the database *what* you want, not *how* to get it. The PostgreSQL Query Planner acts as the compiler, translating your SQL into a physical execution plan. 

When a query takes 10 seconds instead of 10 milliseconds, engineers often guess at the cause, randomly adding indexes. To fix slow queries systematically, you must look inside the black box by reading the execution plan.

## Architecture: The Execution Tree
A Postgres query plan is a tree of nodes. Data flows from the bottom (leaf nodes) up to the top (root node). Each node performs a specific physical operation (e.g., scanning a table, sorting, joining).

To view a plan, prefix your query with `EXPLAIN (ANALYZE, BUFFERS)`.
*   `EXPLAIN`: Shows the planner's *estimated* costs.
*   `ANALYZE`: Executes the query and shows the *actual* times and row counts.
*   `BUFFERS`: Shows how many 8KB memory pages were read from cache (`hit`) or disk (`read`).

### A Basic Plan Output
```text
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM users WHERE active = true;

Seq Scan on users  (cost=0.00..1534.00 rows=4000 width=72) (actual time=0.015..5.123 rows=3980 loops=1)
  Filter: active
  Rows Removed by Filter: 8000
  Buffers: shared hit=450 read=12
Execution Time: 5.430 ms
```
*   **cost=0.00..1534.00:** The estimated startup cost (`0.00`) and total cost (`1534.00`). These are arbitrary units, not milliseconds.
*   **actual time=0.015..5.123:** The actual startup time (ms) and total time (ms).
*   **loops=1:** How many times this specific node was executed.

## Understanding Scan Types

The leaf nodes of a plan fetch data from disk. 
1.  **Seq Scan (Sequential Scan):** Reads the entire table from beginning to end. Fast for reading the whole table, catastrophic if you only want one row out of a billion.
2.  **Index Scan:** Traverses the B-Tree index to find a pointer, then immediately fetches the specific row from the table heap. Fast for fetching a small number of rows.
3.  **Index Only Scan:** The data you requested is fully contained within the index itself. Postgres doesn't even touch the table heap. (Extremely fast).
4.  **Bitmap Index/Heap Scan:** When fetching many rows via an index, jumping back and forth to the table heap (random I/O) is slow. Postgres scans the index, builds a bitmap of the physical page locations in memory, sorts them, and then sequentially reads the table heap pages.

```text
Bitmap Heap Scan on users
  Recheck Cond: (created_at > '2023-01-01')
  -> Bitmap Index Scan on idx_users_created_at
```

## Understanding Join Types

When combining tables, the planner chooses one of three physical algorithms based on row counts and available memory (`work_mem`).

1.  **Nested Loop Join:** 
    *   *Algorithm:* For every row in Table A (outer), scan Table B (inner) for a match. 
    *   *Performance:* `O(A * B)`. Very fast if the outer table is tiny (e.g., 1 row) and the inner table has an index. Disastrous if both tables are large.
2.  **Hash Join:** 
    *   *Algorithm:* Scans Table B and builds an in-memory Hash Table using the join key. Then scans Table A, probing the Hash Table for matches.
    *   *Performance:* `O(A + B)`. The workhorse of Postgres. Excellent for joining large, unsorted datasets, provided the Hash Table fits in `work_mem`. If it exceeds memory, it spills to disk (slow).
3.  **Merge Join:** 
    *   *Algorithm:* Sorts both tables by the join key, then steps through them simultaneously like zipping a zipper.
    *   *Performance:* `O(A log A + B log B)`. Very fast if the tables are *already* sorted (e.g., via an index). 

## A Complex Plan (Hash Join Example)
```text
Hash Join  (actual time=12.1..45.2 rows=1000 loops=1)
  Hash Cond: (orders.user_id = users.id)
  -> Seq Scan on orders  (actual time=0.1..10.5 rows=50000 loops=1)
  -> Hash  (actual time=5.1..5.1 rows=10000 loops=1)
        Buckets: 16384  Batches: 1  Memory Usage: 768kB
        -> Seq Scan on users  (actual time=0.1..3.2 rows=10000 loops=1)
```
**Reading bottom-up:**
1. Postgres sequentially scans `users` (10,000 rows).
2. It builds a Hash table in memory (`Memory Usage: 768kB`).
3. It sequentially scans `orders` (50,000 rows).
4. It probes the Hash table for every order to output the final joined rows.

## Conclusion
Randomly adding indexes is database malpractice. By prefixing queries with `EXPLAIN (ANALYZE, BUFFERS)` and reading the tree from the bottom up, you can identify exactly where time and I/O are spent—whether it's a massive Seq Scan, a Nested Loop exploding `loops=10000`, or a Hash Join spilling to disk.
