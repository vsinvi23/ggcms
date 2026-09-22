# Kafka Log Compaction: Retaining the Latest Key State for KTables and CDC Streams

### The Problem: Unbounded Streams vs. Current State

Apache Kafka is fundamentally an append-only distributed commit log. By default, it retains data based on a time limit (e.g., 7 days) or a size limit (e.g., 50GB per partition). When these limits are breached, the oldest segments are deleted. 

This default behavior is perfect for transient event streams (like clickstreams or web logs). However, it fails catastrophically for use cases that require knowing the **current state** of an entity indefinitely. 

Consider a Change Data Capture (CDC) pipeline syncing a user database to Kafka. If a user updates their email address today, and then doesn't touch their profile for a year, a time-based retention policy will delete their record after 7 days. Downstream consumers joining a year from now will have no knowledge of this user. If we set retention to "infinite," the disk will eventually fill up with historical mutations we no longer care about.

### The Mental Model: Log Compaction

Kafka solves this with **Log Compaction**. When a topic is configured for compaction, Kafka does not blindly delete old data based on time. Instead, it guarantees that it will retain at least the **most recent message for every primary key** present in the log.

Compaction treats the stream not as a sequence of independent events, but as an ongoing changelog of a materialized view.

#### Visualizing Log Compaction

```text
Before Compaction (Offset 0 to 6)
[K1:V1] -> [K2:V1] -> [K1:V2] -> [K3:V1] -> [K2:V2] -> [K1:V3] -> [K4:V1]

After Compaction (Background Thread Execution)
[K3:V1] -> [K2:V2] -> [K1:V3] -> [K4:V1]
```
*Notice that intermediate states (`K1:V1`, `K1:V2`, `K2:V1`) are removed. Only the latest value for each key is retained.*

### Deletes in a Compacted Log: Tombstones

If log compaction retains the last known value, how do you delete a record? If a user is deleted from the source database, you must emit a message to Kafka with the user's ID as the key and `null` as the value. 

This is known as a **Tombstone** message. During compaction, the cleaner thread sees the tombstone and marks all prior occurrences of that key for deletion. The tombstone itself is retained for a configurable period (`delete.retention.ms`) to give downstream consumers enough time to observe the deletion before the tombstone is scrubbed from disk entirely.

### How Compaction Works Internally

Kafka partitions are divided into segment files. The active segment (where new messages are appended) is never compacted. Compaction only targets closed, inactive segments.

Kafka runs background cleaner threads. These threads scan segments and build an in-memory hash map containing the latest offset for each key in the log. This map is called the **offset map**.

1.  **Map Building:** The cleaner scans the "dirty" (uncompacted) section of the log and populates the offset map (Key -> Latest Offset).
2.  **Copying:** The cleaner then reads the segments again. If a message's offset is lower than the offset stored in the map for that key, the message is obsolete and is dropped. If it matches, it is copied to a new, clean segment.
3.  **Swapping:** The old segments are atomically replaced by the new compacted segments.

### Key Configuration Parameters

To enable compaction, set the topic configuration:
`cleanup.policy=compact`

Critical tuning parameters include:

*   **`min.cleanable.dirty.ratio`:** (Default: 0.5) Compaction is I/O intensive. Kafka won't compact a log until a certain percentage of it is "dirty" (uncompacted). A ratio of 0.5 means compaction triggers only when 50% of the log contains uncompacted data. Lowering this triggers compaction more aggressively, consuming more I/O but saving disk space.
*   **`segment.ms` / `segment.bytes`:** Controls when a segment is closed. Since active segments are never compacted, ensuring segments close regularly is vital for timely compaction.
*   **`delete.retention.ms`:** How long tombstones survive before being purged. Must be longer than your longest consumer downtime, otherwise, consumers will miss the deletion event and retain zombie state.

### Primary Use Cases

**1. Kafka Streams KTables:** 
In Kafka Streams, a `KTable` represents state. It is backed by a local RocksDB instance and a Kafka changelog topic. That changelog topic *must* be compacted. Upon a pod restart, the application rebuilds its local RocksDB state by replaying the compacted changelog from offset zero.

**2. Change Data Capture (Debezium):**
When streaming database tables via Debezium, the target Kafka topic acts as a durable replica of the source table. Compaction ensures the topic size remains proportional to the number of rows in the source table, rather than the number of update operations over time.