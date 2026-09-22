# Cassandra Deletions: Why Tombstones Cause Read Latency and Timeouts

## The Problem: The Cost of Deleting Immutable Data
In Apache Cassandra, write performance is astonishingly fast because all writes are sequentially appended to a memory structure (Memtable) and subsequently flushed to immutable disk files (SSTables). 

Because SSTables are immutable, you cannot physically go into a file and remove a record to execute a `DELETE` query. Therefore, Cassandra treats deletes as standard writes. This architectural choice leads to a severe operational hazard: if an application relies heavily on deleting rows, read queries will suddenly experience massive latency spikes and `ReadTimeoutExceptions`.

## The Solution (and Hazard): Tombstones
When a `DELETE` command is issued, Cassandra writes a special marker called a **Tombstone**. A tombstone contains the primary key of the deleted row and a deletion timestamp.

### Technical Architecture: Scanning Past the Dead
When a client executes a `SELECT` query, Cassandra must merge data from the Memtable and multiple SSTables on disk. 

```text
SSTable 1: [ UserA: Alice ] [ UserB: Bob ]
SSTable 2 (Tombstone):      [ UserB: DELETED @ 10:00 ]
SSTable 3:                  [ UserB: Robert @ 11:00 ]
```
During the read, Cassandra reads all versions. It sees `UserB` in SSTable 1, but sees the Tombstone in SSTable 2. The Tombstone acts as a suppression mechanism, instructing the executor to ignore older data. Finally, SSTable 3 overwrites the state.

**The Latency Spike:** 
If an application writes 10,000 rows, and then deletes 9,999 of them, a query fetching the single remaining row forces the database to read, deserialize, and evaluate 9,999 tombstones in memory just to find the one valid result. This consumes massive CPU and JVM heap, triggering GC pauses and timeouts.

### The GC Grace Seconds Dilemma
Why doesn't Cassandra just remove the tombstones and old data immediately? 
Because of distributed replication. If Node A processes a DELETE, it must ensure Node B and Node C also receive the tombstone. If Node B is offline during the delete, and Node A purges the tombstone from disk before Node B recovers, Node B's old data will eventually be repaired back into Node A. This is called a "Zombie resurrection."

To prevent this, tombstones are retained on disk for a safety window defined by `gc_grace_seconds` (default 10 days). Only during a compaction process *after* this window has expired will the tombstone and the underlying data finally be purged from disk.

### Identifying and Mitigating Tombstones
Cassandra tracks the number of tombstones scanned during a read. If it exceeds `tombstone_warn_threshold` (default 1000), it logs a warning. If it exceeds `tombstone_failure_threshold` (default 100,000), it aborts the query to protect the node from Out-Of-Memory (OOM) crashes.

```yaml
# In cassandra.yaml
tombstone_warn_threshold: 1000
tombstone_failure_threshold: 100000
```

To mitigate tombstone issues:
1. **Antipattern Check:** Do not use Cassandra for queue-like workloads (Insert, Read, Delete).
2. **Lower GC Grace:** If you run `nodetool repair` aggressively (e.g., every 3 days), you can safely lower `gc_grace_seconds` to 4 days, allowing compactions to purge tombstones faster.

```cql
ALTER TABLE user_sessions 
WITH gc_grace_seconds = 345600; -- 4 days
```

3. **Force Compaction:** For immediate relief, you can manually trigger user-defined compactions on highly tombstoned SSTables.

By understanding that deletes are actually writes, developers can avoid the most dangerous architectural anti-pattern in Cassandra and maintain predictable read latency.