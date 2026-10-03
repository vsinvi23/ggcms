---
title: "Tuning PostgreSQL Autovacuum for High-Write Microservice Tables"
description: "How PostgreSQL's cost-based vacuum delay engine and maintenance_work_mem interact under high-write workloads, and how to surgically tune per-table autovacuum settings to stop queue and session tables from bloating."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "postgresql"
  - "autovacuum"
  - "vacuum-tuning"
  - "table-bloat"
  - "maintenance-work-mem"
  - "database-administration"
---

# Tuning PostgreSQL Autovacuum for High-Write Microservice Tables

A `job_queue` table backing a background-task microservice handles 50,000 updates per hour: rows are inserted, claimed, marked processing, then marked done, over and over. Within weeks it has swollen from a few megabytes to tens of gigabytes, index scans against it are timing out, and `last_autovacuum` in `pg_stat_all_tables` shows autovacuum barely runs on it. The default autovacuum settings, tuned for typical low-write tables, are not aggressive enough for a table this hot — and understanding why requires looking at Postgres's cost-based vacuum engine directly.

## The Problem: The High-Write Table Bloat Spiral

As covered in the MVCC fundamentals, PostgreSQL writes a new physical tuple on every `UPDATE` and marks deleted tuples invisible on `DELETE`, leaving behind dead tuples. Under standard workloads, background autovacuum cleans these up smoothly. But in high-volume microservices — tables managing sessions, state queues, or background tasks — thousands of updates run every minute, and default settings fall behind:

- Autovacuum triggers too late because default thresholds are calibrated for small, low-write tables.
- Tables swell from megabytes to hundreds of gigabytes of dead space.
- Indices bloat too, forcing scans to traverse massive fragmented structures.
- RAM caches fill with dead data, pushing active rows out of cache and stalling application queries.

## Why the Problem Is Hard: Slow, Disk-Intensive Cleaning Cycles

Postgres cannot simply vacuum continuously on every table, because vacuuming is resource-intensive: it must scan every page containing dead tuples, walk the table's indexes to clear pointers to those dead tuples, and write modified page structures back to disk. Too aggressive, and autovacuum consumes all available disk IOPS, starving application queries. Too conservative, and bloat expands until the database runs out of disk.

## A Simple Mental Model: The Overburdened Janitor

```text
      DEFAULT SETTINGS (Trash Piles Up)              TUNED SETTINGS (Aggressive Sweep)
==============================================   ========================================
   [ Busy Trains ] ──► (Generates Litter)          [ Busy Trains ] ──► (Generates Litter)
          │                                               │
          ▼                                               ▼
   ┌────────────────────────────────────────┐      ┌────────────────────────────────────┐
   │ Janitor sweeps ONLY when station is    │      │ Janitor sweeps every time 1,000    │
   │ 20% full of trash. (Too late!)         │      │ pieces of litter accumulate.       │
   ├────────────────────────────────────────┤      ├────────────────────────────────────┤
   │ Broom size is tiny (low memory).       │      │ Broom size is huge (high memory),  │
   │ Janitor takes long breaks (delays).    │      │ sweeping is continuous & fast.     │
   └────────────────────────────────────────┘      └────────────────────────────────────┘
```

The **sweep trigger** is the scale factor: under default settings, the janitor only sweeps once 20% of the station is covered in trash — for a huge table, that means months of pile-up before a sweep. The **broom size** is `maintenance_work_mem`: a tiny dustpan means dozens of slow, repetitive trips.

## Under the Hood: MVCC Dead Tuples and the Cost of Autovacuum

Postgres enforces a **cost-based vacuum delay** engine. Every operation a vacuum worker performs has an associated cost, in credits:

- **`vacuum_cost_page_hit`** (default: 1) — cost of reading a page already in shared-buffer cache.
- **`vacuum_cost_page_miss`** (default: 2) — cost of fetching a page from disk.
- **`vacuum_cost_page_dirty`** (default: 20) — cost of writing a modified (cleaned) page back to disk.

The worker accumulates these costs. Once the accumulated cost hits `autovacuum_vacuum_cost_limit` (default: 200), the worker suspends and sleeps for `autovacuum_vacuum_cost_delay` (default: 2ms in modern versions) before resuming.

### The memory bottleneck: `maintenance_work_mem`

