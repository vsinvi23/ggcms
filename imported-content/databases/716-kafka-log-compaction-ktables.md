# Kafka Log Compaction: Retaining the Latest Key State for KTables

## The Problem: Infinite Log Growth for State Stores
Apache Kafka topics are typically configured with time-based or size-based retention policies (e.g., delete messages older than 7 days). This works for event streams (like page views or clicks). 

However, when Kafka is used to stream application state, user profiles, or database CDC (Change Data Capture) logs, the requirements change. If a user updates their profile 50 times over a year, we don't care about the 49 historical updates; we only care about the latest state. A 7-day retention would delete the profile entirely if it wasn't updated recently, while infinite retention would exhaust cluster storage with obsolete historical versions.

## The Solution: Log Compaction
Kafka's Log Compaction ensures that Kafka retains at least the *last known value* for each message key within the log of data for a single topic partition. It guarantees that the stream can act as a persistent, queryable state store (like a KTable in Kafka Streams) without growing infinitely.

### Technical Architecture: Head and Tail
A compacted partition log is divided into two sections:
1. **The Tail (Clean):** The older section of the log where compaction has already occurred. Keys here are unique.
2. **The Head (Dirty):** The newest section of the log where messages are being actively appended. This section contains duplicate keys and operates exactly like a standard Kafka log.

```text
Dirty Log (Head):  [K1:V1, K2:V1, K1:V2, K3:V1, K2:V2]
                         |
                 (Compaction Process)
                         v
Clean Log (Tail):  [K1:V2, K3:V1, K2:V2]
```

### The Log Cleaner Thread
Kafka brokers run a background pool of Log Cleaner threads. 
1. The cleaner identifies partitions with the highest ratio of dirty-to-clean logs.
2. It builds an in-memory hash map of the latest offset for every key in the dirty section.
3. It creates a new, clean segment file by reading the old segments from beginning to end. If a message's offset is lower than the highest offset for that key in the hash map, the message is discarded (compacted). 
4. The cleaner swaps the new segment for the old ones.

*Note: Deletions are handled via "Tombstone" messages (a message with a key and a `null` payload). The cleaner retains tombstones for a configurable period to ensure downstream consumers see the deletion before it is wiped from disk.*

### KTables and State Reconstruction
Log compaction is the architectural foundation of `KTable` in Kafka Streams. When an application re-starts, it must reconstruct its state in memory. By reading a compacted topic from offset 0, the application applies only the latest state updates, booting up orders of magnitude faster than if it had to replay years of obsolete events.

### Code: Configuring a Compacted Topic
Compaction is enabled at the topic level via the `cleanup.policy` configuration.

```bash
# Create a compacted topic for user profiles
kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic user_profiles \
  --partitions 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.5 \
  --config segment.ms=86400000
```
- `cleanup.policy=compact`: Instructs Kafka to use key-based compaction instead of time-based deletion.
- `min.cleanable.dirty.ratio`: Compaction requires I/O. Setting this to `0.5` ensures the cleaner only runs when the log is at least 50% dirty, preventing constant disk thrashing.

Through log compaction, Kafka elegantly bridges the gap between an immutable event stream and a durable, bounded key-value database.