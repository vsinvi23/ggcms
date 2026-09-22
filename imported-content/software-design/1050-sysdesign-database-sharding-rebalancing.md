# Sharded Database Rebalancing: Moving Terabytes of Data Without Database Downtime

## The Problem: Hotspots and Capacity Limits

As a dataset grows beyond the capacity of a single monolithic database node, horizontal scaling (sharding) becomes necessary. Data is partitioned across multiple database instances (shards) based on a Shard Key (e.g., `user_id` or `tenant_id`). 

However, sharding is rarely a one-time operation. Over time, data distribution becomes skewed:
- **Storage Imbalance:** Certain shards accumulate vastly more data than others (e.g., "power users" generating huge volumes of activity).
- **Compute Hotspots:** Specific shards experience significantly higher read/write IOPS, saturating CPU or memory while other shards remain idle.

To resolve these imbalances, the system must perform **Shard Rebalancing**: migrating chunks of data from a hot shard to a cold shard (or to a newly provisioned shard). The critical constraint is that this migration must happen online, with zero downtime and no dropped transactions.

## Architecture: Logical Sharding and Routing

Rebalancing is impossible if the application hardcodes the physical location of a shard. To enable movement, we must decouple the logical partition from the physical database node.

1. **Logical Shards (Partitions/Buckets):** The entire keyspace is divided into a fixed number of logical shards (e.g., 4096 or 8192).
2. **Routing Table (Topology Map):** A highly available configuration store (like ZooKeeper, etcd, or Consul) maintains the mapping of Logical Shard -> Physical Node.
3. **Smart Client / Proxy:** Applications or database proxies (e.g., Vitess, ProxySQL) consult the routing table to direct queries.

```text
[ Application ] ---> (Hash(user_id) % 4096) = Logical Shard 1042
      |
      v
[ Routing Proxy ] ---> Reads Topology: Shard 1042 lives on Node B
      |
      v
[ DB Node A ]   [ DB Node B ]   [ DB Node C ]
(Shards 0-1000) (Shards 1001-2000) (Shards 2001-4096)
```

## The Zero-Downtime Migration Process

Moving Terabytes of data while continuing to serve read/write traffic requires a phased, asynchronous approach. The process resembles a localized replication stream.

### Phase 1: Snapshot and Bulk Copy

The migration controller initiates the move of a Logical Shard (e.g., Shard X) from Source Node A to Target Node B.
1. The Source Node creates a consistent snapshot of the data belonging to Shard X.
2. The snapshot is bulk-loaded into the Target Node.
During this phase, Node A continues to serve all read and write traffic for Shard X.

### Phase 2: Catch-Up (Logical Replication)

Because the bulk copy takes time, the Target Node's data is immediately out of date. 
1. The migration controller tails the Write-Ahead Log (WAL) or replication log of Node A, filtering for changes specifically impacting Shard X.
2. These delta changes are continuously applied to Node B.
3. This process continues until Node B is nearly caught up (replication lag approaches zero).

```text
(Phase 2: Catching Up)
[ Node A (Source) ] ---WAL Stream (Filtered) ---> [ Node B (Target) ]
  |-- Shard X Data                                   |-- Shard X Data (Syncing)
  |-- (Serving Reads/Writes)                         |-- (Not yet serving traffic)
```

### Phase 3: The Cutover (Brief Write Pause)

To safely switch traffic without data loss, a brief, coordinated lock is required.
1. The routing proxy is instructed to pause **writes** to Shard X (reads can often still be served by Node A).
2. The system waits for the replication stream to drain completely, ensuring Node B is 100% consistent with Node A for Shard X.
3. The routing table is atomically updated: `Shard X -> Node B`.
4. The proxy unpauses writes and directs all new traffic for Shard X to Node B.

The "downtime" is only the duration of step 2 and 3, which is typically a few milliseconds.

### Phase 4: Cleanup

Once traffic is successfully flowing to Node B, the old data for Shard X is asynchronously deleted from Node A to free up storage space.

## Handling Failures and Edge Cases

- **Schema Changes During Migration:** Migrations must lock DDL changes on the migrating shard to prevent the source and target schemas from diverging.
- **Rollback:** If the cutover fails or Target Node B shows high latency immediately after cutover, the system can instantly roll back by updating the routing table back to Node A (assuming Node A hasn't dropped the data yet and replication is temporarily reversed).
- **Throttling:** Bulk copying can easily saturate network bandwidth or disk I/O on the Source Node, negatively impacting production traffic. The migration controller must dynamically throttle the copy rate based on the Source Node's load.

## Code Example: Proxy Routing Logic

```go
// Simplified proxy routing logic
func HandleQuery(query Query) {
    shardKey := extractShardKey(query)
    logicalShardId := hash(shardKey) % 4096
    
    topology := topologyManager.GetState()
    routeInfo := topology.GetRoute(logicalShardId)
    
    if routeInfo.State == "MIGRATING" && query.IsWrite() {
        // Queue or pause write briefly during cutover
        waitForCutover(logicalShardId)
        topology = topologyManager.GetState()
        routeInfo = topology.GetRoute(logicalShardId)
    }
    
    physicalNode := routeInfo.PhysicalNode
    executeOnNode(physicalNode, query)
}
```

## Conclusion

Sharded database rebalancing is a complex dance of bulk data movement, WAL tailing, and atomic topology updates. By leveraging logical sharding and smart routing proxies, systems can transparently migrate data across physical boundaries, dynamically resolving hotspots without subjecting users to maintenance windows.
