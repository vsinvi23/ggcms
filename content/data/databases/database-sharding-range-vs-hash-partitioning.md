---
title: "Database Sharding: Range-Based vs Hash-Based Partitioning"
description: "How to choose a shard key and routing algorithm for horizontally scaled databases, comparing range sharding, hash sharding, and consistent hashing trade-offs."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "sharding"
  - "database-partitioning"
  - "distributed-systems"
  - "consistent-hashing"
  - "horizontal-scaling"
---

# Database Sharding: Range-Based vs Hash-Based Partitioning

## The Problem: The Monolithic Database Ceiling

As a monolithic database grows to terabytes of data, single-node vertical scaling (adding RAM and CPU) eventually becomes economically and physically impossible. Indexes no longer fit in memory, disk I/O spikes, and concurrent write contention bottlenecks throughput.

To scale horizontally, data must be split across multiple independent database nodes ("shards"). The critical engineering decision is: **how do we determine which row goes to which shard?** Sharding requires selecting a shard key (a column such as `user_id` or `created_at`) and applying a routing algorithm. Choosing the wrong one leads to "hotspots," where one node is crushed under load while others sit idle.

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

### Mental Model: Filing Cabinets

**Range-based:** three filing cabinets. Cabinet 1 holds last names A-H, Cabinet 2 holds I-Q, Cabinet 3 holds R-Z.

**Hash-based:** three filing cabinets. A person's ID is run through a mathematical function that randomly but deterministically assigns them to a cabinet.

## Range-Based Sharding

In range sharding, data is divided into contiguous, non-overlapping ranges based on the shard key.

**Example:** sharding a massive `orders` table by `created_date`.

- Shard 1: Jan 2023 to Jun 2023
- Shard 2: Jul 2023 to Dec 2023

### Pros

- **Efficient range queries.** A query like `SELECT * WHERE created_date BETWEEN '2023-02-01' AND '2023-04-01'` lets the router know that only Shard 1 holds this data — it queries a single node.
- **Easy data lifecycle management.** Archiving old data is as simple as dropping the oldest shard.

### Cons

- **Hotspots.** If sharded by date, all *new* inserts go to the most recent shard. Shards 1 through 9 sit idle while Shard 10 (the current month) absorbs 100% of write traffic — defeating the purpose of horizontal write scaling.

## Hash-Based Sharding

In hash sharding, the router passes the shard key through a hash function (MD5, MurmurHash) and performs a modulo operation against the number of shards.

**Example:** sharding by `user_id`.

```text
Hash("user_123") % 4 = Shard 2
```

### Pros

- **Perfect data distribution.** Hash functions output uniformly distributed values, so writes and reads for specific users are balanced across all shards. Write hotspots are virtually eliminated.

### Cons

- **Scatter-gather queries.** A query like `SELECT * WHERE age > 25` cannot use the shard key (`user_id`) at all. The router must query *all* shards simultaneously, gather results over the network, and merge them — highly inefficient.
- **Resharding complexity.** Adding a 5th shard to a 4-shard cluster changes the modulo math (`% 4` vs `% 5`) for *every* record, forcing a massive data migration unless consistent hashing is used.

## Hybrid Approach: Consistent Hashing

Modern distributed databases (Cassandra, DynamoDB) use hash sharding implemented via a "hash ring" (consistent hashing). Each node owns a contiguous arc of the hash space; adding or removing a node only remaps the records in the adjacent arc, not the entire keyspace. This preserves the load-distribution benefits of hashing while minimizing data movement on cluster resize.

```text
                    0
                    │
        node D ─────┼───── node A
                    │
   node C ──────────┼────────── node B
                    │
                (hash ring)

Key "user_123" hashes to a point on the ring; it is
owned by the first node clockwise from that point.
Adding node E only steals keys from its clockwise
neighbor — not from the whole ring.
```

## Conclusion

The choice between range and hash sharding is dictated by the application's query access patterns.

- If the workload relies on sequential scans, time-series data, or range-based reporting, **range sharding** is required — but the shard key must avoid write hotspots (e.g., a composite key like `[tenant_id, date]`).
- If the workload is highly transactional and relies on point lookups (fetching a specific user's cart), **hash sharding** is superior, guaranteeing uniform load distribution across the cluster.
- If the cluster needs to grow or shrink elastically without a full data reshuffle, **consistent hashing** is the production-grade evolution of plain hash sharding.
