# Go Maps Under the Hood: Hash Buckets, Collisions, and Eviction

In Go, the `map` type is a workhorse of daily development. Developers treat map reads and writes as simple, atomic $O(1)$ operations. However, at scale, naive hash map implementations suffer from performance degradation, excessive memory allocations, and stop-the-world rehashing latencies. To maintain fast, predictable performance, Go implements an optimized, bucket-based hash map engine under the hood.

Understanding Go's map internals is essential for writing high-performance Go applications.

---

## The Problem: The High Cost of Naive Hashing

A naive hash map maps keys to array indices using a hash function. If two distinct keys hash to the same index (a collision), the map must resolve it. Common approaches include open addressing or chaining.

At scale, both strategies suffer:
1. **Open Addressing** causes cluster formation, leading to search times that degrade to $O(N)$.
2. **Chaining** allocates a new node for every single key-value insertion, causing severe memory fragmentation and garbage collection (GC) overhead.
3. **Rehashing** typically freezes the application while allocating a double-sized array and migrating all items at once.

---

## The Mental Model: hmap and bmap Structs

Go resolves these problems by grouping key-value pairs into fixed-size **buckets**. A Go map is defined internally by the runtime as a pointer to an `hmap` struct, which references an array of `bmap` (bucket) structs.

### The Anatomy of hmap
```
hmap Struct
┌──────────────────────────────────────────────┐
│  count (int) - Number of elements            │
│  flags (uint8) - State flags                 │
│  B     (uint8) - log_2 of bucket count       │
│  buckets (unsafe.Pointer) - Active buckets   │
│  oldbuckets (unsafe.Pointer) - Old buckets   │
│  nevacuate (uintptr) - Evacuation progress   │
└──────────────────────────────────────────────┘
```

### The Anatomy of a Bucket (bmap)
Each `bmap` holds exactly **8 key-value pairs** in a memory-optimized layout:

```
bmap (Bucket) Memory Layout
┌──────────────────────────────────────────────┐
│  tophash [8]uint8 - High 8 bits of hashes     │
├──────────────────────────────────────────────┤
│  keys    [8]KeyType                           │
├──────────────────────────────────────────────┤
│  values  [8]ValueType                         │
├──────────────────────────────────────────────┤
│  overflow (*bmap) - Pointer to next bucket   │
└──────────────────────────────────────────────┘
```

**Why is it structured this way?**
By grouping 8 keys together followed by 8 values, Go avoids padding bytes that would otherwise be required for memory alignment if keys and values alternated.

---

## Collision Resolution: Overflow Buckets

When a key is hashed, Go uses the low-order bits of the hash to select a bucket index. It then uses the high-order 8 bits (`tophash`) to quickly scan the bucket for the key.

If all 8 slots in a selected bucket are full, Go does not resize the map immediately. Instead, it allocates a new `bmap` and links it via the `overflow` pointer, forming a linked list of buckets.

```
Index -> [ bmap Primary ] ──overflow──> [ bmap Overflow ]
         ├── tophash [8]                ├── tophash [8]
         ├── keys    [8]                ├── keys    [8]
         └── values  [8]                └── values  [8]
```

---

## Growth and Incremental Evacuation (Eviction)

To prevent search times from degrading, Go triggers map growth when either of two thresholds is crossed:

1. **Load Factor Limit**: The number of elements divided by the number of buckets exceeds **6.5**.
2. **Too Many Overflow Buckets**: The number of overflow buckets is approximately equal to the active bucket count.

### Double-Size Growth
When the load factor is exceeded, Go doubles the bucket count ($B = B + 1$). To avoid a massive latency spike, Go performs **incremental evacuation**. 

Instead of rehashing all keys immediately:
- Go points `oldbuckets` to the current bucket array and allocates a new, double-sized array to `buckets`.
- During subsequent map writes or deletes, Go evacuates (evicts and copies) the old bucket corresponding to the accessed index—and one additional sequential bucket—to the new array.
- This spreads the cost of rehashing across many small operations, ensuring operations remain highly responsive.

```
Evacuation Process:
oldbuckets [ Bucket 0 ] ─────────► buckets [ New Bucket 0 ] (Keys split by high bit)
                                  └────────► buckets [ New Bucket N ] 
```

---

## Code Investigation: Examining Map Overhead

We can observe how Go map allocations scale by using a benchmark script to track heap allocations.

```go
package main

import (
	"fmt"
	"runtime"
)

func printMemUsage() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("Alloc = %v KiB, TotalAlloc = %v KiB\n", m.Alloc/1024, m.TotalAlloc/1024)
}

func main() {
	printMemUsage()

	// Pre-allocating map prevents incremental growth overheads
	capacity := 100_000
	m := make(map[int]int, capacity)

	for i := 0; i < capacity; i++ {
		m[i] = i
	}

	printMemUsage()
}
```

Pre-sizing maps via `make(map[K]V, capacity)` allocates the required buckets upfront, entirely bypassing incremental bucket evacuation during runtime.
