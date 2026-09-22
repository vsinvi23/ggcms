---
title: "Database Indexing Internals: B-Trees, Hash Indexes, and Query Optimization in PostgreSQL"
description: "Explore the byte-level storage layouts, search mechanics, and algorithmic performance of B-Trees and Hash indexes, and learn how to profile and optimize queries in PostgreSQL with EXPLAIN ANALYZE."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "b-tree"
  - "hash-index"
  - "explain-analyze"
  - "composite-index"
  - "index-bloat"
---

# Database Indexing Internals: B-Trees, Hash Indexes, and Query Optimization in PostgreSQL

## What We Are Going to Learn

In this deep-dive guide, we will step inside the database engine to understand how indexes accelerate data retrieval.

Specifically, we will cover:

1. **The performance bottlenecks of Full Table Scans** and the physical cost of random disk I/O.
2. **The storage architecture of B-Tree Indexes**, analyzing why they are preferred over Binary Search Trees for disk-based storage.
3. **The difference between B-Trees and Hash Indexes** and when to apply each.
4. **Hands-on SQL profiling** using `EXPLAIN ANALYZE` to optimize slow queries, index composite columns, and mitigate the cost of write performance.

## The Problem: The Algorithmic Nightmare of Sequential Scans

When a relational database table is created, rows (tuples) are stored on disk in contiguous 8KB storage blocks (pages) called the **Heap**. By default, rows are inserted into the heap in the order they arrive, with no specific sorting.

If you query a table for a specific row without an index:

```sql
SELECT * FROM orders WHERE customer_id = 'usr_9983';
```

The database engine has no choice but to perform a **Sequential Scan** (Full Table Scan). It must read **every single page** from disk into memory, parsing every row from first to last to find matches.

```text
       [ Heap Storage Page 1 ] ---> [ Heap Storage Page 2 ] ---> ... ---> [ Heap Storage Page 1,000,000 ]
```

### The Performance Cost

As your table grows, the performance characteristics degrade exponentially:

- **Time Complexity:** O(N) linear scan cost. Finding a row in a table of 100,000,000 records requires 100,000,000 checks.
- **Disk I/O Bottleneck:** Disk reads are measured in milliseconds, while CPU cycles are measured in nanoseconds. Forcing the operating system to pull gigabytes of raw data from solid-state drives (SSDs) or hard disks into the database buffer cache exhausts disk channels and causes API endpoints to time out.

## Why the Problem Is Hard: Binary Trees Fail on Physical Disks

Why not use standard **Binary Search Trees (BST)** or **Red-Black Trees** (which have O(log N) search complexity) to index database rows?

While BSTs work beautifully in RAM, they fail on physical disks:

1. **Bad Cache Locality:** Binary trees have a "fan-out" (number of children per node) of exactly 2. To store 1,000,000 rows, a binary tree requires a depth of approximately log2(1,000,000) ≈ 20 levels.
2. **Excessive Disk Seeks:** In disk storage, each node of a tree is stored in a different physical disk block. Traversing 20 levels in a binary tree requires making **20 distinct, random disk reads (seeks)**. Even on modern SSDs, making 20 random reads per lookup severely limits throughput.

```text
                       O   (Root Node)
                      / \
                     O   O   (Level 1)
                    / \ / \
                   O  O O  O (Level 2 - Deep and narrow!)
```

## A Simple Mental Model: The Index at the Back of the Textbook

Think of database indexing like finding information in a 1,000-page textbook:

```text
                            Relational Table (The Book)
                                        |
                =================================================
                |                                               |
         [ Sequential Scan ]                             [ Index Scan ]
                |                                               |
   You flip through every single page             You flip to the "Index" at the back.
   of the book, reading every word,               You search alphabetically for your
   until you find the term "TLS 1.3"              keyword, read the exact page number (Pointer),
   (Takes hours).                                 and open straight to page 412 (Takes seconds).
```

- **The Index** is small, highly structured, and sorted.
- Searching the index is fast because it is ordered.
- The index does not contain the complete information; it merely contains a **pointer** (Page Number) to where the actual data resides in the main body (the Heap).

## Under the Hood: B-Tree Storage Architecture

Relational databases solve the disk-I/O bottleneck using **B-Trees (Balanced Trees)**, specifically the **B+ Tree** variant.

A B-Tree is a self-balancing, multi-way search tree. Unlike a binary tree, a B-Tree has a high **fan-out** (typically 100 to 400 keys per node/page).

