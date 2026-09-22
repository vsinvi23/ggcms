# Postgres WAL Internals: Crash Recovery, LSN, and Physical Replication Streams

## The Problem: Data Durability vs. Throughput
In relational databases, ensuring durability (the "D" in ACID) fundamentally conflicts with high throughput. If every `INSERT` or `UPDATE` required an immediate flush to disk (specifically, writing data pages directly), disk I/O would cripple the database. Updating a B-Tree index or table heap involves random I/O, which is expensive. 

To solve this, PostgreSQL relies on the Write-Ahead Log (WAL).

## Architecture: The Write-Ahead Log

Instead of writing modified data pages immediately to disk, Postgres writes the *intent* of the change to a sequential log. 
Sequential I/O is orders of magnitude faster than random I/O. Once the WAL record is flushed to disk (via `fsync`), the transaction is considered committed. The actual data pages in memory (Shared Buffers) are flushed to disk later by a background process called the Checkpointer.

### The Component View
```text
+-----------+    (1)     +----------------+
|  Client   | ---------> | Shared Buffers | (Data Pages in Memory)
+-----------+            +----------------+
      |                          |
      | (2)                      | (4) Checkpointer/Background Writer
      v                          v
+-----------+    (3)     +----------------+
| WAL Buffer| ---------> |  PG Data Files | (Disk - Random I/O)
+-----------+   fsync    +----------------+
      |
      v
+-----------+
| WAL Files | (Disk - Sequential I/O)
+-----------+
```
1. Client modifies data. Data in Shared Buffers becomes "dirty".
2. A WAL record of the change is written to the WAL Buffer in memory.
3. On `COMMIT`, the WAL Buffer is `fsync`'d to WAL files on disk. 
4. Eventually, the Checkpointer flushes the dirty data pages to the data files.

## Log Sequence Number (LSN)
Every entry in the WAL is identified by a unique, monotonically increasing 64-bit integer called the Log Sequence Number (LSN). The LSN represents the byte offset in the WAL. 

LSNs are crucial because data pages in Postgres track the LSN of the last WAL record that modified them. During crash recovery, Postgres compares the LSN on the data page with the WAL. If the WAL has newer LSNs, those changes are replayed (Redo).

## Physical Replication Streams
The WAL isn't just for crash recovery; it is the lifeblood of replication. Physical replication streams byte-for-byte WAL records from a primary node to replicas.

### Replication Architecture
```text
[ PRIMARY ]                                   [ REPLICA ]
+-----------+                               +-------------+
| WAL Files | ---> (WAL Sender Process)     | WAL Receiver|
+-----------+               |               +-------------+
                            |                      |
                    Network Stream (TCP)           v
                                            +-------------+
                                            |   WAL/Disk  |
                                            +-------------+
                                                   | (Startup Process)
                                                   v
                                            +-------------+
                                            | Data Files  |
                                            +-------------+
```

### Key Configuration
To enable streaming replication, specific settings in `postgresql.conf` must be tuned:

```ini
# Defines how much information is written to WAL.
# 'replica' is required for streaming replication.
wal_level = replica 

# Max concurrent connections from standby servers.
max_wal_senders = 10 

# Keep WAL files around in case a replica falls behind.
# Modern Postgres uses replication slots instead of just file counts.
max_wal_size = 1GB 
```

### Replication Slots
Historically, if a replica disconnected, the primary might recycle old WAL files, forcing a full rebuild of the replica. **Replication Slots** solve this. They guarantee that the primary will hold onto WAL files until all replicas utilizing a slot have confirmed receipt of the LSNs.

```sql
-- Create a replication slot manually
SELECT pg_create_physical_replication_slot('standby_slot_1');

-- Monitor replication lag and LSNs
SELECT 
    application_name, 
    client_addr, 
    state, 
    sent_lsn, 
    write_lsn, 
    flush_lsn, 
    replay_lsn 
FROM pg_stat_replication;
```

## Conclusion
Postgres WAL architecture elegantly transforms random disk writes into fast sequential writes. By centralizing the truth of the database in an append-only log, it solves both localized crash recovery and distributed physical replication using a single, unified mechanism (the LSN).
