# Reading Postgres Query Plans: Hash Joins, Nested Loops, and Bitmap Scans

## The Problem: The SQL Optimization Guessing Game

SQL is a declarative language. You define *what* data you want to retrieve, but you do not specify the physical algorithms used to retrieve, filter, and join those records. 

When a critical query slows down in production, developers often resort to guesswork—arbitrarily adding indexes, rewriting subqueries, or restructuring schema patterns without understanding how PostgreSQL is actually executing the query.

To optimize SQL queries effectively, you must understand the **Cost-Based Optimizer**. By interpreting query plans, you can identify why the planner chooses specific scanning methods (e.g., executing a slow full-table scan instead of using an index) or join strategies (e.g., choosing a nested loop that stalls under large datasets).

---

## Technical Architecture: Scans and Joins

Postgres evaluates queries by building a tree of execution nodes. Each node represents a physical data retrieval or transformation algorithm.

```
       [Index Scan]                     [Bitmap Index Scan]
       B-Tree Lookup                    B-Tree Scan (collects matches)
            |                                    |
            v (Random I/O)                       v (In-Memory Sort)
       Table Heap Page                   Bitmap Page Memory Map
                                                 |
                                                 v (Sequential-like I/O)
                                            Table Heap Page
 
 
       [Hash Join Node]
       1. Build Hash Table on Inner Table -> [Key Hash Cache Map]
       2. Stream Outer Table -------------> Probes Hash Cache Map -> Output matches
```

### 1. Fundamental Scanning Methods
Before joining rows, Postgres must fetch them from disk blocks using one of three primary scan methods:
- **Sequential Scan (Seq Scan):** Scans the entire table block-by-block. Postgres chooses this when the table is small or when a query filters out a high percentage of rows (usually $> 20\%$).
- **Index Scan:** A two-step lookup. First, the database searches a B-Tree index to locate the matching keys and physical row identifiers (TIDs). Second, it fetches the corresponding data blocks from the table heap. This requires random disk I/O.
- **Bitmap Index Scan & Bitmap Heap Scan:** Designed to optimize random disk accesses. 
  1. The **Bitmap Index Scan** searches the index and constructs a bitmap in memory, where each bit represents a physical table page containing matching rows.
  2. The bits are sorted by physical block ID.
  3. The **Bitmap Heap Scan** reads the table blocks sequentially, reducing disk head movement and maximizing OS page cache hits.

### 2. Physical Join Algorithms
To combine two tables on a join key, Postgres selects one of three algorithms:
- **Nested Loop:** The database loops through every row of the outer table (outer relation) and searches for matching rows in the inner table (inner relation), ideally using an index. This is highly efficient for small datasets.
- **Hash Join:** Postgres reads the smaller relation (inner table) and builds a hash table in memory (using the join key as the hash key). It then scans the larger relation (outer table) and probes the hash table for matches. This is efficient for large, unsorted datasets.
- **Merge Join:** Both relations are sorted on the join key (either by an index scan or an explicit in-memory sort). Postgres then scans both relations in parallel, merging matching keys. This is efficient for large, pre-sorted datasets.

---

## Code: Parsing an Annotated Query Plan

To analyze a query's physical execution plan, run the query prefixed with `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)`. 

- `ANALYZE`: Executes the query and reports real runtime statistics alongside cost estimates.
- `BUFFERS`: Reports page cache hits, reads, and writes (crucial for evaluating disk I/O bottlenecks).
- `VERBOSE`: Displays additional plan details, such as target column lists.

### SQL Setup and Diagnostic Execution
```sql
-- Join users and orders on join keys with filters
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT u.username, o.order_date, o.amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active' AND o.amount > 500;
```

### Typical Output Analysis

The query plan is returned as a nested tree structure. You must read it from the inside out, starting with the most deeply indented nodes.

```text
Hash Join  (cost=12.40..452.10 rows=45 width=42) (actual time=0.082..12.315 rows=52 loops=1)
  Output: u.username, o.order_date, o.amount
  Hash Cond: (o.user_id = u.id)
  Buffers: shared hit=421 read=12
  ->  Seq Scan on public.orders o  (cost=0.00..380.00 rows=520 width=24) (actual time=0.012..8.410 rows=512 loops=1)
        Output: o.id, o.user_id, o.order_date, o.amount
        Filter: (o.amount > 500)
        Rows Removed by Filter: 9488
        Buffers: shared hit=310 read=10
  ->  Hash  (cost=10.50..10.50 rows=152 width=26) (actual time=0.055..0.055 rows=150 loops=1)
        Output: u.username, u.id
        Buckets: 1024  Batches: 1  Memory Usage: 18kB
        Buffers: shared hit=111 read=2
        ->  Bitmap Heap Scan on public.users u  (cost=4.30..10.50 rows=152 width=26) (actual time=0.021..0.041 rows=150 loops=1)
              Output: u.username, u.id
              Recheck Cond: (u.status = 'active'::text)
              Heap Blocks: exact=12
              Buffers: shared hit=111 read=2
              ->  Bitmap Index Scan on idx_users_status  (cost=0.00..4.20 rows=152 width=0) (actual time=0.015..0.015 rows=150 loops=1)
                    Index Cond: (u.status = 'active'::text)
                    Buffers: shared hit=2
```

### Breaking Down the Plan Nodes

1. **The Deepest Node (Bitmap Index Scan):** 
   - Postgres searches the index `idx_users_status` for users where `status = 'active'`. It finds 150 rows.
   - It performs this operation using 2 shared page hits in RAM (`shared hit=2`).

2. **Bitmap Heap Scan:**
   - Using the constructed bitmap, Postgres reads the corresponding pages from the `users` table on disk.
   - `Heap Blocks: exact=12` indicates that all matching rows were located in 12 physical blocks.
   - It reads 2 blocks from physical disk (`read=2`) and hits 111 blocks in the RAM cache (`shared hit=111`).

3. **Hash Node:**
   - Postgres reads the 150 filtered users and builds an in-memory hash table.
   - It fits entirely in memory using a single batch (`Batches: 1`) and consumes `18kB` of RAM.

4. **Sequential Scan on orders (`Seq Scan on public.orders`):**
   - In parallel, Postgres performs a full-table scan on the `orders` table to filter records where `amount > 500`.
   - Out of 10,000 total rows, it identifies 512 matches, removing 9,488 rows via the filter.
   - This sequential scan reads 10 blocks from physical disk (`read=10`).

5. **Hash Join (Root Node):**
   - Finally, Postgres loops through the 512 orders and probes the in-memory user hash table.
   - It outputs 52 matched rows in `12.315` milliseconds.

By auditing the plan nodes and comparing `rows` (the planner's estimate) with `actual rows` (the real execution metric), you can identify out-of-date table statistics (remedied by `ANALYZE`) or missing indexes on high-cost nodes.
