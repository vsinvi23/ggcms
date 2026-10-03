---
title: "Kafka Log Compaction: Retaining Latest Key State for KTables and CDC"
description: "How Kafka's log cleaner thread, tombstone records, and compacted topics let KTables and CDC pipelines bootstrap current state without replaying years of history."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "kafka"
  - "log-compaction"
  - "kafka-streams"
  - "ktable"
  - "change-data-capture"
---

# Kafka Log Compaction: Retaining Latest Key State for KTables and CDC

## The Problem: Infinite Log Growth vs. Current State

Apache Kafka is fundamentally an append-only distributed commit log. By default, topics retain data based on a time limit (`log.retention.ms`, e.g. 7 days) or a size limit (`log.retention.bytes`). Once these thresholds are breached, the oldest segments are deleted.

This works well for transient event streams (clickstreams, web logs), but fails for use cases that need to know the **current state** of an entity indefinitely.

Consider a Change Data Capture (CDC) pipeline syncing a user database to Kafka. If a user updates their email today and doesn't touch their profile again for a year, a time-based retention policy deletes their record after 7 days — a consumer joining a year from now has no knowledge of that user. Set retention to "infinite" instead, and disk eventually fills up with historical mutations nobody cares about anymore.

* **Data loss under time retention:** a product price updated six months ago, with no further updates, simply disappears after a 30-day cleanup policy — the current price state is lost.
* **Bootstrapping latency:** disabling deletion entirely to avoid loss means stateful applications (Kafka Streams `KTable`s, CDC consumer databases) must replay every historical update since offset zero on startup. For high-throughput topics, this sweep can take hours, creating serious deployment and recovery bottlenecks.

## The Solution: Log Compaction

Kafka solves this with **log compaction**. When a topic is configured for compaction, Kafka does not delete data based on time — instead, it guarantees it will retain at least the **most recent message for every key** present in the log. Compaction treats the stream not as a sequence of independent events, but as an ongoing changelog of a materialized view.

```text
Uncompacted Partition Log (Historical)
+--------------------+--------------------+--------------------+--------------------+
| Offset 0           | Offset 1           | Offset 2           | Offset 3           |
| Key: "UserA"       | Key: "UserB"       | Key: "UserA"       | Key: "UserC"       |
| Val: "State-1"     | Val: "State-1"     | Val: "State-2"     | Val: "State-1"     |
+--------------------+--------------------+--------------------+--------------------+
                                      |
                                      v (Log Cleaner Thread Sweep)
Compacted Partition Log
+--------------------+--------------------+--------------------+
| Offset 1           | Offset 2           | Offset 3           |
| Key: "UserB"       | Key: "UserA"       | Key: "UserC"       |
| Val: "State-1"     | Val: "State-2"     | Val: "State-1"     |
+--------------------+--------------------+--------------------+
(Older "UserA" at Offset 0 is safely discarded; latest state is preserved)
```

### Head and Tail: The Log Cleaner Process

A compacted partition log is divided into two logical sections:

1. **The active segment (head)** — where new messages are appended. Never compacted.
2. **Historical segments (tail)** — older, closed segments containing both "clean" (already compacted) and "dirty" (new, uncompacted) data.

The **Log Cleaner** background thread pool runs a garbage-collection loop:

1. It identifies partitions with the highest dirty-to-clean ratio and scans the dirty section of the log, building an in-memory hash map of the latest offset for every key (a highly optimized ~8 bytes-per-entry table). This is the **offset map**.
2. It rewrites the older segments: for each message, it compares the message's offset to the offset registered for that key in the map. If the message's offset is lower, the message is obsolete and dropped; otherwise it's copied to a new, clean segment.
3. The cleaner atomically swaps the old segments for the new compacted segments, and merges sparse compacted segments into larger contiguous ones to limit file-descriptor fragmentation.

## Deleting Keys with Tombstones

If compaction retains the last known value forever, how do you delete a record? A producer writes a message with the target key and a `null` payload — a **tombstone**.

When compaction runs:

1. The tombstone immediately causes the cleaner to drop all older historical updates for that key.
2. The tombstone itself is preserved for a configurable duration, `delete.retention.ms`. This buffer gives downstream consumers — who may be offline or lagging — time to read the tombstone and register the deletion before it disappears.
3. Once `delete.retention.ms` expires, the tombstone is removed on the next compaction sweep, reclaiming disk space.

`delete.retention.ms` must be longer than your longest expected consumer downtime, or consumers will miss the deletion event entirely and retain zombie state forever.

```java
// Correct programmatic Java producer code for a tombstone
ProducerRecord<String, String> record =
    new ProducerRecord<>("customer-profiles", "user_9817", null);
producer.send(record).get();
```

Typing the literal string `null` via `kafka-console-producer.sh` with `parse.key=true` may write the string `"null"` instead of a true tombstone, depending on version — always pass a physical `null`/`None` from a programmatic client to guarantee a real tombstone.

## Practical Configuration and Tuning

```ini
cleanup.policy=compact             # Enable compaction
segment.ms=604800000               # Force segment rollover after 7 days
min.cleanable.dirty.ratio=0.5      # Run compaction when dirty messages exceed 50% of log
delete.retention.ms=86400000       # Keep tombstone markers for 24 hours
segment.index.bytes=10485760       # Set index size to 10MB
```

- **`min.cleanable.dirty.ratio`** — compaction is I/O intensive; Kafka won't compact a log until this fraction of it is dirty. Lowering it triggers compaction more aggressively at the cost of more I/O.
- **`segment.ms` / `segment.bytes`** — controls when a segment is closed. Since active segments are never compacted, ensuring segments close regularly is vital for timely compaction.
- **`delete.retention.ms`** — how long tombstones survive before being purged.

### Administrative Operations Runbook

**Create a compacted topic:**

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic customer-profiles \
  --partitions 6 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.2 \
  --config delete.retention.ms=86400000
```

**Verify compaction activity** by inspecting broker log-cleaner logs or JMX MBeans:

```bash
grep "Log cleaner" /var/log/kafka/server.log
```

```text
[2026-03-01 10:15:32,492] INFO [LogCleaner] Cleaned log customer-profiles-0 in 1.45 seconds.
  Dirty messages: 14,029 (0.45 MB)
  Clean messages: 84,204 (2.12 MB)
  Compaction ratio: 0.14 (86% of data removed)
```

## Primary Use Cases

**Kafka Streams `KTable`s.** A `KTable` represents materialized state, backed by a local RocksDB instance and a compacted Kafka changelog topic. On restart, the application rebuilds its local RocksDB state by replaying the compacted changelog from offset zero — orders of magnitude faster than replaying years of raw events, because compaction has already collapsed the log down to one row per key.

**Change Data Capture (Debezium).** When streaming database tables via Debezium, the target Kafka topic acts as a durable replica of the source table. Compaction ensures the topic size stays proportional to the number of rows in the source table, rather than growing with every historical update ever made to it.

## Conclusion

Log compaction is the architectural bridge between an immutable event stream and a durable, bounded key-value store. By retaining only the latest value per key, using tombstones for deletion, and giving operators direct control over compaction aggressiveness and tombstone lifetime, Kafka lets `KTable`s and CDC consumers bootstrap current state in seconds instead of hours — without ever growing storage unboundedly.
