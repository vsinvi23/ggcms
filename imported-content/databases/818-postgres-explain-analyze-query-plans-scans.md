# Reading Postgres Query Plans: Hash Joins, Nested Loops, and Bitmap Scans

## The Problem: The Query Optimization Black Box

As application databases grow, queries that executed in milliseconds during development can suddenly degrade to multi-second bottlenecks in production. When database performance drops, developers often resort to ungrounded trial-and-error tactics: blindly adding random multi-column indexes or rewriting queries without analyzing how the PostgreSQL query planner is actually retrieving and joining data.

To optimize database operations systematically, engineers must be able to read and interpret execution plans. Postgres provides the `EXPLAIN` and `EXPLAIN ANALYZE` commands, which reveal the precise tree-like execution graph chosen by the optimizer. Understanding these plans requires a solid grasp of physical scans and join algorithms.

## The Architecture: Scan Methods and Join Algorithms

The PostgreSQL query planner evaluates several physical access paths to retrieve data from heap tables and combine relations.

```
                            [Hash Join] (Root Node)
                             /         \
                 [Hash Scan]             [Seq Scan] on customers (Outer Table)
                      |
        [Bitmap Heap Scan] on orders (Inner Table)
                      |
       [Bitmap Index Scan] on idx_orders_cust_id
```

### 1. Physical Scan Methods

* **Sequential Scan (Seq Scan):** Postgres scans the entire table heap sequentially, reading every single disk page. It is highly efficient for retrieving a large percentage of the table's total rows or for small tables.
* **Index Scan:** The database traverses a B-Tree index structure to find specific matching keys, retrieves the physical heap page offset, and immediately reads that page from disk. Index scans are optimal for highly selective queries returning only a few rows, but they can trigger slow random disk I/O if many rows are returned.
* **Index Only Scan:** If all columns requested by the `SELECT` query are stored directly within the index, and the target rows are confirmed as visible via the database **Visibility Map**, Postgres reads *only* the index pages on disk. This completely avoids reading the table heap, eliminating a significant amount of disk I/O.
* **Bitmap Index Scan and Bitmap Heap Scan:** A dual-phase scan designed to minimize random I/O.
  1. The **Bitmap Index Scan** scans the index and constructs a physical memory bitmap of page offsets that contain matching rows.
  2. The **Bitmap Heap Scan** reads this bitmap, reorganizes the targeted heap blocks into sequential order, and sweeps them from disk. This combines the precision of index-based filtering with the sequential read speeds of a sequential scan.

### 2. Physical Join Algorithms

* **Nested Loop:** A straightforward join algorithm: for every row processed in the outer table, the executor sweeps the inner table to find matches. This algorithm is exceptionally fast if the outer table is small and the inner table can utilize a rapid index scan on the join key.
* **Hash Join:** Used for joining larger, unsorted datasets. The executor reads the inner table, hashes the join keys, and builds a temporary hash table in memory. It then scans the outer table sequentially, hashing each row's join key and performing instant lookups against the memory hash table.
* **Merge Join:** If both datasets are already physically sorted on the join key (either due to an index scan or an explicit sort step), Postgres walks both relations in parallel, merging matching keys. This is highly efficient for extremely large joins where there is insufficient memory to house a hash table.

## Practical SQL Implementation and Execution Plan Breakdown

### Step 1: Create the Schema and Generate Representative Data

```sql
-- Create relational tables
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    signup_date DATE NOT NULL
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    order_date TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Populate with simulated high-volume production data
INSERT INTO customers (name, signup_date)
SELECT 
    'Customer ' || i, 
    CURRENT_DATE - (random() * 365)::int
FROM generate_series(1, 50000) i;

INSERT INTO orders (customer_id, amount, order_date)
SELECT 
    (random() * 49999 + 1)::int,
    (random() * 1000)::numeric(10,2),
    NOW() - (random() * 90)::interval
FROM generate_series(1, 300000) i;

-- Create an index to evaluate access paths
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Force Postgres to collect fresh table statistics
ANALYZE customers;
ANALYZE orders;
```

### Step 2: Executing and Interpreting `EXPLAIN ANALYZE`

