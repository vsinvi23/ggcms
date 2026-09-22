# Postgres WAL Internals: Crash Recovery, LSN, and Physical Replication Streams

## The Problem: The Durability Bottleneck and Random I/O
In relational database design, guaranteeing ACID compliance—specifically **Durability**—presents a fundamental I/O bottleneck. When a transaction modifies a row, writing the modified database page (typically 8KB in Postgres) directly to disk is extremely expensive. It requires random disk I/O, which is slow and wears out storage media. 

Furthermore, if the operating system crashes mid-write, the page on disk becomes corrupted (a partial write torn page). Postgres cannot simply overwrite data files directly on transaction commit without risking data loss or catastrophic corruption.

---

## Technical Architecture: Write-Ahead Logging (WAL) and LSN Mechanics
Postgres solves this using **Write-Ahead Logging (WAL)**. Instead of flushing modified data pages directly to table files, all modifications (inserts, updates, deletes) are written sequentially to an append-only log in memory (the WAL buffer) and flushed to disk before the actual database pages are modified on disk. Since sequential disk I/O is orders of magnitude faster than random I/O, this solves the latency problem.

### The Log Sequence Number (LSN)
Every WAL record is uniquely identified by a 64-bit integer called a **Log Sequence Number (LSN)**. The LSN represents the byte offset of the record within the WAL stream. 

Each data page (stored in `shared_buffers`) contains a header field called `pd_lsn`. This field records the LSN of the last WAL record that modified this specific page.

```
+────────────────────────────────────────────────────────────────────────+
|                          MEMORY (RAM)                                  |
|                                                                        |
|  [ Client Tx ] ──► [ Shared Buffers (8KB Pages) ] ──► [ WAL Buffers ]  |
|                           │ (pd_lsn = 0/1A2F3E)            │           |
+───────────────────────────┼────────────────────────────────┼───────────+
                            │ (Asynchronous Checkpoint)      │ (Synchronous fsync)
                            ▼                                ▼
+────────────────────────────────────────────────────────────────────────+
|                          DISK STORAGE                                  |
|                                                                        |
|                    [ Data Files (Heap/Index) ]     [ WAL Segments ]    |
+────────────────────────────────────────────────────────────────────────+
```

### Crash Recovery: The REDO Phase
When Postgres starts up after an unclean shutdown, it performs crash recovery:
1. **Locate the last checkpoint:** Read the `control file` to find the last checkpoint record's LSN.
2. **REDO Phase:** Scan the WAL stream forward from the checkpoint LSN. For each WAL record, compare its LSN with the `pd_lsn` in the corresponding data page on disk.
3. **Apply Changes:** If the WAL record's LSN is strictly greater than the page's `pd_lsn` (`WAL_LSN > pd_lsn`), the page on disk does not reflect the change. Postgres replays the WAL change to the page. If `WAL_LSN <= pd_lsn`, the change is already on disk, and Postgres skips it.

---

## Technical Implementation: WAL Configuration and LSN Queries

To ensure efficient crash recovery and prevent transaction lag, databases must be configured with optimal WAL parameters. Below is a production-grade `postgresql.conf` configuration segment:

```ini
# postgresql.conf - High-Throughput WAL Configuration
wal_level = replica                  # Minimal for replication/backup; use 'logical' for CDC
fsync = on                           # Keep on to guarantee durability
synchronous_commit = on              # Wait for WAL flush to disk before returning success
wal_buffers = 16MB                   # Auto-tuned by default (-1), manually set for heavy writes
max_wal_size = 16GB                  # Maximum volume of WAL before an automatic checkpoint
min_wal_size = 2GB                   # Minimum WAL to retain, avoiding constant re-allocations
checkpoint_timeout = 15min           # Time-based checkpoint trigger
checkpoint_completion_target = 0.9   # Spread checkpoint writes over 90% of the timeout window
```

### Checking LSN Progress via SQL
Database administrators can inspect current LSNs and physical replication lag using the following SQL queries:

```sql
-- Retrieve the current write and insert LSNs
SELECT 
    pg_current_wal_lsn() AS current_wal_lsn,
    pg_walfile_name(pg_current_wal_lsn()) AS current_wal_file;

-- Monitor replication lag on a primary instance
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

---

## Physical Replication Streams & Replication Slots
Physical replication streams WAL records from a primary instance to one or more standby instances over a TCP connection. 

The primary spawns a `walsender` process for each standby, while the standby runs a `walreceiver` process. The `walreceiver` writes incoming WAL data to its local WAL segments and triggers replication recovery.

### The Role of Replication Slots
Historically, if a standby went offline, the primary might delete WAL files that the standby still needed, breaking replication. **Replication Slots** solve this. A replication slot persists on the primary and tracks the minimum LSN (`restart_lsn`) required by the standby. The primary guarantees it will not delete any WAL segments containing LSNs greater than or equal to this `restart_lsn`.

```sql
-- Create a physical replication slot on the primary
SELECT * FROM pg_create_physical_replication_slot('standby_slot_1');

-- Monitor replication slot status and wal retention lag
SELECT 
    slot_name,
    active,
    active_pid,
    restart_lsn,
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
FROM pg_catalog.pg_replication_slots;
```

*Warning:* Active replication slots must be monitored. If a standby slot becomes inactive (e.g., the standby crashes permanently), the primary will accumulate WAL files indefinitely in its `pg_wal` directory, eventually filling up the disk and causing the entire database cluster to shut down. Setting `max_slot_wal_keep_size` in newer Postgres versions mitigates this risk by putting a ceiling on slot-retained WAL size.