```text
                            [ Root Page ]
                           /     |     \
               [ Internal Page ] ... [ Internal Page ]
               /       |       \     /        |       \
          [ Leaf ]  [ Leaf ]  [ Leaf ]   [ Leaf ]  [ Leaf ]
             |          |        |          |         |
             v          v        v          v         v
             Heap Tuples (Pointers to raw database rows)
```

### Structural Properties of B+ Trees

1. **High Fan-Out / Low Height:** Because each page can hold hundreds of keys, a B-Tree indexing 100,000,000 rows has a height of only **3 or 4 levels**. Finding any row requires at most **4 disk reads**, compared to 20 or more for a binary tree.
2. **Page Contiguity:** Nodes correspond directly to standard 8KB disk pages.
3. **Leaf Linkage:** In a B+ Tree, all data pointers reside exclusively in the **Leaf Pages** (the bottom-most level). Furthermore, leaf pages are linked together as a doubly linked list. This allows the database to perform range queries (e.g., `WHERE age BETWEEN 20 AND 30`) with extreme efficiency: the engine traverses down to the first leaf node and then scans horizontally across the linked leaf nodes, avoiding tree re-traversals.

## B-Trees vs. Hash Indexes

PostgreSQL supports multiple index types, but B-Trees and Hash indexes are the most common:

| Property | B-Tree Index | Hash Index |
| :--- | :--- | :--- |
| **Data Structure** | Multi-way Balanced Tree | Hash Table (Buckets) |
| **Search Complexity** | O(log N) | O(1) constant time |
| **Supported Operators** | `<`, `<=`, `=`, `>=`, `>`, `BETWEEN`, `LIKE 'prefix%'` | Only `=` (Equality) |
| **Sorting** | Yes (returns sorted data automatically) | No |
| **Range Queries** | Highly optimized | Unsupported |
| **Storage Size** | Compact | Can be very large (requires bucket padding) |

### When to Use a Hash Index

Use a Hash index *only* if you are performing strict equality lookups (e.g., UUID or token matches) and never need to sort the data or query ranges. For over 95% of use cases, **B-Tree is the correct default**.

## Hands-On SQL: Query Profiling and Optimization

Let's write a standard SQL sequence in PostgreSQL to observe the physical impact of indexing on execution performance.

### 1. Setting Up the Test Table (1,000,000 Rows)

We will create an `orders` table and populate it with 1,000,000 rows of mock data:

```sql
-- Create Table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    order_date TIMESTAMP NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL
);

-- Insert 1,000,000 rows of mock data
INSERT INTO orders (customer_id, order_date, amount, status)
SELECT
    'cust_' || (1 + (random() * 50000)::INT) AS customer_id,
    NOW() - (random() * 365 || ' days')::INTERVAL AS order_date,
    (random() * 1000)::NUMERIC(10,2) AS amount,
    (ARRAY['pending', 'completed', 'shipped', 'cancelled'])[1 + (random() * 3)::INT] AS status
FROM generate_series(1, 1000000);
```

### 2. Profiling a Query with No Index (Sequential Scan)

Let's search for orders placed by `cust_25413` and profile its execution:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 'cust_25413';
```

#### Output Analysis

The database returns:

```text
Query Plan:
->  Seq Scan on orders  (cost=0.00..20834.00 rows=20 width=45) (actual time=0.045..54.120 rows=21 loops=1)
      Filter: ((customer_id)::text = 'cust_25413'::text)
      Rows Removed by Filter: 999979
Planning Time: 0.082 ms
Execution Time: 54.142 ms
```

- **Seq Scan:** The database engine spent **54.14 milliseconds** scanning through all 1,000,000 rows, discarding 999,979 rows that did not match.

### 3. Creating a B-Tree Index and Re-Profiling

Let's add a B-Tree index on `customer_id` and re-run the exact same query:

```sql
-- Create the Index
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Profile again
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 'cust_25413';
```

#### Output Analysis

The plan changes completely:

```text
Query Plan:
->  Index Scan using idx_orders_customer_id on orders  (cost=0.42..8.44 rows=20 width=45) (actual time=0.021..0.054 rows=21 loops=1)
      Index Cond: ((customer_id)::text = 'cust_25413'::text)
