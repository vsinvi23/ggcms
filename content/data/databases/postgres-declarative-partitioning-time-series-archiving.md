---
title: "Postgres Declarative Partitioning for Fast Time-Series Archiving"
description: "How to use PostgreSQL declarative range partitioning, partition pruning, and DETACH PARTITION to purge time-series data instantly without the table bloat, WAL explosion, and locking that a mass DELETE causes."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "postgresql"
  - "table-partitioning"
  - "declarative-partitioning"
  - "time-series"
  - "data-retention"
  - "partition-pruning"
---

# Postgres Declarative Partitioning for Fast Time-Series Archiving

A logging platform ingests millions of rows a day into an `event_logs` table and enforces a 90-day retention policy. The obvious approach — `DELETE FROM event_logs WHERE created_at < NOW() - INTERVAL '90 days';` — looks simple, but in PostgreSQL it is an operational hazard: it can run for hours, spike WAL volume, and hold locks that stall the exact writes the ingestion pipeline depends on. Declarative partitioning turns this monthly cleanup into a millisecond metadata operation instead.

## The Administrative Nightmare of Massive Time-Series Deletes

In high-volume applications like log collection or IoT time-series tracking, datasets grow by millions of rows daily. To stay within storage limits and control costs, organizations enforce retention policies such as "keep only the last 90 days."

A naive bulk delete introduces serious problems:

- **Table bloat and dead tuples.** Under Postgres MVCC, `DELETE` does not immediately free disk space — it marks deleted rows as dead tuples, triggering intensive autovacuum runs and disk I/O bottlenecks.
- **WAL explosion.** Delete operations write every deleted row's metadata to the WAL, spiking disk usage and replication lag.
- **Exclusive locking.** A large delete acquires extensive row-level locks, blocking incoming writes and reads on the table.

## Mental Model: Range-Based Physical Sub-Tables

PostgreSQL declarative partitioning splits one logical table into distinct, independent physical child tables based on a partitioning key — such as date ranges.

```text
                             +------------------------+
                             |   Parent: logs table   |
                             +------------------------+
                                         |
               +-------------------------+-------------------------+
               | (Routes queries and inserts automatically)        |
               v                                                   v
+-----------------------------+                     +-----------------------------+
| Child: logs_y2026_m04       |                     | Child: logs_y2026_m03       |
| (Active inserts & queries)  |                     | (Old data to be archived)   |
+-----------------------------+                     +-----------------------------+
                                                                   |
                                                      1. DETACH    v
                                                    +-----------------------------+
                                                    | Orphaned table (Safe to     |
                                                    | DROP or PG_DUMP offline)    |
                                                    +-----------------------------+
```

Instead of a row-by-row deletion, archiving historical data becomes a fast metadata update: detach the child partition, then drop it.

## Deep Partitioning and Pruning Internals

Two architectural features do the heavy lifting on a partitioned table.

### 1. Dynamic routing

When rows are inserted into the parent table, Postgres evaluates the partition key and routes the row directly to the appropriate child table. This routing is transparent to the application — inserts still target the parent table name.

### 2. Partition pruning

The query optimizer analyzes the `WHERE` clauses of incoming read queries. If a query requests data only within a specific date range, Postgres excludes every child table that cannot contain those dates from the scan — reducing index and heap scans and improving query performance without any application-side awareness of partitioning.

### Bypassing locks and bloat via detach

To archive a month of data:

1. **Detach.** The administrator detaches the partition from the parent: `ALTER TABLE parent DETACH PARTITION child;`. This acquires only a brief `AccessExclusiveLock` on the parent to update catalog metadata — it executes in milliseconds, bypassing row-level locks entirely and generating no bloat.
2. **Drop or archive.** Once detached, the child table is an ordinary, independent table. Back it up offline with `pg_dump`, or drop it instantly with `DROP TABLE child;`. Dropping releases disk space to the OS immediately, with zero WAL overhead for individual row deletions.

## Schema Configuration and Operations

```sql
-- 1. Create the partition parent table
CREATE TABLE event_logs (
    id BIGSERIAL,
    event_time TIMESTAMP NOT NULL,
    payload TEXT,
    PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

-- 2. Create the physical child partitions for March and April 2026
CREATE TABLE event_logs_y2026_m03 PARTITION OF event_logs
    FOR VALUES FROM ('2026-03-01 00:00:00') TO ('2026-04-01 00:00:00');

CREATE TABLE event_logs_y2026_m04 PARTITION OF event_logs
    FOR VALUES FROM ('2026-04-01 00:00:00') TO ('2026-05-01 00:00:00');

-- 3. Detach the expired partition (executed monthly)
-- This updates system metadata instantly with no row deletes
ALTER TABLE event_logs DETACH PARTITION event_logs_y2026_m03;

-- 4. Drop the detached table to reclaim disk space instantly
DROP TABLE event_logs_y2026_m03;
```

A scheduled job creates next month's partition ahead of time and detaches (and optionally archives via `pg_dump`) the oldest partition on the same cadence, keeping the retention window rolling automatically.

## Key Takeaways

- A mass `DELETE` on a time-series table triggers dead-tuple bloat, WAL growth, and blocking locks — all avoidable with partitioning.
- Declarative range partitioning routes inserts to the correct child table transparently and lets the planner prune irrelevant partitions from reads.
- `DETACH PARTITION` followed by `DROP TABLE` reclaims disk space in milliseconds with none of the bloat or lock contention of row-by-row deletion.
- Pre-create future partitions and detach expired ones on the same schedule to keep a rolling retention window fully automated.
