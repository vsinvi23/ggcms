---
title: "PostgreSQL WAL Internals: LSNs, Crash Recovery, and Physical Replication"
description: "How PostgreSQL's Write-Ahead Log turns durability into sequential I/O, how Log Sequence Numbers make crash recovery idempotent, and how the same WAL stream powers physical streaming replication with replication slots."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "write-ahead-log"
  - "wal"
  - "crash-recovery"
  - "streaming-replication"
  - "log-sequence-number"
---

# PostgreSQL WAL Internals: LSNs, Crash Recovery, and Physical Replication

A production Postgres primary loses power mid-transaction. On restart, every row that was committed a millisecond before the crash is still there — and a hot standby three availability zones away is only seconds behind. Neither of these guarantees comes from writing every change straight to the table files on disk; both come from the same append-only log: the Write-Ahead Log (WAL).

## The Problem: Storage I/O Bottlenecks and Durability Guarantees

Ensuring ACID durability while maintaining high write throughput is a fundamental engineering conflict. Directly modifying database heap files on persistent disk for every transaction is architecturally unfeasible: Postgres data pages are 8KB and highly structured, so writing them directly on every `COMMIT` produces massive random write I/O. Under concurrency, this saturates disk buses, drives write amplification, and risks corruption from mid-page write failures ("torn pages") if power is lost.

## The Architecture: Sequential Append Logging and Double Buffering

PostgreSQL resolves this with Write-Ahead Logging: instead of flushing dirty 8KB data pages from Shared Buffers directly to heap storage on commit, Postgres serializes logical and physical byte-level changes into a continuous append-only stream.

When a transaction alters a table, the change is registered in two places:

1. The memory page in **Shared Buffers** is modified and marked "dirty."
2. A WAL record describing the byte-level diff is appended to **WAL Buffers** in RAM.

On `COMMIT`, Postgres forces only the WAL Buffers to be sequentially flushed to `pg_wal` segment files via `fsync()`. Sequential append I/O is orders of magnitude faster than random heap writes, so commit latency drops while durability is guaranteed.

```text
+---------------------------------------------------------------------------------+
|                                 SHARED BUFFERS                                  |
|  [Dirty Page A]  [Dirty Page B]              [Clean Page C]      [Clean Page D] |
+---------------------------------------------------------------------------------+
         |               |
         |               | (Flushed asynchronously by Checkpointer)
         v               v
+-----------------------------+               +-----------------------------------+
|     SHARED WAL BUFFERS      |               |             HEAP DISK             |
| [WAL Rec 1] -> [WAL Rec 2]  |               |  [Page A (Old)]   [Page B (Old)]  |
+-----------------------------+               +-----------------------------------+
         |                                                       ^
         | (Flushed sequentially on COMMIT)                      |
         v                                                       |
+-----------------------------+                                  |
|        pg_wal DISK          |                                  |
| [WAL Rec 1] -> [WAL Rec 2]  |----------------------------------+
+-----------------------------+ (Redone during Crash Recovery)
```

### Log Sequence Numbers (LSN)

Every WAL record is assigned a unique, monotonically increasing 64-bit integer called a **Log Sequence Number (LSN)** — the byte offset of the record from the start of WAL history since database initialization, represented textually as two hex numbers separated by a slash (e.g. `1/A2C4F810`).

Every 8KB data page header carries the LSN of the last WAL record that modified it (`pd_lsn`). This is what makes crash recovery idempotent:

- **The Checkpointer** periodically flushes dirty buffer pages to heap files on disk.
- **The crash recovery process** reads the last checkpoint record to locate the REDO starting point in the WAL, then scans WAL records sequentially.
- **Idempotent application:** for each WAL record, Postgres compares its LSN to the `pd_lsn` already on the corresponding data page. If the page's LSN is greater than or equal to the record's LSN, the change is already applied and the record is skipped. If the page's LSN is older, the record is replayed.

