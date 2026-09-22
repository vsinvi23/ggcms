# LSM Trees in Go: The Append-Only Architecture of Modern NoSQL

## The Problem: The B-Tree Write Bottleneck
B-Trees rule relational databases because they optimize read paths. However, inserting a random key into a B-Tree forces the OS to fetch a 4KB disk page, modify a few bytes, and flush it back. This random write pattern, known as "write amplification," destroys SSD lifespan and cripples throughput on write-heavy NoSQL workloads (e.g., Cassandra, RocksDB, LevelDB). 

## Memory-Level Internals: The Append-Only Paradigm
The Log-Structured Merge (LSM) Tree solves this by banning random disk overwrites entirely. All writes are batched in RAM, and all disk I/O is strictly sequential (append-only), matching the maximum sequential throughput capabilities of underlying hardware.

The architecture splits into two arenas:
1. **MemTable**: An in-memory, self-balancing tree (usually a Red-Black Tree or Skip List).
2. **SSTables (Sorted String Tables)**: Immutable, sorted files on disk.

In Go, the MemTable is heavily optimized to avoid garbage collection pauses by using arena allocation or native slices inside a Skip List.

```go
package lsm

import "sync"

// Simplified MemTable using a Go map for illustration, 
// though production uses concurrent SkipLists
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
```

## The Write Path
1. The insert is appended to an on-disk Write-Ahead Log (WAL) for crash recovery.
2. The key-value pair is inserted into the in-memory MemTable.
3. Once the MemTable reaches a size limit (e.g., 4MB), it is frozen, and a new MemTable is spawned.
4. A background goroutine flushes the frozen MemTable sequentially to disk as an SSTable.

## The Read Path and Compaction
Reads check the MemTable first. If not found, they probe the on-disk SSTables from newest to oldest. Because SSTables are sorted, binary search (combined with Bloom Filters) guarantees fast lookups.

Over time, overlapping SSTables accumulate. A background "Compaction" process merges these files together, throwing away deleted keys (Tombstones) and overwritten values, producing new, cleaner SSTables. This background merging is the "Merge" in Log-Structured Merge Tree, trading off read latency and background CPU cycles for unparalleled write ingestion speeds.