To capture both the planner's estimates and the actual execution times, run your target query with `EXPLAIN (ANALYZE, BUFFERS)`:

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE)
SELECT c.name, sum(o.amount) AS total_spent
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE c.signup_date > '2026-01-01'
GROUP BY c.name;
```

### Raw Plan Output Analysis

Analyzing a typical output block generated by the query:

```text
HashAggregate  (cost=6410.12..6422.45 rows=1224 width=40) (actual time=45.102..46.212 rows=1200 loops=1)
  Group Key: c.name
  Batches: 1  Memory Usage: 321kB
  Buffers: shared hit=4210 read=102
  ->  Hash Join  (cost=1202.15..5810.10 rows=80003 width=40) (actual time=10.201..38.452 rows=79800 loops=1)
        Hash Cond: (o.customer_id = c.customer_id)
        Buffers: shared hit=4210 read=102
        ->  Seq Scan on orders o  (cost=0.00..3812.00 rows=300000 width=14) (actual time=0.015..15.402 rows=300000 loops=1)
              Buffers: shared hit=2110
        ->  Hash  (cost=1102.10..1102.10 rows=10000 width=34) (actual time=10.102..10.102 rows=10020 loops=1)
              Buckets: 16384  Batches: 1  Memory Usage: 890kB
              Buffers: shared hit=2100 read=102
              ->  Bitmap Heap Scan on customers c  (cost=204.10..1102.10 rows=10000 width=34) (actual time=1.450..8.212 rows=10020 loops=1)
                    Recheck Cond: (signup_date > '2026-01-01'::date)
                    Heap Blocks: exact=2002
                    Buffers: shared hit=2100 read=102
                    ->  Bitmap Index Scan on idx_customers_signup_date  (cost=0.00..201.10 rows=10000 width=0) (actual time=0.812..0.812 rows=10020 loops=1)
                          Index Cond: (signup_date > '2026-01-01'::date)
                          Buffers: shared hit=98 read=102
```

### Step-by-Step Execution Plan Decomposition

Read execution plans from the bottom-up, starting from the deepest indented nodes:

1. **Bitmap Index Scan (`idx_customers_signup_date`):** Postgres queries the index to find pointers matching `signup_date > '2026-01-01'`. It reads 98 index pages from the shared buffers and 102 pages from physical disk (`read=102`).
2. **Bitmap Heap Scan (`customers c`):** Using the memory bitmap generated in step 1, Postgres accesses the matching customer heap blocks. The `Heap Blocks: exact=2002` confirms all rows reside in the page map, verifying no bitmap loss occurred.
3. **Hash Creation:** The executor places the 10,020 returned customer records into an in-memory hash map (`Hash`), occupying 890KB of RAM within a single batch.
4. **Sequential Scan (`orders o`):** Because the query requests almost the entire order dataset, the planner skips the index on `orders.customer_id` and runs a highly efficient `Seq Scan` to pull all 300,000 order rows, reading 2,110 disk blocks in 15.4 milliseconds.
5. **Hash Join:** The executor streams the sequential order rows, hashes their `customer_id` values, and performs immediate lookups against the customer hash table to complete the join in 38.45 milliseconds.
6. **HashAggregate:** Postgres groups the results by `c.name` using an in-memory aggregation map, yielding the final 1,200 unique records.

### Critical Performance Indicators

When analyzing your query plans, always verify:
* **Cost vs. Actual Time:** Look for nodes with extremely high relative execution times (`actual time`).
* **Row Count Discrepancies:** If the estimated rows (`rows=10000`) differ significantly from the actual rows (`rows=10020`), your database statistics are stale. Run `ANALYZE` to refresh them.
* **Shared Buffers (`Buffers`):** High read blocks (`read=...`) represent slow disk access. High hit blocks (`hit=...`) represent fast RAM cache access. Optimize indexes to maximize the hit-to-read ratio.
* **Disk Spills:** If Hash Joins or Aggregates show `Batches: >1` or indicate "Disk Spill", the operation exceeded `work_mem`. Increase `work_mem` in `postgresql.conf` to force execution entirely in ultra-fast RAM.
