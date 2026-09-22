---
title: "Sharded Database Rebalancing: Moving Terabytes Without Downtime"
description: "How to relieve a hot database shard by migrating logical shards to a new physical node using a snapshot-and-replicate, dual-write, atomic-flip state machine, with a working Python router implementation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "database-sharding"
  - "rebalancing"
  - "dual-write"
  - "logical-shards"
  - "zero-downtime-migration"
---

# Sharded Database Rebalancing: Moving Terabytes Without Downtime

## The Problem: The Inevitability of Data Skew

Sharding — partitioning a large dataset across multiple database instances by a shard key like `user_id` or `tenant_id` — is standard practice once a single machine can no longer hold or serve a dataset. But data is almost never uniformly distributed. Over time, "hot shards" emerge: one tenant grows exponentially, or a subset of users becomes disproportionately active, exhausting the CPU, memory, or disk of the node holding their data.

When a physical node hits its capacity limit, some of its data has to move to another node — **rebalancing**. Doing this for terabytes of data, while continuing to serve thousands of reads and writes per second, without downtime or data corruption, is one of the hardest operational problems in distributed systems.

## The Architecture: Logical Shards vs Physical Nodes

The principle that makes online rebalancing possible is decoupling the **logical shard** from the **physical node** that currently hosts it. Instead of hashing directly to a physical server —

```text
node_index = hash(user_id) % num_physical_nodes   -- bad: tied to physical topology
```

— hash to a much larger, fixed number of logical shards, and maintain a separate routing table (typically in a consensus store like etcd or ZooKeeper) mapping logical shards to physical nodes:

```text
[ Application Servers ]
          │
          ▼
[ Routing Proxy / Middleware ] ── reads routing table from ──▶ [ etcd ]
          │
          │── Logical Shards 0-3333    ───▶ Physical Node A (hot)
          │── Logical Shards 3334-6666 ───▶ Physical Node B
          │── Logical Shards 6667-9999 ───▶ Physical Node C
```

When Node A gets overloaded, you don't rebuild the cluster — you migrate a *slice* of logical shards (say, 0-1000) off Node A onto a new Node D, and update the routing table.

## The Rebalancing State Machine

```text
[ NORMAL ] ──▶ [ COPYING (snapshot + binlog stream) ] ──▶ [ DUAL_WRITE ] ──▶ (atomic route flip) ──▶ [ NORMAL (on new node) ]
                                                                                                              │
                                                                                                    (async cleanup on source)
```

### 1. Snapshot and Replicate — state `COPYING`

Take a point-in-time snapshot of the logical shard on the source node and restore it on the target node. The routing table still points all traffic at the source. To capture writes that land during the copy, set up logical replication (MySQL binlog replication, or PostgreSQL logical decoding) from source to target, filtered to just that logical shard.

### 2. Dual Write — state `DUAL_WRITE`

Once the target has caught up to the source's replication position, the router enters dual-write mode:
- **Reads** still go exclusively to the source (the current source of truth).
- **Writes** are dispatched to *both* source and target, synchronously.

This validates that the target can sustain the real write throughput and that constraints (auto-increment IDs, unique indexes) behave correctly, without ever risking data loss — the source remains authoritative the entire time.

### 3. Atomic Flip — back to `NORMAL`

Once the dual-write queue is fully drained and stable, the control plane atomically updates the routing table in etcd. Both reads and writes now go exclusively to the target; the source stops receiving traffic for that logical shard.

## Implementation: Dual-Write Router in Python

```python
import etcd3
import logging

log = logging.getLogger("shard_router")

class ShardRouter:
    def __init__(self, etcd_client):
        self.etcd = etcd_client
        self.routing_cache = self.load_routing_table()

    def load_routing_table(self):
        # Loaded from etcd: {logical_shard_id: {"source": ..., "target": ..., "state": ...}}
        return {}

    def get_route(self, logical_shard_id):
        return self.routing_cache.get(logical_shard_id, {"state": "NORMAL"})

    def execute_write(self, logical_shard_id, query, params):
        route = self.get_route(logical_shard_id)

        if route["state"] == "NORMAL":
            return self.db_execute(route["source"], query, params)

        if route["state"] == "DUAL_WRITE":
            # Primary write goes to the source of truth first.
            primary_result = self.db_execute(route["source"], query, params)

            # Mirror the write to the migration target; failures here are logged,
            # not raised — the target isn't authoritative yet.
            try:
                self.db_execute(route["target"], query, params)
            except Exception as e:
                log.error("Failed to write to migration target: %s", e)

            return primary_result

        if route["state"] == "COPYING":
            # Target isn't ready for writes yet; source alone is authoritative.
            return self.db_execute(route["source"], query, params)

    def execute_read(self, logical_shard_id, query, params):
        route = self.get_route(logical_shard_id)
        # Reads always go to whichever node is currently authoritative for state.
        target_node = route["source"] if route["state"] != "FLIPPED" else route["target"]
        return self.db_execute(target_node, query, params)

    def db_execute(self, node, query, params):
        # Actual database execution against `node`.
        pass
```

## Handling Data Deletion

After the flip, the source node still holds the migrated data, wasting space. A background garbage-collection job iterates the source and hard-deletes rows belonging to the now-migrated logical shard range — heavily throttled, since an unthrottled bulk delete would spike I/O on a node that's still actively serving the logical shards that *didn't* move.

## Architectural Takeaway

Zero-downtime shard rebalancing rests on three pillars: decoupling logical shard identity from physical node placement, using native logical replication to keep a migration target continuously caught up, and performing the actual cutover as a single atomic routing-table update rather than a gradual transition. Done correctly, a system can move terabytes of live data under heavy production load with no client-visible interruption — done incorrectly (skipping the dual-write validation step, or flipping routing before replication has fully caught up), it's a direct path to silent data loss.
