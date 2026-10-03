---
title: "Reading Postgres Query Plans: Scans, Joins, and EXPLAIN ANALYZE"
description: "How to read a Postgres EXPLAIN ANALYZE plan bottom-up, what each scan and join node means physically, and a full worked example diagnosing a Hash Join against Seq Scan and Bitmap Heap Scan nodes."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "explain-analyze"
  - "query-planner"
  - "query-optimization"
  - "indexing"
---

# Reading Postgres Query Plans: Scans, Joins, and EXPLAIN ANALYZE

## The Problem: Guessing at Performance

When a query takes 30 seconds, the reflex is to add indexes on random columns, rewrite subqueries, and hope. But Postgres doesn't execute SQL text directly — it's a *request*. The query planner analyzes it, estimates data volumes from table statistics, and builds a concrete execution plan: a tree of physical operations (scans, joins, aggregates) chosen to minimize estimated cost.

If a query is slow, the planner picked a suboptimal physical strategy — usually because of a missing index or stale statistics. Fixing it means reading the actual plan the database built, not guessing at the SQL text.

## EXPLAIN vs. EXPLAIN ANALYZE

`EXPLAIN` shows the planner's *estimates* without running the query. `EXPLAIN ANALYZE` actually executes it and reports both estimates and real execution time/row counts — essential, because estimate-vs-actual divergence is the single most useful diagnostic signal.

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE)
SELECT c.name, sum(o.amount) AS total_spent
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE c.signup_date > '2026-01-01'
GROUP BY c.name;
```

Plans are trees, printed with the most-indented nodes as leaves. **Read bottom-up, inside-out** — the deepest node executes first; its output feeds the parent node above it.

```text
                            [Hash Join] (Root Node)
                             /         \
                 [Hash Scan]             [Seq Scan] on customers (Outer Table)
                      |
        [Bitmap Heap Scan] on orders (Inner Table)
                      |
       [Bitmap Index Scan] on idx_orders_cust_id
```

## Scan Strategies

- **Sequential Scan (`Seq Scan`)**: reads every block of the table, checking each row against the filter. Bad when it's scanning millions of rows to find a handful — good when the query genuinely needs most of the table, since it avoids the random I/O an index would otherwise cause.
- **Index Scan (`Index Scan`)**: traverses a B-Tree to find matching entries, then fetches each matching row individually from the heap. Efficient for a small, highly selective result set; degrades if it has to fetch many rows individually (random I/O per row).
- **Index Only Scan**: if every selected column is already present in the index itself, and the visibility map confirms the rows are visible, Postgres never touches the heap at all — the fastest possible scan.
- **Bitmap Index Scan → Bitmap Heap Scan**: the planner's compromise for a moderately large result set. The Bitmap Index Scan builds an in-memory bitmap of matching page addresses from the index; the Bitmap Heap Scan then visits those pages in physical (sequential) order instead of index order — turning what would be scattered random I/O into a smaller number of sequential reads.

## Join Strategies

- **Nested Loop**: for every row in the outer table, scan the inner table for a match — `O(N*M)`. Excellent when the outer table is small and the inner table has a usable index on the join key. A Nested Loop showing up over large tables usually means a missing join index.
- **Hash Join**: builds an in-memory hash table from the smaller relation's join keys, then streams the larger relation, hashing and probing — `O(N+M)`. The default choice for large, unsorted joins. If the build side doesn't fit in `work_mem`, it spills to disk ("batched" hash join), which is much slower.
- **Merge Join**: both inputs must already be sorted on the join key (via an index or an explicit `Sort` node); Postgres then walks both in a single synchronized pass. Best for very large joins where a hash table wouldn't fit in memory, especially if the sort order is already available from an index.

## Worked Example: Full Plan Decomposition

Schema and data setup:

```sql
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

INSERT INTO customers (name, signup_date)
SELECT 'Customer ' || i, CURRENT_DATE - (random() * 365)::int
FROM generate_series(1, 50000) i;

INSERT INTO orders (customer_id, amount, order_date)
SELECT (random() * 49999 + 1)::int, (random() * 1000)::numeric(10,2), NOW() - (random() * 90)::interval
FROM generate_series(1, 300000) i;

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_customers_signup_date ON customers(signup_date);

ANALYZE customers;
ANALYZE orders;
```

Resulting plan for the query at the top of this article:

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

Reading bottom-up:

1. **Bitmap Index Scan** on `idx_customers_signup_date`: finds pointers matching `signup_date > '2026-01-01'`, reading 98 pages from shared buffers and 102 from disk.
2. **Bitmap Heap Scan** on `customers`: visits the matching heap pages using the bitmap from step 1. `Heap Blocks: exact=2002` confirms the bitmap didn't overflow into a lossy "recheck every row on the page" mode.
3. **Hash**: the 10,020 matching customer rows are loaded into an in-memory hash table (890KB, single batch — it fit in `work_mem`).
4. **Seq Scan** on `orders`: since the query effectively needs nearly the whole `orders` table, the planner skips the `customer_id` index and does a fast sequential scan of all 300,000 rows.
5. **Hash Join**: streams `orders` rows, hashes each `customer_id`, and probes the customer hash table built in step 3.
6. **HashAggregate**: groups the joined rows by `c.name` to produce the final 1,200-row result.

## Diagnosing the Root Cause

Two red flags to check every time:

1. **Row count discrepancies**: compare the planner's estimate (`rows=10000`) to the actual (`rows=10020`, or worse, a 100x-1000x gap). A large gap means the planner's statistics are stale — it likely picked the wrong join/scan strategy based on bad estimates. Fix: `ANALYZE table_name;` (or lower `default_statistics_target` sampling gaps if `ANALYZE` alone doesn't help on skewed columns).
2. **Buffers and disk spills**: `Buffers: shared hit=X read=Y` — high `read` values mean physical disk I/O, not cache hits; a low hit-to-read ratio across repeated runs of the same query usually means the working set doesn't fit in `shared_buffers`. `Batches: >1` on a Hash node, or an explicit disk-spill notice on a sort/aggregate, means the operation exceeded `work_mem` and fell back to disk — often fixable by raising `work_mem` for that session/query, if memory budget allows.

Understanding how Postgres physically retrieves and joins data turns query tuning from trial-and-error into a targeted fix: add the missing index, refresh stale statistics, or raise `work_mem` — instead of guessing.
