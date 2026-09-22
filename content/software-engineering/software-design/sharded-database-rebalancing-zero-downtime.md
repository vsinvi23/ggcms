---
title: "Zero-Downtime Sharded Database Rebalancing"
description: "How distributed databases move terabytes of data between shards without downtime, using a hash-ring topology and a double-write, background-copy, cutover, cleanup state machine."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "database-sharding"
  - "rebalancing"
  - "consistent-hashing"
  - "zero-downtime-migration"
  - "distributed-systems"
---

# Zero-Downtime Sharded Database Rebalancing

## The Problem: The Shard Imbalance

When a monolithic database exhausts vertical scaling, engineers shard it: data is distributed across multiple nodes based on a shard key (e.g., `user_id % 4` for 4 shards). This works well until one of two things happens:

1. **The cluster runs out of capacity** and a new shard must be added — going from 4 to 5 shards.
2. **A hotspot develops.** One shard fills or heats up far faster than the others because a subset of keys (a viral account, a popular tenant) generates disproportionate traffic.

If you naively change the routing formula to `user_id % 5`, the location of almost every record changes at once. A high-availability system cannot halt and redistribute terabytes of data while serving live traffic — that downtime is unacceptable.

## The Mental Model: Virtual Buckets on a Hash Ring

Modern distributed databases (Cassandra, DynamoDB, Redis Cluster) decouple the shard key from the physical server by mapping data onto a fixed set of **virtual buckets** (a hash ring), and having physical nodes claim ownership of *ranges* of those buckets.

```text
Hash space: 0 ────────────────────────────────────────── 9999

  Node A owns [0    - 3333]
  Node B owns [3334 - 6666]
  Node C owns [6667 - 9999]

  new user_id = 1042  --hash-->  4500  --falls in Node B's range--> routed to Node B
```

### Adding a Node Without a Full Reshard

When Node D joins the cluster, the system does **not** recompute a global modulo for every key. Instead, Node D claims a slice of an existing node's range — say, splitting Node C's `6667-9999` down to `6667-8333`:

```text
Before:  Node A [0-3333]   Node B [3334-6666]   Node C [6667-9999]
After:   Node A [0-3333]   Node B [3334-6666]   Node C [6667-8333]   Node D [8334-9999]
                                                        └── only THIS range's data moves ──┘
```

Only the data whose hash falls in `8334-9999` moves from Node C to Node D. Node A and Node B are completely untouched.

## The Rebalancing Process (Zero Downtime)

Moving potentially terabytes of data between two nodes takes real time. The system must keep serving reads and writes on that range throughout the move, using a multi-phase state machine coordinated by a routing proxy.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: PREPARE (double writes)                                    │
│   Reads  -> Node C (old owner)                                      │
│   Writes -> Node C AND Node D (both kept fresh)                     │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 2: BACKGROUND COPY                                             │
│   A background job streams Node C's pre-existing rows in this range │
│   to Node D. New writes are already landing on both, so the copy    │
│   only needs historical data that predates the migration.           │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 3: VALIDATE & CUTOVER                                          │
│   Writes pause for milliseconds; checksums/row counts verified;     │
│   topology flips:                                                    │
│   Reads  -> Node D (new owner)                                      │
│   Writes -> Node D only                                             │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 4: CLEANUP                                                     │
│   Node C is told it no longer owns this range and drops the rows,   │
│   freeing disk space.                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Preparation (Double Writing)

Node D is spun up and assigned the target hash range. The routing layer marks that range as **migrating**. Reads still go to Node C, the current owner, but writes are sent to *both* Node C and Node D, so Node D's copy of new data stays fresh from the moment migration starts.

### Phase 2: Background Copy

A background process iterates over the existing data in the target range on Node C and copies it to Node D. Because writes are already dual-routed, this copy only needs to move records that existed *before* the migration began — it never has to "catch up" to a moving target.

### Phase 3: Validation and Cutover

Once the background copy finishes, Node D holds both the historical data and every write made since migration started. The proxy briefly pauses writes, verifies checksums or row counts match between the two nodes, then flips the topology: reads and writes are now routed exclusively to Node D.

### Phase 4: Cleanup

Node C receives a signal that it no longer owns the migrated range. It drops the corresponding rows/tables, reclaiming the disk space.

## Key Takeaways

- Naive modulo sharding (`key % N`) forces a near-total data migration any time `N` changes — unacceptable for high-availability systems.
- Mapping data to virtual buckets on a hash ring, with physical nodes owning ranges of buckets, lets a single node join or leave while moving only its own slice of the keyspace.
- The double-write → background-copy → validate-and-cutover → cleanup state machine is the standard pattern for moving live data between shards without downtime.
- This is the same underlying idea as consistent hashing with virtual nodes — the ring is the mechanism; this rebalancing state machine is how you execute a change to that ring safely in production.
