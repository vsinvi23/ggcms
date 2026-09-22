---
title: "Apache Cassandra Internals: LSM Trees, SSTables, and Bloom Filters"
description: "Analyze the write-optimized storage engine of Apache Cassandra, explore how Log-Structured Merge (LSM) Trees and SSTables eliminate random disk I/O, and learn how Bloom Filters prevent expensive read-amplification scans on disk."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "cassandra"
  - "lsm-tree"
  - "sstables"
  - "bloom-filters"
  - "memtable"
  - "compaction"
---

# Apache Cassandra Internals: LSM Trees, SSTables, and Bloom Filters

## What We Are Going to Learn

In this deep-dive guide to distributed NoSQL database internals, we will explore the write-path architecture of **Apache Cassandra**.

Specifically, we will cover:

1. **The Random I/O Bottleneck:** Why traditional B-Tree databases struggle under heavy write workloads.
2. **Log-Structured Merge (LSM) Trees:** How Cassandra transforms writes into high-speed sequential disk appends.
3. **SSTables and Compaction:** The anatomy of immutable Sorted String Tables and how compaction merges them.
4. **Bloom Filters:** The mathematical structures that act as defensive gates to eliminate redundant disk reads.

## The Problem: The High Cost of Random Write Disk I/O

Traditional relational databases (like PostgreSQL and MySQL) organize their physical data using **B-Tree** structures.

In a B-Tree, when an application inserts or updates a row, the database must find the exact physical page on disk where that row belongs and edit it in-place. This is known as a **Random Write**.

- On spinning hard drives (HDDs), random writes require physical disk heads to seek across tracks, which can take several milliseconds per write.
- On Solid State Drives (SSDs), random writes trigger **write amplification**. Flash memory cannot overwrite individual bytes; it must erase an entire physical block (typically 4 MB) to rewrite a single 4 KB page, rapidly wearing out the physical drive.

This write-in-place constraint makes B-Trees highly inefficient for applications that ingest high-velocity streaming data, such as telemetry, IoT sensors, or financial transaction feeds.

## Why the Problem Is Hard: Fast Writes with High-Performance Reads

To scale global ingestion workloads, a database must write data as fast as the network interface can receive packets. However, we cannot simply write data into a raw, unsorted, append-only log file.

If our on-disk files are unsorted:

- Writing is exceptionally fast (simple append).
- Reading a single row becomes an absolute nightmare: the database would have to perform a linear scan across terabytes of disk data just to find one record, destroying read performance.

We must design a storage engine that provides **sequential, high-speed write paths** while maintaining **highly indexed, rapid read paths**.

## A Simple Mental Model: The Writing Pad and the Sorted Archives

Think of Apache Cassandra's storage engine like a dynamic, double-buffered library archive.

```text
       [ Client Write ] ──► (In-Memory Buffer) ──► Memtable (Sorted in RAM)
                                                          │
                                                          ▼ (Flush to Disk)
       ┌──────────────────────────────────────────────────┴────────────────────────────────┐
       │                               Disk Storage (SSTables)                             │
       │                                                                                   │
       │  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐  │
       │  │       SSTable 1        │  │       SSTable 2        │  │       SSTable 3        │  │
       │  ├────────────────────────┤  ├────────────────────────┤  ├────────────────────────┤  │
       │  │  [Bloom Filter] (100%) │  │  [Bloom Filter] (0%)   │  │  [Bloom Filter] (100%) │  │
       │  │  Keys: Alice, Bob      │  │  Keys: Charlie, Dave   │  │  Keys: Edward, Frank   │  │
       │  └───────────┬────────────┘  └────────────────────────┘  └───────────┬────────────┘  │
       └──────────────┼───────────────────────────────────────────────────────┼────────────┘
                      │ (SSTables skipped due to Bloom Filter 0% match)      │
                      ▼                                                       ▼
                [ READ KEY: "Bob" -> Instantly read ONLY from SSTable 1 & 3 ]
```

- **The Writing Pad (Memtable):** Incoming writes are buffered sequentially in memory (like jotting notes down on a desk pad).
- **The Sorted Archives (SSTables):** When the pad fills up, it is torn off and filed in alphabetical order into a drawer as a sorted book (SSTable).
- **The Gatekeeper (Bloom Filter):** When someone asks for a book containing "Bob", a fast index card check (Bloom Filter) instantly tells us which drawers definitely *do not* have "Bob", so we only open the drawers that do.

## Under the Hood: The Cassandra Write Path and Memtables

When a write command reaches a Cassandra storage node, it is executed simultaneously across two distinct paths:

1. **The CommitLog (Sequential Append on Disk):** The write is appended directly to an on-disk, sequential file called the CommitLog. Because this file is append-only, there are no disk seeks. The CommitLog is used strictly for crash recovery; if the node loses power, the database replays this log to reconstruct its memory state.
2. **The Memtable (Sorted Buffer in RAM):** The data is simultaneously written to an in-memory data structure called a **Memtable**. The Memtable represents the "active" write cache. Internally, Cassandra implements the Memtable using a thread-safe **Concurrent Skip List**, which automatically keeps the incoming records sorted by their Partition Key and Clustering Key as they arrive.

Once the write is registered in both the CommitLog and the Memtable, the database returns a success response to the client. This entire path takes less than a millisecond, completely bypassing expensive disk search bottlenecks.

## The Solution: SSTables, Compaction, and Bloom Filters

### 1. SSTable Flushes

When the Memtable reaches a preconfigured memory threshold (typically 512 MB to 1 GB), Cassandra flushes its sorted content to disk as an immutable **SSTable** (Sorted String Table). Because the Memtable was already sorted in RAM, writing the SSTable is a purely sequential streaming write to disk. **SSTables are immutable; they are never updated in-place.**