## Physical Replication Streams: WAL Shipping and Streaming

Postgres physical replication streams this identical byte-level WAL stream from a primary to one or more standbys.

1. **WAL archive shipping (asynchronous).** Completed WAL segment files (typically 16MB) are copied to shared storage via `archive_command`; the standby polls the archive and restores them.
2. **Streaming replication (synchronous/asynchronous).** A network-based stream where the `walsender` process on the primary reads WAL records directly and transmits them over TCP to the `walreceiver` process on the standby.

```text
[Primary: Shared Buffers] ------> [Primary: WAL Buffers]
                                            |
                                            v (Flush to disk)
                                    [Primary: pg_wal]
                                            |
                                            v (Read by walsender)
                                     [walsender TCP]
                                            |
                                            v (Socket stream)
                                    [walreceiver TCP]
                                            |
                                            v (Write & sync)
                                    [Standby: pg_wal]
                                            |
                                            v (Startup Process: Redo loop)
                                    [Standby: Shared Buffers]
```

To prevent the primary from deleting WAL segments before a standby has received them, **replication slots** are configured on the primary: a slot tracks the minimum LSN a standby still needs and guarantees the primary retains all newer segments.

## Practical Configuration and SQL Runbook

### Key `postgresql.conf` parameters for primary nodes

```ini
# Core WAL size and checkpoint tuning
wal_level = replica             # replica, logical, or minimal
fsync = on                      # Crucial for durability
synchronous_commit = off        # Set to 'on' or 'local' for highest safety, 'off' for high throughput
wal_buffers = 16MB              # Memory buffer size for unwritten WAL data
checkpoint_timeout = 15min      # Time-based frequency of checkpoints
max_wal_size = 16GB             # Max disk space of WAL before forcing a checkpoint
min_wal_size = 2GB              # Minimum disk space to avoid aggressive WAL deletion

# Replication settings
max_wal_senders = 10            # Maximum concurrent streaming connections
wal_keep_size = 4096MB          # Fail-safe local WAL retention (or use replication slots)
```

### Investigating the WAL directly

```bash
# Dump the contents of a specific WAL file
pg_waldump pg_wal/000000010000000000000001
```

```text
rmgr: Heap        len (rec/tot):     54/    54, tx:        555, lsn: 0/01000028, prev 0/01000000, desc: INSERT off 1
rmgr: Transaction len (rec/tot):     34/    34, tx:        555, lsn: 0/01000060, prev 0/01000028, desc: COMMIT 2023-10-25 10:00:00.000 UTC
```

### Administrative SQL operations

**Verify LSN state on the primary:**

```sql
-- Check current write LSN of the primary database
SELECT pg_current_wal_lsn();

-- Find the physical filename of the active WAL segment
SELECT pg_walfile_name(pg_current_wal_lsn());
```

**Verify replication lag from the primary:**

```sql
SELECT
    client_addr AS standby_ip,
    application_name,
    state,
    sync_state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS sent_lag_bytes,
    pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
    pg_wal_lsn_diff(write_lsn, flush_lsn) AS flush_lag_bytes,
    pg_wal_lsn_diff(flush_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;
```

**Create and manage physical replication slots:**

```sql
-- Create a physical replication slot named 'standby_slot_1'
SELECT pg_create_physical_replication_slot('standby_slot_1');

-- Check active slots and their retained LSN limits
SELECT slot_name, slot_type, active, restart_lsn, wal_status
FROM pg_replication_slots;
```

## Key Takeaways

- WAL converts durability from slow random heap writes into fast sequential appends, without sacrificing crash safety.
- The LSN embedded in every WAL record and every data page header (`pd_lsn`) is what makes REDO replay idempotent after a crash.
- The same WAL stream that powers crash recovery is streamed to standbys for physical replication — replication slots are what keep the primary from deleting segments a standby still needs.
- `synchronous_commit` and `wal_level` are the two settings that most directly trade durability and replication capability against write throughput.
