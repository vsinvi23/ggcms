# Reading Postgres Query Plans: Hash Joins, Nested Loops, and Bitmap Heap Scans

### The Problem: Guessing at Performance

When a PostgreSQL query takes 30 seconds to execute, developers often resort to blind optimizations. They slap indexes on random columns, rewrite subqueries, and hope for the best. 

PostgreSQL does not execute SQL directly. The SQL string is merely a request. The PostgreSQL query planner analyzes the request, estimates the data size, and generates a mathematical graph of execution strategies. If a query is slow, it is because the planner chose a suboptimal strategy—usually due to missing indexes or outdated table statistics. 

To fix a query, you must stop guessing and read the exact physical execution plan the database constructed.

### The Mental Model: EXPLAIN ANALYZE

You interact with the query planner using the `EXPLAIN` command. Prepending `EXPLAIN` to a query shows the planner's *estimates*. 

Prepending `EXPLAIN ANALYZE` actually executes the query, showing both the estimates and the *actual* execution time and row counts. 

```sql
EXPLAIN ANALYZE 
SELECT * FROM users u 
JOIN orders o ON u.id = o.user_id 
WHERE u.status = 'active';
```

**How to Read a Plan:**
Query plans are structured as a tree of nodes. You must read them from the **bottom-up, inside-out**. The most indented nodes at the bottom are executed first. Their output feeds up into the parent nodes.

### Deconstructing Scan Strategies

At the bottom of every plan are Scan Nodes. This is how Postgres retrieves data from disk.

#### 1. Sequential Scan (`Seq Scan`)
The database reads the entire table from disk, block by block, inspecting every row against the `WHERE` clause. 
*   **When it's bad:** Scanning a 10-million row table to find 5 rows is catastrophic. You need an index.
*   **When it's good:** If your query requires 80% of the table, a Seq Scan is actually faster than an Index Scan because it avoids random disk I/O.

#### 2. Index Scan (`Index Scan`)
The database traverses a B-Tree index to find the exact disk block pointer, then fetches the actual row from the heap (the table file). Highly efficient for retrieving a tiny fraction of rows.

#### 3. Bitmap Heap Scan (`Bitmap Index Scan` -> `Bitmap Heap Scan`)
This is the planner's compromise. If an Index Scan returns a large number of rows (e.g., 50,000), fetching each row individually from the heap causes massive random I/O. 
Instead, Postgres builds an in-memory Bitmap using the index. It sorts the physical block addresses in memory, and then visits the heap sequentially (`Bitmap Heap Scan`). It turns random I/O into fast sequential I/O.

### Deconstructing Join Strategies

When combining tables, the planner chooses between three primary join algorithms based on row volume.

#### 1. Nested Loop Join (`Nested Loop`)
PostgreSQL takes the first row from Table A, and scans Table B for a match. It repeats this for every row in Table A.
*   **Algorithm:** `O(N * M)` complexity.
*   **When it's used:** Excellent if Table A is very small (e.g., 10 rows) and Table B is indexed.
*   **When it fails:** If Table A has 10,000 rows, Table B will be scanned 10,000 times. If this shows up on large datasets, you are missing a join index.

#### 2. Hash Join (`Hash Join`)
PostgreSQL loads the entirety of the smaller table into an in-memory Hash Table (`Hash`). It then scans the larger table sequentially, hashing the join key of each row and probing the Hash Table for a match.
*   **Algorithm:** `O(N + M)` complexity.
*   **When it's used:** The go-to standard for joining large, unsorted datasets. Extremely fast.
*   **When it fails:** If the smaller table is too large to fit in `work_mem`, Postgres spills the Hash Table to disk (a "Batched Hash Join"), causing severe I/O slowdowns.

#### 3. Merge Join (`Merge Join`)
Both tables must be sorted on the join key first (`Sort`). Once sorted, Postgres zips the two tables together in a single pass. 
*   **When it's used:** Optimal for joining two massive datasets that exceed memory limits, especially if the data is already sorted by a B-Tree index.

### Diagnosing the Root Cause

When analyzing a plan, look for two massive red flags:

1.  **Row Count Discrepancies:** Look at `rows=100` (the estimate) vs `actual time=.. rows=500000` (the reality). If the planner underestimated by a factor of 5000, it chose the wrong strategy (e.g., opting for a Nested Loop instead of a Hash Join). The fix is to run `ANALYZE table_name;` to update the planner's statistical sampling.
2.  **Costly Nodes:** Look for nodes with massive `actual time` metrics. If a `Seq Scan` is taking 20,000ms, apply a targeted index.

By understanding how Postgres navigates indexes and marries tables, you can transition from guessing at optimizations to engineering precise, targeted solutions.