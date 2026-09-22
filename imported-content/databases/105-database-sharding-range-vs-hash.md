# Database Partitioning: Range-based vs Hash-based Sharding

## The Problem: The Monolithic Database Ceiling
As a monolithic database grows to terabytes of data, single-node vertical scaling (adding RAM and CPU) eventually becomes economically and physically impossible. Indexes no longer fit in memory, resulting in massive disk I/O, and concurrent write contention bottlenecks throughput.

To achieve horizontal scale, we must split the data across multiple independent database nodes (shards). The critical engineering decision is: *How do we determine which row goes to which shard?*

## The Solution: Algorithmic Sharding Strategies
Sharding requires selecting a "Shard Key" (a column, like `user_id` or `created_at`) and applying a routing algorithm. The two most dominant algorithms in distributed databases are Range-based sharding and Hash-based sharding. Choosing the wrong one can lead to "hotspots," where one node is crushed under load while others sit idle.

### Mental Model: Filing Cabinets
**Range-based:** You have 3 filing cabinets. Cabinet 1 holds last names A-H, Cabinet 2 holds I-Q, Cabinet 3 holds R-Z. 
**Hash-based:** You have 3 filing cabinets. You take a person's ID, run it through a mathematical function, and it randomly but deterministically assigns them to a cabinet.

```text
[ Application ]
       | (Shard Key: "user_123")
       v
[ Router / Proxy ] ---> Algorithm determines destination
       |
  +----+----+
  |         |
[ S1 ]    [ S2 ]
```

## Deep Dive: Range-based Sharding

In Range sharding, data is divided into contiguous, non-overlapping ranges based on the shard key.

**Example:** Sharding a massive `orders` table by `created_date`.
- Shard 1: Jan 2023 to June 2023
- Shard 2: July 2023 to Dec 2023

### Pros
- **Efficient Range Queries:** If an application asks `SELECT * WHERE created_date BETWEEN '2023-02-01' AND '2023-04-01'`, the router knows exactly that *only* Shard 1 has this data. It queries a single node.
- **Easy Data Lifecycle Management:** Archiving old data is as simple as dropping the oldest shard.

### Cons
- **Hotspots:** If you shard by date, all *new* inserts go to the most recent shard. Shards 1 through 9 are idle, while Shard 10 (the current month) takes 100% of the write traffic, completely defeating the purpose of horizontal write scaling.

## Deep Dive: Hash-based Sharding

In Hash sharding, the router passes the shard key through a hash function (like MD5 or MurmurHash) and performs a modulo operation against the number of shards.

**Example:** Sharding by `user_id`.
`Hash("user_123") % 4 = Shard 2`

### Pros
- **Perfect Data Distribution:** Because hash functions output uniformly distributed numbers, writes and reads for specific users are perfectly balanced across all shards. Write hotspots are virtually eliminated.

### Cons
- **Scatter-Gather Queries:** If the application asks `SELECT * WHERE age > 25`, the shard key (`user_id`) is useless here. The router must query *all* shards simultaneously, gather the results over the network, merge them, and return them. This is highly inefficient.
- **Resharding Complexity:** If you have 4 shards and add a 5th, the modulo math (`% 4` vs `% 5`) changes for *every single record*. A massive data migration is required (unless Consistent Hashing is used).

## Hybrid Approach: Consistent Hashing
Modern NoSQL databases (like Cassandra and DynamoDB) use Hash sharding implemented via a "Hash Ring" (Consistent Hashing). This maintains the perfect load distribution of hashing but minimizes data movement when adding or removing nodes.

## Conclusion
The choice between Range and Hash sharding is dictated purely by the application's query access patterns. 
- If the workload relies heavily on sequential scans, time-series data, or range-based reporting, **Range sharding** is required, but you must choose a shard key that doesn't cause write hotspots (e.g., `[tenant_id, date]`).
- If the workload is highly transactional, relying on point-lookups (getting a specific user's cart), **Hash sharding** is vastly superior, guaranteeing uniform load distribution across the cluster.
