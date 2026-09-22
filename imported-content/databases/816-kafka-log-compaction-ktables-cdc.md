# Kafka Log Compaction: Retaining the Latest Key State for KTables

## The Problem: Infinite Log Growth in State-Tracking Pipelines

When using Apache Kafka as an event stream, the default retention policies are size-bound (`log.retention.bytes`) or time-bound (`log.retention.ms`). After these thresholds expire, older segments of the log are physically deleted from disk. 

This model fails for applications that use Kafka to track long-lived, key-based state updates, such as user profiles, product inventory prices, or account balances.
* **Data Loss under Time Retention:** If a product's price was updated six months ago and no new updates occur, a time-bound cleanup policy of 30 days will delete the record. The current price state is lost forever.
* **Bootstrapping Latency:** If you disable deletion and retain every single historic change record indefinitely to prevent state loss, stateful applications (such as Kafka Streams **KTables** or CDC consumer databases) must read every historical update since offset zero when bootstrapping. For high-throughput systems, this startup sweep can take hours, creating severe deployment and recovery bottlenecks.

## The Architecture: Internals of Log Compaction

Kafka solves this problem by providing **Log Compaction**. Under this cleanup policy, Kafka ensures that for any given partition, the log will always retain at least the last known message value (containing the latest offset) for every message key.

```
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

### The Log Cleaner Process

The partition log is divided into two logical sections:
1. **The Active Segment:** The current head of the log where new writes are appended. This segment is never compacted.
2. **Historical Segments:** Older, closed segments containing both the "clean" (already compacted) and "dirty" (new uncompacted updates) logs.

The **Log Cleaner** background thread runs a garbage collection loop:
* It scans the dirty section of the log and builds an in-memory map of keys and their latest offsets using a highly optimized, compact hash table (using 8 bytes of memory per entry).
* It rewrites older log segments. For each message, it compares its offset to the offset found in the in-memory map. If the message's offset is lower than the latest offset registered for that key, the message is dropped.
* The cleaner merges sparse, compacted log segments into larger, contiguous segments to prevent file-descriptor fragmentation.

### Deleting Keys with Tombstones

To delete a key in a compacted topic, a producer writes a message containing the target key and a `null` payload. This message is called a **Tombstone**.

When compaction runs, the tombstone acts as a deletion marker:
1. It immediately causes the cleaner to drop all older historical updates for that key.
2. The tombstone itself is preserved in the log for a configurable duration (`delete.retention.ms`). This buffer gives downstream consumers (who may be offline or processing lag) time to read the tombstone, register the deletion, and update their local state machines.
3. Once `delete.retention.ms` expires, the tombstone is removed during the next compaction sweep, reclaiming the disk space.

## Practical Configuration and Tuning Runbook

### Topic Configuration for Compaction

Apply these settings to your topic definition to enable and optimize log compaction:

```ini
cleanup.policy=compact             # Enable compaction
segment.ms=604800000               # Force segment rollover after 7 days
min.cleanable.dirty.ratio=0.5      # Run compaction when dirty messages exceed 50% of log
delete.retention.ms=86400000       # Keep tombstone markers for 24 hours
segment.index.bytes=10485760       # Set index size to 10MB
```

### Administrative Operations Runbook

1. **Create a Compacted Topic via CLI:**
```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic customer-profiles \
  --partitions 6 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.2 \
  --config delete.retention.ms=86400000
```

2. **Verify Topic Compaction Metrics:**
Inspect Broker log cleaner logs or query JMX MBeans to ensure cleaner threads are running and compacting data:
```bash
# Check broker service logs for compaction activities
grep "Log cleaner" /var/log/kafka/server.log
```
Example Output showing compaction ratios:
```text
[2026-03-01 10:15:32,492] INFO [LogCleaner] Cleaned log customer-profiles-0 in 1.45 seconds.
  Dirty messages: 14,029 (0.45 MB)
  Clean messages: 84,204 (2.12 MB)
  Compaction ratio: 0.14 (86% of data removed)
```

3. **Writing a Tombstone Record (Manual State Deletion):**
Use the console producer to write a tombstone marker manually to test deletion sequences. Note the use of the custom key-separator:
```bash
kafka-console-producer.sh --bootstrap-server localhost:9092 \
  --topic customer-profiles \
  --property "parse.key=true" \
  --property "key.separator=:"
```
Input:
```text
user_9817:null
```
*Note: Typing `null` literal with `parse.key=true` may write the string "null" depending on version; in programmatic Java/Python clients, pass a physical `null` or `None` as the message payload to guarantee a true tombstone.*
```java
// Correct programmatic Java Producer code for Tombstone
ProducerRecord<String, String> record = new ProducerRecord<>("customer-profiles", "user_9817", null);
producer.send(record).get();
```
