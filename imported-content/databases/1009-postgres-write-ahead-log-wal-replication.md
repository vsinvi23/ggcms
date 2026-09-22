# Postgres WAL Internals: Crash Recovery, LSN, and Physical Replication Streams

## The Problem: The In-Memory Durability & Random I/O Bottleneck

In relational database systems, transaction durability (the "D" in ACID) requires that once a transaction commits, its modifications are permanently recorded. The naive solution is to write every modified database page directly to disk upon commit. However, database pages are typically large (e.g., 8KB in PostgreSQL), and writing random 8KB pages to physical disk blocks is extremely slow due to random disk I/O bottlenecks. 

Moreover, if the operating system crashes or power is lost mid-write, a page can become partially written (a "torn page"), corrupting the data storage layer. PostgreSQL solves this structural bottleneck using a Write-Ahead Log (WAL).

---

## Technical Architecture & WAL Internals

PostgreSQL writes all modifications sequentially to an append-only log in memory (the WAL buffer) before updating the actual table or index data pages in the Shared Buffers. The crucial rule is: **no data page is written to disk until the corresponding WAL records describing the change have been flushed to persistent storage.**

### Log Sequence Numbers (LSN)
Every WAL record is assigned a unique, monotonically increasing 64-bit integer called a **Log Sequence Number (LSN)**. The LSN represents the byte offset of the record from the beginning of the WAL history. 

Each data page in PostgreSQL (stored in the Shared Buffers) contains a header with a `pd_lsn` field. This field records the LSN of the latest WAL record that updated that specific page. This tight coupling allows the database to determine during recovery whether a WAL record has already been applied to a disk page.

```
       [Client Transaction]
                |
                v
       +------------------+
       | Write WAL Record |
       +------------------+
                |
                v
       +------------------+                +-----------------------+
       |   WAL Buffers    | -------------> |     Shared Buffers    |
       |    (In RAM)      |                | (In RAM - Table Pages)|
       +------------------+                +-----------------------+
                |                                      |
         fsync  | (Sequential I/O)                     | (Random I/O)
                v                                      | Checkpointer
       +------------------+                            v
       |    WAL Files     |                  +-----------------------+
       |    (On Disk)     |                  |      Data Files       |
       +------------------+                  |   (On Disk - Pages)   |
                |                            +-----------------------+
                | WAL Stream
                v
       +------------------+
       |   WAL Sender     |
       +------------------+
                |
                | TCP Stream (Physical Replication)
                v
       +------------------+
       |   WAL Receiver   |  (Standby Node)
       +------------------+
```

### Crash Recovery & Checkpoints
When a crash occurs, Postgres initializes recovery from the last **Checkpoint**. The checkpointer process periodically runs to flush dirty pages from the Shared Buffers to the disk and writes a special checkpoint record to the WAL, recording the **Redo LSN**. 

Recovery follows these phases:
1. **Startup:** Reads the control file (`global/pg_control`) to locate the last checkpoint and the Redo LSN.
2. **Redo (Replay):** Scans the WAL forward from the Redo LSN. For each WAL record, it compares its LSN against the target page's `pd_lsn`. If the WAL record's LSN is greater than `pd_lsn`, the change is re-applied (replayed).
3. **Undo:** Postgres does not need an active undo phase during crash recovery because of MVCC (Multi-Version Concurrency Control); uncommitted transactions are simply marked as aborted in the commit status log (`pg_xact`).

### Physical Replication Streams
Physical replication streams identical binary copies of WAL records from a primary node to one or more standby nodes. 
- **WAL Sender:** A background process on the primary that reads WAL files and streams them over a TCP connection.
- **WAL Receiver:** A background process on the standby that writes incoming WAL streams to local WAL segments and triggers startup/recovery processes to apply them immediately.
- **Replication Slots:** Ensure that the primary does not delete WAL segments before the standby has received them, preventing replication desynchronization.

---

## WAL Diagnostic & Replication Management SQL

Administering and monitoring WAL generation, LSN progress, and physical replication lag requires precise queries using built-in PostgreSQL system functions.

```sql
-- 1. Get the current WAL write LSN on the Primary
SELECT pg_current_wal_lsn();

-- 2. Convert an LSN to the corresponding physical WAL file name
SELECT pg_walfile_name(pg_current_wal_lsn());

-- 3. Calculate WAL generation rate over an interval (run twice and diff)
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/1000000'::pg_lsn));

-- 4. Monitor physical replication lag and streaming states on the Primary
SELECT
    client_addr AS standby_ip,
    application_name,
    state,
    sync_state,
    sync_priority,
    pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS sent_lag_bytes,
    pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
    pg_wal_lsn_diff(write_lsn, flush_lsn) AS flush_lag_bytes,
    pg_wal_lsn_diff(flush_lsn, replay_lsn) AS replay_lag_bytes,
    ROUND(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) / 1024 / 1024, 2) AS total_lag_mb
FROM pg_stat_replication;

-- 5. Monitor replication receiver status on the Standby node
SELECT
    status,
    receive_start_lsn,
    received_lsn,
    latest_end_lsn,
    latest_end_time,
    slot_name
FROM pg_stat_wal_receiver;
```

---

## Production Configurations

Optimize WAL and replication performance in `/var/lib/pgsql/data/postgresql.conf`:

```ini
# WAL Writing Policies
wal_level = replica                  # Minimal level required for physical replication
fsync = on                           # Crucial for data integrity (never disable in prod)
synchronous_commit = on              # Ensures client wait for WAL flush to disk
wal_buffers = 16MB                   # Auto-tuned default, can be set up to Shared Buffers size

# Checkpoint Tuning (Avoid checkpoint spikes)
max_wal_size = 16GB                  # Maximum volume of WAL files before a checkpoint
min_wal_size = 2GB                   # Minimum WAL to keep to avoid aggressive re-allocations
checkpoint_completion_target = 0.9   # Spread checkpoint writes over 90% of checkpoint_timeout
checkpoint_timeout = 15min           # Time interval between automatic checkpoints

# Replication Configurations
max_wal_senders = 10                 # Max concurrent replication connections
max_replication_slots = 10           # Prevent primary from purging WAL for offline standbys
wal_keep_size = 4096MB               # Safe minimum backlog of WAL to retain
```
