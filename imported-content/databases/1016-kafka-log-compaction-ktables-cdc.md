# Kafka Log Compaction: Retaining the Latest Key State for KTables

## The Problem: Infinite Log Growth and Cold-Start Latency

In event-driven microservices, downstream consumers often need to maintain a materialized cache of entity states, such as current user profiles, account balances, or product prices. 

If we use standard time-based or size-based retention policies in Kafka, older messages are deleted, making it impossible for new or restarted services to rebuild their state caches from scratch. 

Conversely, if we disable retention entirely, the partition logs grow indefinitely, creating a storage crisis. Furthermore, when a service restarts, it must replay millions of historical intermediate mutations just to reconstruct the current state of a few thousand active entities. Rebuilding this cache from scratch (a cold start) can take hours, stalling system deployment.

Kafka **Log Compaction** solves this by retaining only the latest record for each key, keeping storage footprint manageable and reducing cold-start replay times.

---

## Technical Architecture & Compaction Mechanics

Log compaction ensures that within a log partition, Kafka always preserves at least the last known value (the latest offset) for every message key.

```
       [Uncompacted Log Segment]
       +--------+--------+--------+--------+--------+--------+--------+
       | Key:A1 | Key:B1 | Key:A2 | Key:C1 | Key:B2 | Key:A3 | Key:D1 |
       | Offset1| Offset2| Offset3| Offset4| Offset5| Offset6| Offset7|
       +--------+--------+--------+--------+--------+--------+--------+
                                      |
                                      | Log Cleaner execution
                                      v
       [Compacted Log Segment]
       +--------+--------+--------+--------+
       | Key:C1 | Key:B2 | Key:A3 | Key:D1 |
       | Offset4| Offset5| Offset6| Offset7|
       +--------+--------+--------+--------+
       (Older offsets for Key A & B are purged. Order is preserved.)
```

### 1. Log Anatomy: Clean vs. Dirty Portions
A log partition is divided into two distinct logical areas:
- **Active Segment:** The head segment where the broker currently appends incoming messages. This is never compacted.
- **Dirty Portion:** Contains segments that have been closed but not yet processed by the log cleaner. It may contain multiple duplicate keys.
- **Clean Portion:** Compacted segments containing only the single latest value for each key.

### 2. The Log Cleaner Thread
Kafka runs background **Log Cleaner** threads. The cleaning process works as follows:
1. The cleaner thread reads the dirty segments and builds an in-memory **Skimpy Offset Map**. This map uses a 16-byte MD5 hash of each message key to point to its latest offset.
2. It re-reads the segments from oldest to newest. If a message's offset is lower than the corresponding offset in the map, the message is discarded.
3. The remaining messages are written to a new, consolidated segment file. 

This process preserves the original offsets and message order, resulting in offset gaps in the compacted segments.

### 3. Tombstone Deletions
To delete a key in a log-compacted topic, a producer writes a **Tombstone** record—a message with the target key and a `null` payload. 

When the log cleaner encounters a tombstone:
- It removes all older records for that key.
- It retains the tombstone record in the log for a configurable duration (`delete.retention.ms`). This gives consumers time to read the tombstone and delete the key from their local caches.
- Once this window passes, the tombstone is removed in the next compaction cycle.

---

## Code: Topic Configuration & KTable State Construction

Configure a log-compacted topic for Change Data Capture (CDC) or state tracking using the Kafka Admin CLI, and build a local state store using Python.

### Topic Creation with Compaction Configurations
```bash
# Create a compacted topic with 1-day tombstone retention
kafka-topics.sh --create --bootstrap-server localhost:9092 \
  --topic customer-profiles \
  --partitions 3 \
  --replication-factor 3 \
  --config cleanup.policy=compact \
  --config delete.retention.ms=86400000 \
  --config min.cleanable.dirty.ratio=0.5 \
  --config segment.ms=604800000
```
Key parameters configured:
- `cleanup.policy=compact`: Enables log compaction.
- `min.cleanable.dirty.ratio=0.5`: Triggers compaction once the uncompacted (dirty) portion of the log exceeds 50% of the total size.
- `delete.retention.ms=86400000`: Retains tombstones for 24 hours to ensure all consumer groups detect deletions.

### Materializing state using Python
The following example reads a compacted topic to build and maintain an in-memory state store (the equivalent of a KTable).

```python
import json
from confluent_kafka import Consumer, KafkaError

class MaterializedStateStore:
    def __init__(self):
        # Local state store representing the KTable
        self.state_cache = {}

    def apply_mutation(self, key, value):
        if value is None:
            # Delete record if payload is null (tombstone)
            self.state_cache.pop(key, None)
            print(f"Tombstone processed. Key '{key}' removed from local cache.")
        else:
            # Insert or update state
            self.state_cache[key] = value
            print(f"State updated. Key '{key}' -> {value}")

    def get(self, key):
        return self.state_cache.get(key)

# Configure consumer to read from the beginning to rebuild cache on restart
consumer_config = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'profile-materializer-v1',
    'auto.offset.reset': 'earliest',  # Always start from offset 0
    'enable.auto.commit': False
}

store = MaterializedStateStore()
consumer = Consumer(consumer_config)
consumer.subscribe(["customer-profiles"])

print("Rebuilding materialized state from compacted topic...")
try:
    while True:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            # Reached end of current stream - cache is warm
            continue
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                continue
            else:
                print(f"Stream error: {msg.error()}")
                break
        
        # Keys must be present in compacted topics
        key = msg.key().decode('utf-8') if msg.key() else None
        if not key:
            continue
            
        payload = msg.value()
        value = json.loads(payload.decode('utf-8')) if payload is not None else None
        
        # Apply change to local cache
        store.apply_mutation(key, value)
except KeyboardInterrupt:
    pass
finally:
    consumer.close()
```
Using log-compacted streams ensures that restarts read only the latest state of each key, rather than a massive backlog of stale historical mutations. This speeds up cache warmups and makes cold starts efficient.
