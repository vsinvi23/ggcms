# Postgres Declarative Partitioning: Archiving Time-Series Data Fast and Bypassing DELETE Locks

## The Administrative Nightmare of Massive Time-Series Deletes
In high-volume applications like log collection or IoT time-series tracking, datasets grow by millions of rows daily. To stay within storage limits and control database costs, organizations enforce retention policies, such as retaining only the last 90 days of data.

Executing a standard delete query to purge expired records introduces serious administrative challenges:
`DELETE FROM logs WHERE created_at < NOW() - INTERVAL '90 days';`

In PostgreSQL, this simple statement is highly problematic:
- **Table Bloat and Dead Tuples**: Under Postgres MVCC, a `DELETE` does not immediately free disk space. It marks deleted rows as dead tuples. This triggers intensive autovacuum runs that cause severe disk I/O bottlenecks.
- **Write-Ahead Log (WAL) Explosion**: Delete operations must write every deleted row's metadata to the WAL, causing disk space spikes and replication delays.
- **Exclusive Locking**: A large delete query acquires extensive row-level locks on the table, blocking incoming writes and reads.

## Mental Model: Range-Based Physical Sub-Tables
PostgreSQL Declarative Partitioning solves this problem by splitting a single logical table into distinct, independent physical child tables based on a partitioning key (such as date ranges). 

```
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

Instead of running a row-by-row deletion, archiving historical data becomes a fast metadata update.

## Deep Partitioning and Pruning Internals
When a query executes against a partition-active table, PostgreSQL leverages two primary architectural features:

### 1. Dynamic Routing
When rows are inserted into the parent table, Postgres evaluates the partition key and routes the row directly to the appropriate child table. This routing is transparent to the application.

### 2. Partition Pruning
The query optimizer analyzes the `WHERE` clauses of incoming read queries. If a query requests data only for a specific date range, Postgres excludes all child tables that cannot contain those dates. This process, called Partition Pruning, reduces index and heap scans, improving query performance.

### Bypassing Locks and Bloat via Detach
To archive a month of data using declarative partitioning:
1. **Detach**: The administrator detaches the partition from the parent: `ALTER TABLE parent DETACH PARTITION child;`. This acquires a brief `AccessExclusiveLock` on the parent to update catalog metadata. It executes in milliseconds, bypassing row-level locks and avoiding table bloat.
2. **Drop / Archive**: Once detached, the child table is an ordinary, independent table. You can back it up using `pg_dump` offline or drop it instantly via `DROP TABLE child;`. Dropping the table releases disk space to the OS immediately, with zero WAL overhead for individual row deletions.

## Schema Configuration and Operations
The SQL script below demonstrates declarative range partitioning, table creation, and the detach-to-drop workflow:

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

-- 3. Detach the expired partition (Executed monthly)
-- This updates system metadata instantly with no row deletes
ALTER TABLE event_logs DETACH PARTITION event_logs_y2026_m03;

-- 4. Drop the detached table to reclaim disk space instantly
DROP TABLE event_logs_y2026_m03;
```

Using this approach, databases can scale time-series storage horizontally while keeping CPU and disk usage predictable during maintenance windows.
