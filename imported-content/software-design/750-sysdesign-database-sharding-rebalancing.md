# Sharded Database Rebalancing: Moving Terabytes of Data Without Database Downtime

## The Problem: The Inevitability of Data Skew

Database sharding—partitioning a massive dataset across multiple database instances—is standard practice for scaling beyond the limits of a single machine. Usually, a shard key (e.g., `user_id` or `tenant_id`) maps to a specific shard. 

However, data is rarely uniformly distributed. Over time, "hot shards" emerge. A specific tenant might grow exponentially, or a subset of users might become extremely active, exhausting the CPU, memory, or disk space of their designated shard. When a physical node reaches its capacity limit, the system must undergo **rebalancing**: moving data from one shard to another.

Moving terabytes of data while continuously serving thousands of reads and writes per second, without incurring downtime or data corruption, is one of the most complex operational challenges in distributed systems.

## The Architecture: Logical vs. Physical Sharding

The fundamental architectural principle that makes rebalancing possible is decoupling the **Logical Shard** from the **Physical Node**.

Instead of hashing a `user_id` directly to a physical database server (`hash(user_id) % num_nodes`), we hash it to a Logical Shard (`hash(user_id) % 10000`). We then maintain a routing table (often stored in a consensus store like etcd or ZooKeeper) that maps Logical Shards to Physical Nodes.

```text
[ Application Servers ]
         |
         v
[ Routing Proxy / Middleware ] ---> Reads Routing Table from [ etcd ]
         |
         |-- Logical Shards 0-3333   ---> Physical Node A (Hot)
         |-- Logical Shards 3334-6666 ---> Physical Node B
         |-- Logical Shards 6667-9999 ---> Physical Node C
```

When Node A becomes overloaded, we don't need to rebuild the entire cluster. We simply migrate a chunk of Logical Shards (e.g., 0-1000) from Node A to a new Node D.

## The Rebalancing State Machine

To move a Logical Shard without downtime, we execute a state machine orchestrated by a background control plane.

### 1. Snapshot and Replication (State: COPYING)
We take a point-in-time snapshot of the Logical Shard on the Source Node and restore it on the Target Node. During this time, the routing table still points all traffic to the Source Node. To capture ongoing changes, we set up logical replication (e.g., MySQL binlog replication or PostgreSQL logical decoding) from the Source to the Target, filtered strictly for the specific Logical Shard.

### 2. Dual Write / Read Source (State: DUAL_WRITE)
Once the Target Node catches up with the replication lag, the routing proxy enters a `DUAL_WRITE` phase. 
- **Reads** continue to go exclusively to the Source Node.
- **Writes** are dispatched to *both* the Source and Target nodes synchronously. 

This step verifies that the Target Node can handle the write throughput and that constraints (like auto-increment IDs) are functioning correctly without risking data consistency, as the Source is still the source of truth.

### 3. Read Target / Write Target (State: FLIP)
Once the dual-write queue is fully synced and stable, the control plane atomically updates the routing table in etcd. The state flips.
- Both reads and writes are routed exclusively to the Target Node.
- The Source Node no longer receives traffic for this Logical Shard.

```text
Rebalancing State Machine:

[ NORMAL ] ---> [ COPYING (Snapshot + Binlog) ] ---> [ DUAL_WRITE ] ---> (Atomic Route Flip) ---> [ NORMAL (New Node) ]
                                                                                                        |
                                                                                                (Async Cleanup on Source)
```

## Robust Code: Implementing Dual-Write in the Router

Here is a simplified Python representation of how a data access layer handles dual writes during a migration transition.

```python
import etcd3

class ShardRouter:
    def __init__(self, etcd_client):
        self.etcd = etcd_client
        self.routing_cache = self.load_routing_table()

    def get_route(self, logical_shard_id):
        # Returns route config: {"source": "db-a", "target": "db-d", "state": "DUAL_WRITE"}
        return self.routing_cache.get(logical_shard_id)

    def execute_write(self, logical_shard_id, query, params):
        route = self.get_route(logical_shard_id)
        
        if route["state"] == "NORMAL":
            return self.db_execute(route["source"], query, params)
            
        elif route["state"] == "DUAL_WRITE":
            # Primary write to source (Source of Truth)
            primary_result = self.db_execute(route["source"], query, params)
            
            # Asynchronous or synchronous write to target
            try:
                self.db_execute(route["target"], query, params)
            except Exception as e:
                # Log error, potentially increment metric. Target is not yet source of truth.
                log.error(f"Failed to write to migration target: {e}")
                
            return primary_result

    def db_execute(self, node, query, params):
        # Actual database execution logic
        pass
```

## Handling Data Deletion
After the flip, the data remains on the Source Node, taking up space. The control plane runs an asynchronous garbage collection job that iterates over the Source Node and hard-deletes the records belonging to the migrated Logical Shard. This must be heavily throttled to avoid spiking the source database's I/O and impacting the performance of the logical shards that still reside there.

Sharded database rebalancing relies heavily on decoupling logical boundaries from physical hardware, robust logical replication, and highly coordinated state flips in the routing layer. When executed correctly, a system can fluidly reallocate terabytes of data seamlessly under heavy load.