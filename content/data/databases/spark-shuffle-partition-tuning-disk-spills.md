---
title: "Apache Spark: Tuning Shuffle Partitions to Stop Disk Spills"
description: "How undersized shuffle partitions cause out-of-memory disk spills in Spark, and how to fix them with spark.sql.shuffle.partitions tuning, Adaptive Query Execution, and skew-key salting."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "apache-spark"
  - "shuffle-partitions"
  - "adaptive-query-execution"
  - "data-skew"
  - "disk-spill"
  - "performance-tuning"
---

# Apache Spark: Tuning Shuffle Partitions to Stop Disk Spills

## The Problem: Out-of-Memory and Disk Spills

Apache Spark is celebrated for in-memory processing speeds. But when executing wide transformations — `groupByKey`, `join`, `distinct` — Spark must redistribute data across the cluster so records with the same key end up on the same executor node. This process is called a **shuffle**.

If the data mapped to a single shuffle partition exceeds the RAM allocated to the executor's memory execution pool, Spark can't hold it in memory. It serializes the excess data and writes it to local disk — a "disk spill." Spilling slows jobs down by orders of magnitude and often leads to out-of-memory (OOM) executor crashes.

## The Solution: Tuning Shuffle Partitions

Mitigating disk spills requires understanding the mathematical relationship between the volume of data being shuffled and the number of shuffle partitions configured. The primary lever is `spark.sql.shuffle.partitions`.

### Mental Model: The Sorting Bins

Imagine ten workers sorting a mountain of mail by ZIP code into 200 bins. If too much mail goes to bin #42 (a heavily populated ZIP code), the worker on bin #42 gets overwhelmed and drops mail on the floor (disk spill), slowing everyone down. The fix is more bins (partitions) or better sorting rules.

```text
[ Map Phase: 1000 Partitions ] -> (Local Shuffle Write)
       |
    (Network Transfer)
       |
[ Reduce Phase: 200 Partitions ] -> RAM Limit per Partition!
       |
  (Disk Spill if > RAM)
```

## Deep Dive: The Shuffle Mechanics

By default, Spark SQL creates exactly **200** shuffle partitions for a join or aggregation.

If your shuffle stage processes 10 GB of data, each of the 200 partitions handles ~50 MB — comfortably fits in executor RAM. If it processes 10 TB, each partition must handle ~50 GB. No standard executor has 50 GB of execution memory for a single task, so the data spills to disk.

### 1. Increasing Shuffle Partitions

The direct fix is raising the partition count so data chunks shrink. A common heuristic targets ~100–200 MB per partition.

```python
# If shuffling 10TB (10,000,000 MB), target 200MB per partition:
# 10,000,000 / 200 = 50,000 partitions
spark.conf.set("spark.sql.shuffle.partitions", "50000")
```

### 2. Adaptive Query Execution (AQE)

In Spark 3.0+, you don't have to guess the exact number. Adaptive Query Execution can dynamically coalesce or split shuffle partitions at runtime based on the actual size of the map stage's output.

```python
# Enable AQE
spark.conf.set("spark.sql.adaptive.enabled", "true")
# Set a high initial number; AQE will coalesce them down if they are too small
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.shuffle.partitions", "10000")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "134217728") # 128MB
```

### 3. The Skew Problem

What if `shuffle.partitions` is set to 10,000, but one key (e.g., `user_id = NULL`) accounts for 80% of the data? That's data skew — one partition will still be 8 TB and will still spill.

AQE includes automatic skew optimization:

```python
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
```

When enabled, if AQE detects one partition is significantly larger than the median, it splits that skewed partition into sub-partitions, letting multiple tasks process it in parallel.

## Alternative: Salting

If AQE isn't an option (older Spark versions), manually "salt" the skewed key: append a random integer (0–9) to the skewed key before the join, forcing the data to spread across ten partitions, and join against a replicated version of the other table.

## Conclusion

Disk spills during a shuffle are the number one killer of Apache Spark performance. By aggressively tuning `spark.sql.shuffle.partitions` for large datasets and leveraging Spark 3's Adaptive Query Execution to handle dynamic sizing and skew, data engineers can keep shuffles entirely in-memory, unlocking the engine's true speed.
