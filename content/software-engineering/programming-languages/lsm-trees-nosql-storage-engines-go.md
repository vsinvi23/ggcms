---
title: "LSM Trees in Go: The Append-Only Architecture Behind Modern NoSQL"
description: "Why B-Tree write amplification cripples write-heavy workloads, how Log-Structured Merge Trees turn random writes into sequential ones with a MemTable, WAL, and SSTables, and how compaction reclaims space in Go-based storage engines."
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "golang"
  - "lsm-tree"
  - "nosql"
  - "storage-engines"
  - "data-structures"
  - "write-ahead-log"
---

# LSM Trees in Go: The Append-Only Architecture of Modern NoSQL

## The Problem: The B-Tree Write Bottleneck

B-Trees rule relational databases because they optimize read paths. However, inserting a random key into a B-Tree forces the OS to fetch a 4KB disk page, modify a few bytes, and flush it back. This random write pattern, known as write amplification, destroys SSD lifespan and cripples throughput on write-heavy NoSQL workloads (e.g., Cassandra, RocksDB, LevelDB).

Imagine a time-series metrics store ingesting a million writes per second from thousands of hosts. Keys arrive in essentially random order (`host-42-cpu-1706312`, `host-9-mem-1706313`, ...). A B-Tree would scatter these across the entire tree, forcing a random disk seek and page rewrite for nearly every insert. On spinning disks this is catastrophic; even on SSDs, it burns write endurance and stalls throughput under contention.

## Memory-Level Internals: The Append-Only Paradigm

The Log-Structured Merge (LSM) Tree solves this by banning random disk overwrites entirely. All writes are batched in RAM, and all disk I/O is strictly sequential (append-only), matching the maximum sequential throughput capabilities of underlying hardware.

The architecture splits into two arenas:

1. **MemTable:** An in-memory, self-balancing tree (usually a red-black tree or skip list).
2. **SSTables (Sorted String Tables):** Immutable, sorted files on disk.

```text
                              LSM TREE WRITE PATH

  Write(key, val)
        |
        v
  +-----------------+       +--------------------+
  | Write-Ahead Log |  ---> | Append to disk,     |   Sequential I/O only —
  | (WAL)           |       | fsync for durability |   survives a crash before
  +-----------------+       +--------------------+   the MemTable is flushed
        |
        v
  +-----------------+
  | MemTable        |   In-memory sorted structure (skip list / RB-tree)
  | (RAM, sorted)   |   Reads and writes served here first
  +-----------------+
        |  size > threshold (e.g. 4MB)
        v
  +-----------------+       +--------------------+
  | Frozen MemTable | --->  | Flush sequentially  | ---> SSTable-0 (immutable, sorted, on disk)
  +-----------------+       +--------------------+
                                                          SSTable-1
                                                          SSTable-2
                                                          ...
                             +-------------------------+
                             | Background Compaction   |  merges overlapping SSTables,
                             | (merge, drop tombstones) |  drops deleted/overwritten keys
                             +-------------------------+
```

In Go, the MemTable is heavily optimized to avoid garbage collection pauses by using arena allocation or native slices inside a skip list rather than one heap-allocated node per key.

```go
package lsm

import "sync"

// Simplified MemTable using a Go map for illustration,
// though production engines use concurrent skip lists to preserve sort order.
type MemTable struct {
    mu   sync.RWMutex
    data map[string][]byte
    size int
}

func (m *MemTable) Put(key string, val []byte) {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.data[key] = val
    m.size += len(key) + len(val)

    // Trigger flush if size exceeds threshold (e.g., 4MB)
}

func (m *MemTable) Get(key string) ([]byte, bool) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    val, ok := m.data[key]
    return val, ok
}
```

## The Write Path

1. The insert is appended to an on-disk write-ahead log (WAL) for crash recovery — this is the only synchronous disk write on the hot path, and it is purely sequential.
2. The key-value pair is inserted into the in-memory MemTable.
3. Once the MemTable reaches a size limit (e.g., 4MB), it is frozen, and a new MemTable is spawned to accept further writes.
4. A background goroutine flushes the frozen MemTable sequentially to disk as an SSTable.

## The Read Path and Compaction

Reads check the MemTable first. If not found, they probe the on-disk SSTables from newest to oldest. Because SSTables are sorted, binary search (combined with Bloom filters to skip SSTables that provably do not contain the key) guarantees fast lookups without touching every file on disk.

```go
// Simplified read path: check MemTable, then SSTables newest-first.
func (db *LSMStore) Get(key string) ([]byte, bool) {
    if val, ok := db.mem.Get(key); ok {
        return val, val != nil // nil value with ok=true means a tombstone (deleted)
    }
    for i := len(db.sstables) - 1; i >= 0; i-- {
        if val, found := db.sstables[i].Lookup(key); found {
            return val, val != nil
        }
    }
    return nil, false
}
```

Over time, overlapping SSTables accumulate. A background "compaction" process merges these files together, throwing away deleted keys (tombstones) and superseded values, producing new, cleaner SSTables. This background merging is the "merge" in Log-Structured Merge Tree, trading off read latency and background CPU cycles for unparalleled write ingestion speeds.

## What Can Go Wrong?

* **Read amplification:** Without compaction and Bloom filters, a read for a key that was written long ago may have to check dozens of SSTables before finding it (or confirming it does not exist).
* **Space amplification:** Old, overwritten, or deleted values linger on disk until compaction runs, so LSM-based stores typically use meaningfully more disk space than the logical dataset size.
* **Compaction stalls:** If write throughput outpaces compaction throughput, SSTable count grows unbounded, and both read latency and space usage degrade — most production tuning knobs (Cassandra's `compaction_throughput`, RocksDB's `level0_slowdown_writes_trigger`) exist to manage this trade-off.

## Key Takeaways

* LSM Trees trade read amplification and background compaction CPU for the ability to accept writes at sequential-disk speed instead of random-disk speed.
* The write path is WAL (durability) -> MemTable (speed) -> SSTable flush (persistence) -> background compaction (reclaiming space and bounding read cost).
* Bloom filters are what make multi-SSTable reads practical — without them, a miss would require checking every SSTable on disk.
* This is the storage engine underneath Cassandra, RocksDB, LevelDB, and (in spirit) Bitcask-style key-value stores.