Planning Time: 0.120 ms
Execution Time: 0.072 ms
```

- **Index Scan:** The execution time dropped from **54.14 ms** to **0.072 ms** — a performance speedup of **750x**!
- Instead of scanning the entire heap, the database quickly traversed the B-Tree index in a few microseconds, extracted the exact heap tuple pointers, and fetched the 21 matching rows directly.

### 4. Composite Indexes and the Leftmost Prefix Rule

What happens if we query based on multiple columns?

```sql
SELECT * FROM orders WHERE customer_id = 'cust_25413' AND status = 'completed';
```

If we have separate indexes on `customer_id` and `status`, the database must perform a complex bitmap index merge. Instead, we should create a **Composite Index (Multi-column Index)**:

```sql
CREATE INDEX idx_orders_cust_status ON orders(customer_id, status);
```

#### The Leftmost Prefix Rule

When using a composite index on `(col1, col2)`, the index is sorted primarily by `col1` and secondarily by `col2`.

- This index can optimize queries targeting `col1` AND `col2`.
- It can optimize queries targeting `col1` alone.
- **It CANNOT optimize queries targeting `col2` alone.**

```text
Sorted Index Layout:
[ cust_101, completed ]
[ cust_101, pending   ]
[ cust_102, completed ]  <--- Sorted primarily by customer_id!
```

## Expert Insight: The Write Penalty and Index Bloat

While indexes speed up read queries, they introduce a **Write Penalty**:

- Every time you execute an `INSERT`, `UPDATE`, or `DELETE`, the database must not only update the Heap page but also navigate and modify the corresponding nodes inside the B-Tree index to keep the data sorted.
- Adding too many indexes on a table will severely degrade write performance.

### Index Bloat in PostgreSQL (MVCC Side-Effect)

PostgreSQL uses Multi-Version Concurrency Control (MVCC) to handle transactions. When you execute an `UPDATE` on a row, PostgreSQL does not modify the data in-place. Instead, it marks the old row as dead, and inserts a **completely new row (version)** into the Heap page.

- This requires adding a new entry to your B-Tree index.
- The old index pointer becomes "dead" but continues to consume storage.
- If your table has high write activity, your indexes can experience **Index Bloat** (consuming gigabytes of empty disk space, reducing cache efficiency).
- **Mitigation:** Use the PostgreSQL `VACUUM` command or execute `REINDEX INDEX idx_name;` to rebuild bloated indexes contiguously on disk in production.

## Common Misconceptions

### Misconception 1: "Adding an index on every column is a safe way to optimize database performance."

**Reality:** This is a performance anti-pattern. Every index consumes memory and storage, slows down `INSERT`/`UPDATE` operations, and can confuse the query optimizer into choosing sub-optimal execution paths. You should index only columns frequently targeted in `WHERE`, `JOIN`, `ORDER BY`, or `GROUP BY` clauses.

### Misconception 2: "If my query has an index, the database will always use it."

**Reality:** The database engine uses a cost-based optimizer. If you query a table and your filter matches more than 15-20% of the total rows (e.g., `WHERE status = 'active'` in a table where almost all rows are active), the optimizer will bypass the index and perform a Sequential Scan because random I/O via index pointers is more expensive than sequential streaming.

## Pause and Think

> **Critical Question:** If you have an index on `idx_orders_date` (`order_date`), why will the query `SELECT * FROM orders WHERE EXTRACT(YEAR FROM order_date) = 2026` bypass the index and run a full table scan?

### Answer

Because the filter applies a function (`EXTRACT`) to the indexed column.

The B-Tree index stores the raw values of `order_date`, not the results of the function. To resolve this, you must either query using raw range bounds (`WHERE order_date >= '2026-01-01' AND order_date < '2027-01-01'`) or create a specialized **Expression Index (Functional Index)**:

```sql
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM order_date));
```

## Key Takeaways

- **Sequential scans have O(N) complexity** and trigger high disk I/O, which degrades performance as tables scale.
- **B-Trees are multi-way search trees** optimized for disk storage due to high fan-out, low height, and leaf-node linkage.
- **Composite indexes** must follow the leftmost prefix rule to be utilized by the query planner.
- **MVCC causes index bloat** in high-update environments, which requires routine rebuilding via `REINDEX` or `VACUUM`.

## What to Learn Next

To expand your database and storage engineering expertise, explore:

- PostgreSQL Partial Indexes (`CREATE INDEX ... WHERE status = 'active'`) to save storage.
- PostgreSQL Covering Indexes (`CREATE INDEX ... INCLUDE (col3)`) to prevent heap lookups entirely.
- The architecture of LSM (Log-Structured Merge-tree) databases like Cassandra or RocksDB for write-heavy workloads.
