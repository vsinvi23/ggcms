---
title: "Distributed ID Generation: Twitter Snowflake vs UUIDv4 vs UUIDv7"
description: "Why auto-incrementing IDs and random UUIDv4 both fail at scale, how Twitter Snowflake and time-ordered UUIDv7 solve B-Tree fragmentation, and which one to pick for your primary keys."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "distributed-ids"
  - "snowflake-id"
  - "uuid"
  - "uuidv7"
  - "primary-keys"
  - "database-indexing"
---

# Distributed ID Generation: Twitter Snowflake vs UUIDv4 vs UUIDv7

## The Problem: The B-Tree Massacre

Every record in a database needs a Primary Key. In the days of the monolith, we used Auto-Incrementing Integers (e.g., `SERIAL` in Postgres, `AUTO_INCREMENT` in MySQL). The database generated `1, 2, 3...` sequentially.

As we move to distributed systems, this breaks down. If you have 5 microservices creating orders simultaneously, they cannot all ask a single central database node for the next ID without creating a massive bottleneck and a single point of failure. The services need to generate IDs *locally* before inserting them into the database.

The naive solution is **UUIDv4**. It generates a 128-bit completely random string (e.g., `f47ac10b-58cc-4372-a567-0e02b2c3d479`). Because it's perfectly random, the chance of a collision is mathematically negligible.

However, UUIDv4 creates a hidden catastrophe in relational databases: **B-Tree Fragmentation**.
Relational databases store primary keys in a B-Tree index to allow fast lookups. B-Trees expect data to be inserted *in order*. When you insert completely random UUIDs, the database constantly has to split tree nodes and rebalance the tree. Page cache hit rates plummet, disk I/O skyrockets, and your insert performance degrades exponentially as the table grows.

```text
Sequential inserts (SERIAL / time-ordered ID)     Random inserts (UUIDv4)
┌───────────────────────────┐                     ┌───────────────────────────┐
│   B-Tree grows right,     │                     │  New key lands in a       │
│   append-only             │                     │  random leaf every time   │
│                           │                     │                           │
│      [10]                 │                     │        [ 77 ]             │
│     /    \                │                     │       /       \          │
│  [1-9]  [11-20]           │                     │   [existing]  [existing]  │
│           \  <- append    │                     │      ^ split & rebalance  │
│          [21..] new       │                     │        on every insert    │
└───────────────────────────┘                     └───────────────────────────┘
```

## The Mental Model: The License Plate

If an Auto-Incrementing ID is a sequential queue ticket (like at a deli), a UUIDv4 is a scratch-off lottery ticket.

We need something like a **License Plate**. A license plate often encodes the region (where it was made) and a sequence. To solve the database problem, we need to encode *Time*. If the ID begins with a timestamp, IDs generated later will naturally be larger than IDs generated earlier. The database will happily append them to the right side of the B-Tree index without fragmentation.

## Solution 1: Twitter Snowflake (The 64-bit King)

Twitter faced this problem at extreme scale and open-sourced the **Snowflake** algorithm. It generates a 64-bit integer that is globally unique, k-ordered (time-sortable), and can be generated completely independently by distributed nodes at a rate of tens of thousands per millisecond.

A 64-bit Snowflake is composed of:

```text
[ 1 bit (unused) ] [ 41 bits (Timestamp) ] [ 10 bits (Machine ID) ] [ 12 bits (Sequence) ]
```

1. **Timestamp (41 bits):** Milliseconds since a custom epoch. Gives you ~69 years of IDs. Because this is at the front, the IDs sort chronologically.
2. **Machine/Node ID (10 bits):** Identifies the specific worker/pod generating the ID. This prevents two different servers from generating the same ID at the exact same millisecond. Supports up to 1024 distinct nodes.
3. **Sequence (12 bits):** A counter starting at 0 that increments if the same machine generates multiple IDs within the exact same millisecond. Supports 4096 IDs per millisecond per node.

