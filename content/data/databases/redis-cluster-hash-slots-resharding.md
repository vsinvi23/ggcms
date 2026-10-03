---
title: "Redis Cluster: Hash Slots, Hash Tags, and Live Resharding"
description: "How Redis Cluster shards keys across 16384 hash slots with CRC16, how hash tags keep multi-key operations on one node, and the step-by-step MIGRATING/IMPORTING protocol behind live, zero-downtime resharding."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "redis"
  - "redis-cluster"
  - "hash-slots"
  - "resharding"
  - "sharding"
  - "distributed-systems"
---

# Redis Cluster: Hash Slots, Hash Tags, and Live Resharding

A single Redis instance holding a growing session or cache dataset eventually runs out of memory headroom, and vertical scaling stops being cost-effective. The naive fix — shard keys across servers in application code — works until a node needs to be added or removed: every client now needs to know the new routing table, and any window where routing is wrong means silent data loss or errors. Redis Cluster solves this by decoupling key routing from physical nodes entirely, then supporting live, client-transparent rebalancing on top of that indirection.

## The Scaling and Rebalancing Problem

Client-side sharding requires application code to manage routing topology, handle node failures, and accept serious data-loss risk during topology changes. A cluster-native approach must distribute keys dynamically, support seamless live resharding without client-facing downtime, and guarantee that multi-key operations stay localized to a single node.

## Mental Model: The 16384 Hash Slot Space

Redis Cluster divides the entire keyspace into exactly 16384 virtual partitions called **hash slots**, independent of how many physical nodes exist.

```text
+-------------+      CRC16(key) % 16384      +---------------------+
|   Client    |----------------------------->|  Hash Slots (16384) |
+-------------+                              +---------------------+
                                                        |
                     +----------------------------------+------------------+
                     |                                  |                  |
                     v                                  v                  v
       +----------------------------+    +----------------------------+  +------------------+
       | Node A (Slots 0 - 5460)    |    | Node B (Slots 5461 - 10922)|  | Node C (10923...) |
       |  - Migrating slot 1000 --->|    |  <- Importing slot 1000    |  +------------------+
       +----------------------------+    +----------------------------+
```

When a new master node joins, the cluster manager shifts a range of hash slots to it. When a node is decommissioned, its slots are split among the remaining active nodes.

## Deep Architectural Internals

### Hash slot hashing and hash tags

Keys map to slots via `slot = CRC16(key) & 16383`. For multi-key commands — transactions (`MULTI`/`EXEC`), set intersections — Redis Cluster requires every involved key to live in the exact same hash slot on the same physical node. **Hash tags** satisfy this without giving up sharding: if a key contains curly braces `{...}`, only the text inside the braces is hashed. For example:

- `{user100}:profile` hashes only `user100`
- `{user100}:orders` hashes only `user100`

Both keys are guaranteed to map to the same slot and node, so a multi-key operation touching both is safe.

### Live node resharding and redirections

Resharding moves hash slots between physical masters without stopping the cluster, step by step per slot:

1. **State flags.** The cluster manager tells Node A (source) that slot 1000 is moving: `CLUSTER SETSLOT 1000 MIGRATING <Node-B-ID>`. It tells Node B (target): `CLUSTER SETSLOT 1000 IMPORTING <Node-A-ID>`.
2. **Key migration.** The manager calls `CLUSTER GETKEYSINSLOT 1000 100` to retrieve keys on Node A, then fires `MIGRATE <Node-B-IP> <Node-B-Port> "" 0 5000 KEYS key1 key2 ...` to transfer keys atomically.
3. **Redirections.** During migration, if a client queries Node A for a key in slot 1000: if the key still exists on Node A, Node A processes it locally; if the key has already migrated, Node A replies with a temporary redirect: `-ASK 1000 <Node-B-IP>:<Node-B-Port>`.
4. **The ASKING handshake.** On receiving `-ASK`, the client connects to Node B, sends `ASKING`, then sends the original query. `ASKING` overrides Node B's import lock for slot 1000, letting it process the query even though the slot migration isn't finalized.
5. **Final transition.** Once all keys are migrated, the cluster manager broadcasts `CLUSTER SETSLOT 1000 NODE <Node-B-ID>` to update global topology. Subsequent requests to Node A for slot 1000 now yield a permanent redirect: `-MOVED 1000 <Node-B-IP>:<Node-B-Port>`. Clients cache this mapping locally to skip future redirection hops.

## Operational CLI Commands

```redis
# 1. Connect to the cluster and check topology
redis-cli -c -h 127.0.0.1 -p 7000 CLUSTER NODES

# 2. Mark slot 1000 as migrating on the source node (Node A)
redis-cli -h 127.0.0.1 -p 7000 CLUSTER SETSLOT 1000 MIGRATING target_node_id_abc123

# 3. Mark slot 1000 as importing on the target node (Node B)
redis-cli -h 127.0.0.1 -p 7001 CLUSTER SETSLOT 1000 IMPORTING source_node_id_xyz987

# 4. Fetch keys in slot 1000 from the source node
redis-cli -h 127.0.0.1 -p 7000 CLUSTER GETKEYSINSLOT 1000 50

# 5. Migrate the key from source to target node
redis-cli -h 127.0.0.1 -p 7000 MIGRATE 127.0.0.1 7001 "" 0 5000 KEYS "user100:profile"

# 6. Inform all cluster nodes of slot ownership change
redis-cli -h 127.0.0.1 -p 7000 CLUSTER SETSLOT 1000 NODE target_node_id_abc123
```

## Key Takeaways

- Redis Cluster shards by fixed hash slot (16384 total), not by physical node — nodes just own ranges of slots, so rebalancing is a slot-ownership change, not a data-model change.
- Hash tags (`{...}`) let you deliberately co-locate related keys on the same slot/node so multi-key operations stay safe under sharding.
- Live resharding is a five-step MIGRATING/IMPORTING protocol per slot, with `-ASK` handling in-flight redirects and `-MOVED` handling the final, cached topology update — all without pausing the cluster.
