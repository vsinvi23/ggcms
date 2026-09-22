---
title: "Sharding Relational Databases: Hash-Based vs Range-Based Partitioning"
description: "Choosing between hash-based and range-based shard key routing, why each creates a different failure mode (hotspots vs scatter-gather), and how to pick a strategy for a given workload."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "database-sharding"
  - "hash-partitioning"
  - "range-partitioning"
  - "shard-key"
  - "horizontal-scaling"
---

# Sharding Relational Databases: Hash-Based vs Range-Based Partitioning

## The Problem: The Single Machine Bottleneck

Relational databases like PostgreSQL and MySQL are traditionally monolithic — they scale *vertically*: when you run out of CPU, memory, or disk space, you buy a bigger server. Vertical scaling has physical limits and becomes exponentially more expensive. When a dataset reaches terabytes, or queries per second exceed what a single disk controller can serve, a single server stops being viable — indexes stop fitting in RAM and queries slow down.

To scale further, data must be partitioned across multiple independent database servers: **sharding**.

## The Mental Model: Dividing the Ledger

Imagine a physical library with 10 million books. One librarian can't serve every patron, so you build four separate library buildings (shards). But you need a deterministic rule — a **shard key** — so patrons instantly know which building holds their book.

```text
[ Application Client ]
          |
          v
[ Routing Layer / Proxy ]   (decides where data lives)
      /      |      \
     /       |       \
[Shard A] [Shard B] [Shard C]
```

The two most common routing algorithms are **range-based** and **hash-based** sharding.

## Strategy 1: Range-Based Sharding

Range-based sharding divides data by continuous ranges of the shard key. For a shard key of `user_id`:

- **Shard A:** users 1 to 1,000,000
- **Shard B:** users 1,000,001 to 2,000,000
- **Shard C:** users 2,000,001 to 3,000,000

You could equally shard by `timestamp` (Shard A gets Jan-Mar, Shard B gets Apr-Jun).

### Advantages

1. **Range queries are fast.** "All users from ID 500 to 600" maps to a single shard — one query, one machine.
2. **Simple to implement.** The routing table is a small, human-readable list of ranges.

### Disadvantage: The Hotspot Problem

Range-based sharding is notorious for creating hotspots. If `user_id` is sequentially generated, every new sign-up lands on the highest-numbered shard. Shard A and B sit mostly idle serving old-user reads, while the newest shard's CPU saturates handling 100% of new-user write traffic — the exact bottleneck you tried to solve just moved to one shard.

## Strategy 2: Hash-Based Sharding

Hash-based sharding runs the shard key through a hash function (MD5, MurmurHash) and takes it modulo the number of shards:

```
Target_Shard = Hash(Shard_Key) % Number_Of_Shards
```

```python
import hashlib

def target_shard(user_id: str, num_shards: int) -> int:
    digest = hashlib.md5(user_id.encode()).hexdigest()
    return int(digest, 16) % num_shards

print(target_shard("User_104", 3))  # e.g. -> Shard 1
print(target_shard("User_105", 3))  # e.g. -> Shard 0
print(target_shard("User_106", 3))  # e.g. -> Shard 2
```

### Advantages

1. **Even distribution.** Hash output is pseudorandom, so data spreads evenly across shards.
2. **No hotspots.** Even sequential `user_id` inserts spread evenly across shards, because the hash — not the raw ID — determines placement.

### Disadvantages

1. **Scatter-gather range queries.** "All users from ID 500 to 600" has no locality under hashing — the routing layer must query *every* shard in parallel and merge results in memory.
2. **Resharding is painful.** Because of the modulo operator, adding a 4th shard changes the denominator from `% 3` to `% 4`. The hashed location of roughly 90% of your data changes overnight, forcing a near-total data migration. *(Consistent hashing, which maps data to a hash ring instead of a fixed shard count, solves this — see the companion article on consistent hashing and virtual nodes.)*

## Choosing the Right Strategy

**Use range-based when:**
- Your application heavily relies on scanning contiguous ranges (e.g., a month of time-series data).
- You can find a shard key that naturally distributes load evenly (e.g., `customer_zipcode` for geographically uniform traffic).

**Use hash-based when:**
- You need extreme, evenly-distributed write throughput.
- Queries primarily look up individual records by exact ID (key-value access patterns).
- Data distribution is inherently skewed and you must guarantee balanced storage/CPU usage.

## Key Takeaways

- Range sharding gives you fast range scans but is vulnerable to write hotspots when the key grows monotonically.
- Hash sharding eliminates hotspots but destroys range-query locality and makes resharding expensive under naive modulo routing.
- Sharding introduces real operational cost: cross-shard `JOIN`s disappear and distributed transactions become notoriously slow — exhaust read replicas, caching, and vertical scaling before reaching for sharding.