**Pros:** Fits in a standard `BIGINT` (8 bytes), making database storage and indexing incredibly efficient.
**Cons:** Requires infrastructure to manage the `Machine ID` (usually via ZooKeeper or etcd) so no two pods get the same ID.

### Reference Implementation (Go)

```go
package snowflake

import (
	"errors"
	"sync"
	"time"
)

const (
	epoch         int64 = 1700000000000 // custom epoch in ms
	nodeBits      uint8 = 10
	sequenceBits  uint8 = 12
	maxNodeID     int64 = -1 ^ (-1 << nodeBits)
	maxSequence   int64 = -1 ^ (-1 << sequenceBits)
	nodeShift     uint8 = sequenceBits
	timestampShift uint8 = sequenceBits + nodeBits
)

// Node generates 64-bit, time-sortable Snowflake IDs for a single worker/pod.
type Node struct {
	mu        sync.Mutex
	nodeID    int64
	lastTime  int64
	sequence  int64
}

func NewNode(nodeID int64) (*Node, error) {
	if nodeID < 0 || nodeID > maxNodeID {
		return nil, errors.New("node ID out of range")
	}
	return &Node{nodeID: nodeID}, nil
}

func (n *Node) NextID() int64 {
	n.mu.Lock()
	defer n.mu.Unlock()

	now := time.Now().UnixMilli() - epoch

	if now == n.lastTime {
		n.sequence = (n.sequence + 1) & maxSequence
		if n.sequence == 0 {
			// Sequence exhausted for this millisecond; spin until the clock advances.
			for now <= n.lastTime {
				now = time.Now().UnixMilli() - epoch
			}
		}
	} else {
		n.sequence = 0
	}

	n.lastTime = now
	return (now << timestampShift) | (n.nodeID << nodeShift) | n.sequence
}
```

## Solution 2: UUIDv7 (The New Standard)

While Snowflake is highly efficient, managing Machine IDs is annoying, and APIs often prefer standard UUID formats.

Enter **UUIDv7** (RFC 9562). It takes the standard 128-bit UUID format but re-engineers it to be time-sortable.

```text
[ 48 bits (Unix Timestamp ms) ] [ 4 bits (Version 7) ] [ 12 bits (Random/Counter) ] [ 2 bits (Variant) ] [ 62 bits (Random) ]
```

1. **Timestamp (48 bits):** Sits at the very front of the UUID. This guarantees that UUIDs generated consecutively will sort sequentially in the database B-Tree.
2. **Randomness (74 bits total):** Instead of relying on a strictly managed Machine ID like Snowflake, UUIDv7 relies on massive cryptographic randomness.

**Pros:** No coordination required between nodes. You just call a library function, and it works. Completely compatible with existing database `UUID` column types.
**Cons:** Takes up 128 bits (16 bytes) compared to Snowflake's 64 bits (8 bytes).

### Generating a UUIDv7 (Node.js)

```javascript
const crypto = require('crypto');

function uuidv7() {
  const unixTsMs = BigInt(Date.now());
  const rand = crypto.randomBytes(10); // 74 remaining random bits (rounded to bytes)

  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(Number(unixTsMs >> 16n), 0, 4);
  bytes.writeUIntBE(Number(unixTsMs & 0xffffn), 4, 2);

  // Version 7 in the high nibble of byte 6
  bytes[6] = 0x70 | (rand[0] & 0x0f);
  bytes[7] = rand[1];

  // Variant bits (10xxxxxx) in byte 8
  bytes[8] = 0x80 | (rand[2] & 0x3f);
  rand.copy(bytes, 9, 3, 10);

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

console.log(uuidv7()); // e.g. 018f1e2a-9c40-7abc-8def-1234567890ab
```

## Which Should You Choose?

- If you are building a hyper-scale, latency-sensitive system (like Discord or Twitter) where every byte counts, use **Twitter Snowflake**.
- If you are building standard enterprise microservices, want to avoid the operational headache of coordinating node IDs, and want native database UUID support without destroying your index performance, use **UUIDv7**. Stop using UUIDv4 for database primary keys.