During a vacuum cycle, Postgres scans pages and accumulates the physical addresses (TIDs) of dead tuples in RAM, in an array bounded by `maintenance_work_mem`. Each dead-tuple address needs 6 bytes. At `64MB`, the array holds roughly 11 million pointers. If a bloated table contains 50 million dead tuples, the vacuum worker must stop mid-scan, clean up the indexes for the first 11 million, flush, and resume — forcing multiple slow index scans in a single vacuum run.

## The Solution: Surgical Autovacuum Tuning for Microservices

Optimizing Postgres for high-write loads means adjusting both global memory allocations and table-level autovacuum limits.

### 1. Global server-wide tuning (`postgresql.conf`)

- **Increase `maintenance_work_mem`** — allocate significant memory (512MB–2GB depending on system RAM) so vacuum workers can process all dead tuples of your largest table in a single pass.
- **Increase the cost limit** — raise `autovacuum_vacuum_cost_limit` to 1000–2000 so workers can perform more physical I/O before sleeping.

### 2. Table-level surgical tuning

Rather than making the entire server's autovacuum aggressive (risking CPU overload), target specific high-write tables:

- **Lower `autovacuum_vacuum_scale_factor`** — default `0.2` means a 10-million-row table needs 2 million modified rows before a vacuum. Lower to `0.05` or `0.01`.
- **Lower `autovacuum_vacuum_threshold`** — set a base threshold (e.g. 1000 modifications) to trigger cleanups on smaller tables too.

## Hands-On Administration: Monitoring and Tuning

### Monitor dead-tuple counts and autovacuum history

```sql
SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS active_rows,
    n_dead_tup AS dead_tuples,
    -- Ratio of dead tuples to live rows
    ROUND(100.0 * n_dead_tup / NULLIF(n_dead_tup + n_live_tup, 0), 2) AS bloat_ratio,
    last_vacuum,
    last_autovacuum
FROM pg_stat_all_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

### Dynamically tune a high-write queue table

```sql
-- Make autovacuum highly aggressive ONLY on the job_queue table
ALTER TABLE job_queue SET (
    autovacuum_vacuum_scale_factor = 0.02,     -- Trigger when 2% of rows are dead
    autovacuum_vacuum_threshold = 500,         -- Base threshold of 500 dead rows
    autovacuum_vacuum_cost_limit = 2000,       -- Double the physical I/O throughput
    autovacuum_vacuum_cost_delay = 2           -- Sleep for only 2ms when cost limit is hit
);
```

Verify the table-level overrides applied:

```sql
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'job_queue';
```

## Common Misconceptions

**"Adding more autovacuum workers always speeds up vacuum operations."** `autovacuum_vacuum_cost_limit` is **shared** across all active workers. With 3 workers on default settings, the 200-credit limit is split roughly three ways — around 66 credits each before sleeping. Raising `autovacuum_max_workers` from 3 to 8 without also raising `autovacuum_vacuum_cost_limit` makes each worker sleep more often, actually **slowing down** server-wide vacuum throughput.

**"Executing standard VACUUM releases physical disk space back to the OS."** Standard `VACUUM` only marks dead-tuple space as reusable; the file size on disk stays exactly the same. To physically shrink files and return space to the OS, run `VACUUM FULL` (which locks the table completely) or use a zero-lock tool like `pg_repack`.

## Pause and Think

**Question:** why does a long-running, active `SELECT` in an open transaction block autovacuum from cleaning up newly created dead tuples on *unrelated* tables in the same database?

**Answer:** Autovacuum can only clean dead tuples older than the oldest active transaction ID (the `xmin` horizon). Even if that transaction only reads Table A, its open state prevents the engine from advancing the global transaction safety horizon — so dead tuples created on Table B during that window must be retained too, producing unexpected bloat database-wide.

## Key Takeaways

- Dead tuples accumulate from MVCC's copy-on-write semantics during `UPDATE`/`DELETE`.
- Autovacuum is resource-bounded by a cost-credit system to protect SSD performance.
- Insufficient `maintenance_work_mem` forces multiple index scans within a single vacuum cycle.
- Tune autovacuum scale factors per table for hot transactional queue tables rather than raising global aggressiveness.
- Avoid long-running open transactions — they stall the visibility horizon for the whole database, not just the tables they touch.
