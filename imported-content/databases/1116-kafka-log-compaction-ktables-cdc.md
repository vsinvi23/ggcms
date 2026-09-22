# Kafka Log Compaction: Retaining the Latest Key State for KTables

## The Problem: Unbounded Event Sourcing
Kafka was initially designed as an immutable, time-based, append-only log. In a standard topic, messages are retained for a fixed duration (e.g., 7 days) or up to a fixed size limit. Once the threshold is crossed, old segments are deleted.

This is perfect for ephemeral events like web clicks or application logs. However, Kafka is often used as a source of truth for materialized views, caches, or Change Data Capture (CDC) streams (e.g., streaming database updates via Debezium). 

If a user updates their profile picture, we care about the *newest* picture. If we rebuild a cache from the Kafka topic, we don't want to replay the 500 times the user changed their picture over the last 3 years; we only want the final state. Furthermore, if the topic has a 7-day retention policy, the user's profile data will simply vanish on day 8.

## Architecture: Log Compaction
To solve this, Kafka introduced **Log Compaction**. Instead of discarding data based on time or size, a compacted topic retains at least the *last known value for every distinct key* ever published to the topic.

### The Mechanics of Compaction
A compacted partition is logically divided into two sections:
1.  **The Head (Dirty Log):** The newest messages. These have not been compacted yet. It looks exactly like a normal Kafka log.
2.  **The Tail (Clean Log):** The older messages that have been processed by the Log Cleaner. Here, duplicate keys have been purged.

```text
[ Uncompacted Partition (Dirty) ]
Offset: 0    1    2    3    4    5    6
Key:    K1   K2   K1   K3   K2   K1   K4
Val:    V1   V1   V2   V1   V2   V3   V1

      (Log Cleaner Background Thread Runs)
                      |
                      v

[ Compacted Partition (Clean) ]
Offset: 3    4    5    6
Key:    K3   K2   K1   K4
Val:    V1   V2   V3   V1
(Notice offsets 0, 1, and 2 are removed because newer values for K1 and K2 exist)
```

**Crucial Note:** Offsets are never changed. If a consumer requests offset `1` (which was deleted), Kafka simply returns the next available message (offset `3`).

## Tombstones and Deletions
If compaction retains the last known value forever, how do we delete a key completely? 
To delete a key in a compacted topic, the producer must send a message with the target key and a `null` payload. This is called a **Tombstone**.

The Log Cleaner sees the tombstone, removes all prior occurrences of that key, and retains the tombstone for a configurable period (`delete.retention.ms`) so offline consumers have time to see the deletion before the tombstone itself is finally scrubbed from disk.

## KTables and CDC
Log compaction is the architectural prerequisite for stream processing frameworks like Kafka Streams (specifically the `KTable` abstraction) and CDC connectors.

A `KTable` represents the current state of a dataset at a point in time (like a SQL table). When a Kafka Streams application boots up, it restores its local RocksDB state store by reading the compacted topic from offset 0 to the end. Because the topic is compacted, the application only processes the minimal amount of data necessary to rebuild the table, making startup times orders of magnitude faster.

### Configuration
Compaction is enabled on a per-topic basis via the `cleanup.policy` property.

```bash
# Create a compacted topic for user profiles
kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic user-profiles \
  --partitions 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.5
```

The `min.cleanable.dirty.ratio` (default 0.5) dictates how much of the log must be "dirty" before the background cleaner thread spends CPU/I/O compacting it.

## Conclusion
Log Compaction transforms Kafka from a transient event bus into a durable, key-value store mechanism. By continuously scrubbing obsolete state in the background, Kafka supports CDC pipelines and KTable state reconstruction efficiently without unbounded disk growth.
