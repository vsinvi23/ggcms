# Sharded Database Rebalancing: Moving Terabytes of Data Without Database Downtime

## The Problem: The Hot Shard and Capacity Limits
Database sharding distributes data across multiple independent nodes to scale horizontally. However, data growth is rarely uniform. Over time, a subset of shards may receive a disproportionate amount of traffic (a "hot shard") or exceed their storage capacity. When this happens, data must be rebalanced—migrated from overloaded shards to new or underutilized ones—without interrupting live traffic or violating data consistency.

## Rebalancing Strategies

### 1. The Naive Approach: Stop the World
The simplest method is to pause writes, copy data to the new shard, update the routing logic, and resume writes. 
**Verdict:** Unacceptable for high-availability systems. Downtime translates directly to lost revenue.

### 2. Dual Writing (The Migration Pipeline)
To move data without downtime, we must decouple the migration into discrete, reversible phases.

#### Phase 1: Provision and Dual Write
Provision the new shard (Shard B). Update the application layer or database proxy to write to *both* the old shard (Shard A) and Shard B for the migrating keyspace.
*Note:* Reads continue to go exclusively to Shard A.

```text
[App Service] 
   |-- writes --> [Shard A (Old)]
   |-- writes --> [Shard B (New)]
```

#### Phase 2: Backfill Historical Data
A background worker processes the keyspace slated for migration. It reads historical records from Shard A and writes them to Shard B. 
**Crucial:** The backfill process must not overwrite newer data written by the Dual Write process. This requires conditional updates (`INSERT ... ON CONFLICT DO NOTHING` or timestamp-based merging).

#### Phase 3: Verification
Run a verification job that compares a checksum or row-by-row hash of the migrating keyspace on Shard A and Shard B. Any discrepancies are resolved by copying the authoritative record from A to B.

#### Phase 4: Flip Reads and Stop Old Writes
Update the routing table. Point reads for the migrated keyspace to Shard B. Once reads are verified stable, stop writing the keyspace to Shard A. Finally, drop the migrated data from Shard A to reclaim space.

## Architecture: Logical vs. Physical Shards
To simplify rebalancing, modern systems separate the concept of a *logical shard* from a *physical node*.

```text
Keyspace -> Hash(Key) -> Logical Shard ID -> Physical Node
```

Instead of moving raw data rows, we move Logical Shards.
1. A physical node holds multiple logical shards (e.g., Node 1 holds Shards 0-99).
2. To rebalance, we use database replication to replicate Shard 50 from Node 1 to Node 2.
3. Once synchronized, we update the routing table to point Logical Shard 50 to Node 2.

## Code Example: Routing Table Update
```go
type RoutingTable struct {
    LogicalShardMap map[int]string // ShardID -> NodeConnectionString
    mu              sync.RWMutex
}

func (r *RoutingTable) GetNode(key string) string {
    r.mu.RLock()
    defer r.mu.RUnlock()
    
    shardID := hash(key) % TotalLogicalShards
    return r.LogicalShardMap[shardID]
}

// Atomic update during Phase 4
func (r *RoutingTable) UpdateRoute(shardID int, newNode string) {
    r.mu.Lock()
    defer r.mu.Unlock()
    r.LogicalShardMap[shardID] = newNode
}
```

## Challenges and Mitigation
- **Replication Lag:** During Phase 4, there might be brief replication lag. Pausing writes to the specific logical shard for a few milliseconds during the final routing flip ensures strict consistency.
- **Foreign Keys:** Sharding breaks foreign key constraints. Denormalize data or enforce relationships at the application level before migrating.

Zero-downtime rebalancing requires treating data migration as an application-level pipeline rather than a simple database operation.
