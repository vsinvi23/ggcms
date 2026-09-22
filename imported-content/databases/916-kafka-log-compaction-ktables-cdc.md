# Kafka Log Compaction: Retaining the Latest Key State for KTables

## The Problem: Infinite Log Growth in State-Based Streams
In event streaming, there are two primary classes of data:
1. **Event Stacks:** Logs where every individual record represents a discrete historical fact (e.g., a user click, page view, or sensor telemetry). Retaining all records is necessary to query trends.
2. **Keyed States:** Logs where records represent updates to an entity's current state (e.g., account balances, user profile details, or catalog item prices). 

If you use a standard time-based or size-based retention policy on a state-based topic, you face a dilemma. 

If retention is too short, Kafka purges old keys, losing critical reference data. If retention is infinite, the storage disk will eventually fill up. 

Furthermore, when downstream applications initialize a state store (such as a Kafka Streams **KTable** or an in-memory cache), they must read the topic from offset zero. Scanning billions of obsolete historical updates to reach the latest state slows down application startup to hours.

---

## Technical Architecture: Cleaner Threads and Log Compaction
To solve this, Kafka provides **Log Compaction**. Under log compaction, the broker ensures that within a partition's log, at least the **last known value** for each key is retained.

```
Log Segment Before Compaction (Duplicates Exist):
┌───────────┬───────────┬───────────┬───────────┬───────────┐
│ Key1: Val1│ Key2: Val1│ Key1: Val2│ Key3: Val1│ Key2: Val2│
│ Offset: 1 │ Offset: 2 │ Offset: 3 │ Offset: 4 │ Offset: 5 │
└───────────┴───────────┴───────────┴───────────┴───────────┘
                                   │
                                   ▼ (Log Cleaner executes)
Log Segment After Compaction (Only Latest Key Offset Retained):
┌───────────┬───────────┬───────────┐
│ Key1: Val2│ Key3: Val1│ Key2: Val2│
│ Offset: 3 │ Offset: 4 │ Offset: 5 │
└───────────┴───────────┴───────────┘
```

### Log Anatomy: Clean vs. Dirty Sections
A compacted partition log is divided into two distinct sections:
* **The Clean Section (Tail):** This portion has already been compacted by the cleaner thread. It contains exactly one record per key—the one with the highest offset at the time of the last compaction.
* **The Dirty Section (Head):** This portion has not yet been processed. It contains both new keys and updates with duplicate keys.

Compaction is performed only on inactive, rolled segments. The active segment (where new writes are appended) is never compacted.

### How the Log Cleaner Thread Works
1. **Offset Mapping:** The Log Cleaner thread reads the dirty section of the log and builds an in-memory `OffsetMap`. This map uses a highly compact hash table storing 8-byte MD5 hashes of keys mapped to their 8-byte offsets.
2. **Re-writing Segments:** The cleaner scans the clean (tail) and dirty (head) segments. If a record's key exists in the `OffsetMap` but its offset is strictly lower than the offset recorded in the map, that record is discarded.
3. **Merging:** The remaining records are written into new, highly compacted log segments, and the old segments are deleted.

### Deletions and Tombstones
How do you delete a key in a compacted topic? You cannot simply stop sending updates. To delete a key, a producer writes a record with that key and a **`null` payload** (known as a **Tombstone**). 

The cleaner thread preserves the tombstone across a configurable window (`delete.retention.ms`). This ensures that downstream consumers running KTables have enough time to read the tombstone, process the deletion locally, and remove the key from their internal state stores. Once this grace period expires, the cleaner purges the tombstone from the physical log.

---

## Technical Implementation: Compaction Configuration and Management

Below is a production-ready configuration segment for creating a high-throughput, compacted Kafka topic optimized for CDC and KTables.

```properties
# Topic properties configuration (can be applied via kafka-topics.sh)

# Set cleanup policy to compact
cleanup.policy=compact

# The minimum ratio of dirty log to total log size before the cleaner compiles it
# Default is 0.5 (50%). Lowering this (e.g. 0.2) forces more aggressive, frequent compactions
min.cleanable.dirty.ratio=0.30

# Max time an inactive segment can remain uncompacted
max.compaction.lag.ms=86400000 # 24 Hours

# Time to retain Tombstone markers so slow consumers can process deletions
delete.retention.ms=86400000 # 24 Hours

# Max size of an individual segment file before rolling. Smaller segments (e.g. 100MB)
# allow compaction to execute sooner on older chunks.
segment.bytes=104857600 # 100 MB

# Memory size allocated to the log cleaner's offset map hash table per broker
# Adjust this in broker properties if you have millions of unique keys
log.cleaner.dedupe.buffer.size=1073741824 # 1 GB
```

### Creating and Inspecting Compacted Topics via CLI
Use the Kafka admin scripts to apply compaction and monitor log directories:

```bash
# Create a compacted topic for customer profiles
kafka-topics.sh --bootstrap-server kafka-broker-1:9092 \
  --create --topic customer-profiles \
  --partitions 6 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.20 \
  --config delete.retention.ms=3600000

# Inspect the topic configurations
kafka-topics.sh --bootstrap-server kafka-broker-1:9092 \
  --describe --topic customer-profiles

# Check log directory sizes to observe physical compaction results
kafka-log-dirs.sh --bootstrap-server kafka-broker-1:9092 \
  --describe --topic-list customer-profiles
```
