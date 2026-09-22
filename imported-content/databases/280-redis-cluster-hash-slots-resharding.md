# Redis Cluster: Navigating the 16384 Hash Slots and Live Node Resharding

## The Scaling and Rebalancing Problem
When an application's dataset outgrows the physical memory limit of a single Redis server, scaling vertically becomes cost-prohibitive. While manually partitioning keys on the client side solves the basic storage bottleneck, it introduces operational nightmares. Client-side sharding requires application code to manage routing topology, handle node failures, and face severe data-loss risks during topology changes. A distributed, cluster-native approach must distribute keys dynamically, support seamless live resharding without client-facing downtime, and guarantee that multi-key operations remain localized.

## Mental Model: The 16384 Hash Slot Space
Redis Cluster bypasses physical IP sharding by decoupling key routing from physical server nodes. Instead, the keyspace is divided into exactly 16384 virtual partitions called Hash Slots.

```
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

When a new master node joins, the cluster manager shifts a range of hash slots to it. When a node is decommissioned, its hash slots are split among the remaining active nodes. 

## Deep Architectural Internals

### Hash Slot Hashing and Hash Tags
To map a key to a hash slot, the cluster uses the CRC16 algorithm modulo 16384:
`slot = CRC16(key) & 16383`

For multi-key commands like transactions (`MULTI`/`EXEC`) or sets intersections, Redis Cluster requires all involved keys to reside in the exact same hash slot on the same physical node. To satisfy this requirement without losing sharding benefits, Redis supports Hash Tags. If a key contains curly braces `{...}`, only the text inside the braces is hashed. For example:
- `{user100}:profile` hashes only the string `user100`
- `{user100}:orders` hashes only the string `user100`

Both keys are guaranteed to map to the same hash slot and physical node, enabling safe multi-key operations.

### Live Node Resharding and Redirections
Resharding moves hash slots between physical masters without stopping the cluster. The process runs step-by-step per slot:

1. **State Flags**: The cluster manager tells Node A (source) that slot 1000 is moving: `CLUSTER SETSLOT 1000 MIGRATING <Node-B-ID>`. It tells Node B (target): `CLUSTER SETSLOT 1000 IMPORTING <Node-A-ID>`.
2. **Key Migration**: The manager calls `CLUSTER GETKEYSINSLOT 1000 100` to retrieve keys on Node A. It then fires `MIGRATE <Node-B-IP> <Node-B-Port> "" 0 5000 KEYS key1 key2 ...` to transfer keys atomically.
3. **Redirections**: During migration, if a client queries Node A for a key in slot 1000:
   - If the key still exists on Node A, Node A processes it locally.
   - If the key has already migrated to Node B, Node A replies with a temporary redirection: `-ASK 1000 <Node-B-IP>:<Node-B-Port>`.
4. **The ASKING Handshake**: Upon receiving an `-ASK` redirection, the client connects to Node B, sends the `ASKING` command, and then sends the original query. The `ASKING` command overrides Node B's import lock for slot 1000, allowing it to process the query.
5. **Final Transition**: Once all keys are migrated, the cluster manager broadcasts a `CLUSTER SETSLOT 1000 NODE <Node-B-ID>` command to the cluster, updating global topology. Subsequent requests to Node A for slot 1000 yield a permanent redirection: `-MOVED 1000 <Node-B-IP>:<Node-B-Port>`. Clients cache this mapping locally to bypass future redirection hops.

## Operational CLI Commands
The following Redis CLI sequence demonstrates manual slot resharding and tracking:

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

This structural separation of keys into virtual slots guarantees Redis Cluster remains highly elastic and available.
