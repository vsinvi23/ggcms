# Postgres WAL Internals: Crash Recovery, LSN, and Physical Replication Streams

## The Problem: Storage I/O Bottlenecks and Durability Guarantees

In a relational database system, ensuring ACID durability guarantees while maintaining high write throughput is a fundamental engineering conflict. Direct, in-place modification of database heap files on persistent disk for every transaction is architecturally unfeasible. Because database data pages are typically large (8KB in PostgreSQL) and highly structured, writing them directly to disk on every `COMMIT` creates massive random write I/O. Under high-concurrency workloads, this random I/O saturates disk buses, drives write amplification, and leaves the database vulnerable to corruption during mid-page write failures (torn pages) if a power loss or OS crash occurs.

## The Architecture: Sequential Append Logging and Double Buffering

PostgreSQL resolves this conflict by implementing a Write-Ahead Logging (WAL) protocol. Instead of flushing dirty 8KB data pages from memory (Shared Buffers) directly to heap storage on commit, Postgres serializes the logical and physical byte-level changes as a continuous stream of append-only records. 

When a transaction alters a table, the change is registered in two places:
1. The memory page in **Shared Buffers** is modified and marked as "dirty."
2. A WAL record describing the byte-level diff is constructed and appended to **WAL Buffers** in RAM.

On `COMMIT`, Postgres forces only the WAL Buffers to be sequentially flushed to the transaction log (`pg_wal` segment files on disk) via an `fsync()` system call. Because sequential append I/O is orders of magnitude faster than random database heap writes, commit latency is drastically reduced while transaction durability is guaranteed.

```
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

Every WAL record is assigned a unique, monotonically increasing 64-bit integer called a **Log Sequence Number (LSN)**. The LSN represents the byte offset of the record from the beginning of the WAL history since database initialization. It is represented textually as two hexadecimal numbers separated by a slash (e.g., `1/A2C4F810`).

Every 8KB data page header in Postgres contains the LSN of the last WAL record that modified it (`pd_lsn`). This elegant design solves the crash recovery problem:
* **The Checkpointer Process:** Periodically flushes dirty buffer pages to the heap files on disk. 
* **The Crash Recovery Process:** If the server crashes, Postgres reads the last checkpoint record to locate the REDO starting point in the WAL. It then scans WAL records sequentially.
* **Idempotent Application:** For each WAL record, Postgres compares its LSN with the `pd_lsn` in the corresponding data page header on disk. If the page's LSN is greater than or equal to the WAL record LSN, the change is already written, and the record is skipped. If the page's LSN is older, the record is replayed.

## Physical Replication Streams: WAL Shipping and Streaming

Postgres physical replication operates by streaming this identical byte-level WAL stream from a Primary node to one or more Standby nodes.

1. **WAL Archive Shipping (Asynchronous):** Completed WAL segment files (typically 16MB) are copied to a shared storage target using `archive_command`. The standby polls this archive and restores them.
2. **Streaming Replication (Synchronous/Asynchronous):** A network-based stream where the `walsender` process on the primary reads WAL records directly from disk or WAL buffers and transmits them over a TCP socket to the `walreceiver` process on the standby.

```
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

To prevent the primary from deleting WAL segments before the standby has received them, **Replication Slots** are configured on the primary. A replication slot tracks the minimum LSN required by a standby and guarantees the primary will retain all newer WAL segments.

## Practical Configuration and SQL Runbook

### Key `postgresql.conf` Parameters for Primary Nodes
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

### Administrative SQL Operations

1. **Verify LSN State on Primary:**
```sql
-- Check current write LSN of the primary database
SELECT pg_current_wal_lsn();

-- Find the physical filename of the active WAL segment
SELECT pg_walfile_name(pg_current_wal_lsn());
```

2. **Verify Replication Lag from Primary:**
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

3. **Creating and Managing Physical Replication Slots:**
```sql
-- Create a physical replication slot named 'standby_slot_1'
SELECT pg_create_physical_replication_slot('standby_slot_1');

-- Check active slots and their retained LSN limits
SELECT slot_name, slot_type, active, restart_lsn, wal_status 
FROM pg_replication_slots;
```