### 2. The Read Path and Bloom Filters

Because SSTables are immutable, updates to a row do not replace old files. Instead, they write a new version to a newer SSTable. When a read query arrives for key `"User_401"`, Cassandra must theoretically scan *every single SSTable on disk* because `"User_401"` could reside in any of them. To prevent this severe read amplification, Cassandra utilizes **Bloom Filters**.

A Bloom Filter is a highly space-efficient probabilistic data structure allocated in RAM. For every SSTable on disk, a corresponding Bloom Filter is held in memory.

- When a read arrives, Cassandra queries the Bloom Filter: *"Does this SSTable contain key `User_401`?"*
- **If the Bloom Filter says NO:** The key absolutely **does not** exist in that SSTable. Cassandra completely skips reading that file off disk.
- **If the Bloom Filter says YES:** The key **might** exist. Cassandra proceeds to read the SSTable index to locate the data. (There is a small, tunable probability of a False Positive, but never a False Negative).

```text
                      BLOOM FILTER PROBABILISTIC BIT ARRAY
   =============================================================================
   Key: "User_401" ──► Hash_1() ──► Index 2  ┐
                   ──► Hash_2() ──► Index 5  ┼──► Bit Array: [0, 0, 1, 0, 0, 1, 0]
                   ──► Hash_3() ──► Index 6  ┘                     2     5  6
                                                                  (All bits are 1)
                                                                MATCH = KEY MAY EXIST
```

### 3. Compaction

As SSTables accumulate, background threads trigger **Compaction**. Compaction reads multiple SSTables, merges their sorted keys, retains only the newest version of each record (discarding historical records and deleted markers called **Tombstones**), writes a new compacted SSTable, and deletes the old ones.

## Hands-On Configuration: Tuning Cassandra Compaction and Bloom Filters

When designing Cassandra tables for write-heavy or read-heavy applications, you can optimize disk usage, memory size, and read throughput directly inside your CQL (Cassandra Query Language) schemas.

### 1. Create a Write-Optimized Cassandra Table

For write-heavy applications (e.g., IoT metrics), we use **Size-Tiered Compaction Strategy (STCS)**, which is designed to minimize write amplification:

```sql
CREATE KEYSPACE telemetry_data
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};

USE telemetry_data;

CREATE TABLE device_metrics (
    device_id uuid,
    metric_time timestamp,
    metric_value double,
    PRIMARY KEY (device_id, metric_time)
) WITH compaction = {
    'class': 'SizeTieredCompactionStrategy',
    'max_threshold': 32,
    'min_threshold': 4
} AND bloom_filter_fp_chance = 0.01;
-- 1% False Positive chance strikes a balance between JVM heap size and read speed.
```

### 2. Tuning a Read-Heavy Table for Sub-Millisecond Reads

If you have a table where reads are frequent and latency is critical, you should switch to **Leveled Compaction Strategy (LCS)** and lower your Bloom Filter false-positive rate to 0.1%:

```sql
ALTER TABLE device_metrics WITH compaction = {
    'class': 'LeveledCompactionStrategy',
    'sstable_size_in_mb': 160
} AND bloom_filter_fp_chance = 0.001;
-- 0.1% chance ensures reads bypass almost all irrelevant SSTables,
-- but increases the Bloom Filter's RAM usage.
```

## Common Misconceptions

### Misconception 1: "Deleting a row in Cassandra instantly reclaims disk storage."

**Reality:** Because SSTables are immutable, executing a `DELETE` cannot erase data in-place. Instead, Cassandra writes a special record called a **Tombstone** (a marker showing the item was deleted). The old data and the Tombstone continue to consume disk space until **Compaction** runs, merges the SSTables, identifies that the Tombstone age has expired (controlled by `gc_grace_seconds`), and physically purges both the old data and the Tombstone from disk.

### Misconception 2: "If the Bloom Filter says a key exists, the database is guaranteed to find it."

**Reality:** Bloom Filters are probabilistic. A match only guarantees that the key **might** exist. If the filter returns a false positive, Cassandra will seek disk pages, read the index, discover the key is missing, and return empty. However, because Bloom Filters never return **false negatives**, you can rest assured that if the filter says "No", the key is guaranteed to be absent, completely protecting your SSDs from useless reads.

## Pause and Think

> **Critical Question:** If a node runs out of physical RAM and the JVM garbage collector begins aggressively swapping or crashing, why will Cassandra's read latencies suddenly skyrocket, even if the on-disk SSD storage is operating normally?

### Answer

Because Cassandra's read performance depends heavily on keeping both the **Bloom Filters** and the **SSTable Partition Key Caches** resident in off-heap physical RAM.

If RAM is exhausted or swapping occurs, these filters must be loaded from disk or suffer high latency, rendering the probabilistic O(1) checks obsolete and forcing the read engine to hit disk pages, collapsing query throughput.

## Key Takeaways

- **Cassandra bypasses random disk I/O** by executing all writes sequentially to a CommitLog and Memtable.
- **Memtables sort records dynamically in RAM** before streaming them sequentially to disk as SSTables.
- **SSTables are completely immutable**, preventing write collisions but generating multiple historical versions.
- **Bloom Filters are RAM-resident gatekeepers** that verify if an SSTable contains a key before hitting disk.
- **Compaction merges overlapping SSTables** in the background to reclaim storage and clear deleted tombstone markers.

## What to Learn Next

To expand your distributed database internals expertise, explore:

- Cassandra dynamic snitching and read-repair protocols for active anti-entropy.
- The difference between Size-Tiered (STCS), Leveled (LCS), and Time-Window Compaction (TWCS) strategies.
- Using Cassandra architecture within ScyllaDB (C++ rewrite) to maximize bare-metal execution.
