---
title: "Spark Structured Streaming: Watermarks and State Management"
description: "How Spark Structured Streaming prevents unbounded state growth in windowed aggregations using event-time watermarks, RocksDB state stores, and micro-batch execution, with a full PySpark implementation."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "apache-spark"
  - "structured-streaming"
  - "watermarking"
  - "rocksdb"
  - "state-management"
  - "micro-batch"
  - "pyspark"
---

# Spark Structured Streaming: Watermarks and State Management

## The Stateful Streaming Memory Exhaustion Problem

Processing live streams of data — clickstreams, device logs — frequently requires aggregating over event-time windows (e.g., counting errors per server over rolling 15-minute windows). In a stateful streaming pipeline, data arrives continuously and out of order due to network congestion or client disconnects.

To aggregate this data accurately, the streaming engine must maintain active state for each key and window in memory. Without a mechanism to prune old state, the memory footprint grows boundlessly. Over weeks or months of continuous operation, the state store eventually runs out of memory, causing JVM GC pauses and crashes. The engine must balance correct historical processing against aggressive memory management.

## Mental Model: A Continually Appended Table with Event-Time Watermarks

Spark Structured Streaming models input data as an infinite, continually appended table. The engine processes this table incrementally in micro-batches, maintaining an internal State Store, and uses **watermarking** to define when late data can be safely dropped and old state evicted.

```text
Time Axis  ------------------------------------------------------------>
           [Window 10:00-10:10]   [Window 10:10-10:20]   [Current Time 10:30]
                                          |
                                          v (Watermark = 10:15)
           <--- EVICTED FROM STATE ------>|<---- ACTIVE STATE HELD ----->
                 Late records < 10:15               Late records >= 10:15
                    are dropped                       are processed
```

## Deep Architectural Internals

### State Store Providers: HDFS vs. RocksDB

Stateful streaming operations (like `groupBy().count()`) store intermediate data in a state store. Spark offers two implementations:

1. **HDFS-backed state store** — the default. Stores all active state in-memory as Java objects on the executor JVM heap, periodically flushing snapshots to distributed storage (HDFS/GCS). Fast, but highly vulnerable to JVM GC pauses and `OutOfMemoryError` once state exceeds heap capacity.
2. **RocksDB state store** — an out-of-heap, embedded key-value store running as a native process on each executor. It manages state in off-heap memory and spills to local SSDs when memory is full, completely avoiding Java GC overhead and scaling to terabytes of state.

### Watermarking and State Eviction Mechanics

To prevent boundless state growth, Spark computes a watermark on each micro-batch:

```text
Watermark = Max(Event Time seen so far) - Allowed Late Delay
```

The engine uses this watermark two ways:

* **Late data dropping** — if an incoming event's timestamp is older than the current watermark, the engine discards it immediately; it never factors into aggregations.
* **State eviction** — once a window's end boundary falls older than the current watermark, Spark knows no further late data can arrive for that window. It finalizes the aggregation, writes the result to the output sink, and purges that window's state from the RocksDB State Store.

## PySpark Implementation

The following pipeline tracks windowed click counts with watermarks and a RocksDB-backed state store:

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, window, to_json, struct

# Initialize Spark Session with RocksDB state store enabled
spark = (
    SparkSession.builder
    .appName("StatefulStreaming")
    .config(
        "spark.sql.streaming.stateStore.providerClass",
        "org.apache.spark.sql.execution.streaming.state.RocksDbStateStoreProvider",
    )
    .getOrCreate()
)

# Read from a Kafka stream
raw_stream = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "kafka:9092")
    .option("subscribe", "user_clicks")
    .load()
)

# Parse payload and enforce watermark
events = (
    raw_stream
    .selectExpr("CAST(value AS STRING) as json_payload")
    .select(col("json_payload"))
    .selectExpr("from_json(json_payload, 'user_id STRING, event_time TIMESTAMP') as data")
    .select("data.*")
    .withWatermark("event_time", "10 minutes")  # Set 10-minute allowed late delay
)

# Windowed aggregation
windowed_counts = (
    events
    .groupBy(
        window(col("event_time"), "5 minutes", "5 minutes"),
        col("user_id"),
    )
    .count()
)

# Write results out to console in Append Mode
query = (
    windowed_counts.writeStream
    .format("console")
    .outputMode("append")
    .option("checkpointLocation", "gs://spark-checkpoints/clicks/")
    .start()
)

query.awaitTermination()
```

By using `append` output mode, Spark guarantees window aggregates are only emitted once the watermark has safely passed the window's end — preventing duplicate downstream events for windows that are still open.

## Key Takeaways

* Structured Streaming's "infinite table" model lets you reason about streams with the same DataFrame API used for batch data.
* Watermarks are the mechanism that bounds state growth — without one, a long-running stateful job eventually exhausts memory.
* RocksDB state stores move state off the JVM heap, trading a small amount of local-disk I/O for freedom from GC pauses at scale.
* `outputMode("append")` combined with a watermark is what makes windowed results final and duplicate-free downstream.
