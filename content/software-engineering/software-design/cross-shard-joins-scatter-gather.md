---
title: "Cross-Shard Joins: Scatter-Gather, Global Tables, and Materialized Views"
description: "Why JOIN breaks once a database is sharded, and the three patterns engineering teams use to answer cross-shard queries: application-level scatter-gather, replicated global lookup tables, and event-driven materialized views."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "database-sharding"
  - "scatter-gather"
  - "distributed-systems"
  - "cqrs"
  - "event-sourcing"
---

# Cross-Shard Joins: Scatter-Gather, Global Tables, and Materialized Views

## The Problem: The Broken JOIN

When a monolithic relational database reaches the physical limits of a single machine — maxing out IOPS, memory, or CPU — architects shard it: horizontally partitioning rows across multiple database instances so writes can scale. But sharding breaks the relational database's most powerful tool: `JOIN`.

Imagine an e-commerce platform with two tables, `Users` and `Orders`, sharded by `user_id`:

- **Shard A** holds Users 1-50,000 and their Orders.
- **Shard B** holds Users 50,001-100,000 and their Orders.

`SELECT * FROM Orders WHERE user_id = 42` routes cleanly to Shard A. But what if the business intelligence team asks: *find the top 10 most popular products purchased by users in California?*

In a monolith, this is trivial:

```sql
SELECT product_id, COUNT(*) as count
FROM Orders o
JOIN Users u ON o.user_id = u.id
WHERE u.state = 'CA'
GROUP BY product_id
ORDER BY count DESC LIMIT 10;
```

In a sharded environment, this SQL statement is useless — Shard A has no idea what orders exist on Shard B, and no database engine executes a `JOIN` across a network boundary to a separate server.

```text
[ Shard A: Users 1-50,000 + their Orders ]     [ Shard B: Users 50,001-100,000 + their Orders ]
                    |                                              |
                    +---------------- no cross-shard JOIN ---------+
                                 (each shard only sees its own rows)
```

### Mental Model: The Disconnected Libraries

Think of a sharded database as a library system split by author last name: Library A holds authors A-M, Library B holds N-Z. To list every book published in 1999 across *both* libraries, you can't ask one librarian — you send a researcher to each library, collect both partial lists, bring them back to your office, merge, and re-sort.

## Solution 1: Application-Level Scatter-Gather

The application takes over what the database optimizer used to do. This pattern is called **Scatter-Gather**:

1. **Scatter** — issue the (locally joinable) query in parallel to every shard.
2. **Map** — each shard filters and aggregates its own local rows and returns partial results.
3. **Gather (Reduce)** — the application merges all partial result sets in memory, performs a global sort, and slices the final top-K.

```python
import asyncio
from collections import defaultdict

async def get_top_products_ca(all_shards):
    # 1. Scatter — fire the same local-JOIN query at every shard in parallel
    query = """
        SELECT product_id, COUNT(*) AS count
        FROM Orders o
        JOIN Users u ON o.user_id = u.id
        WHERE u.state = 'CA'
        GROUP BY product_id
    """
    futures = [shard.execute_async(query) for shard in all_shards]

    # 2. Gather partial results
    global_counts = defaultdict(int)
    for result in await asyncio.gather(*futures):
        for row in result:
            global_counts[row.product_id] += row.count

    # 3. Final merge sort across all shards' partial aggregates
    sorted_products = sorted(global_counts.items(), key=lambda x: x[1], reverse=True)
    return sorted_products[:10]
```

**The penalty:** with 50 shards, one logical query becomes 50 network requests. It consumes significant application memory holding intermediate results, and the slowest shard dictates the total response time (tail latency).

## Solution 2: Global Lookup Tables (Replication)

Not every table grows without bound. Reference tables like `Countries`, `Categories`, or `SubscriptionTiers` stay small. Instead of sharding them, replicate the full table onto every shard:

```text
Shard A: [ Users 1-50,000 ] [ Orders ] [ Countries (full replicated copy) ]
Shard B: [ Users 50,001-100,000 ] [ Orders ] [ Countries (full replicated copy) ]
```

This lets you execute a local `JOIN` between a sharded table (`Users`) and a global table (`Countries`) entirely within one shard, without crossing the network.

## Solution 3: Materialized Views and Event Sourcing

If cross-shard queries are frequent and latency-sensitive (e.g., a customer-facing dashboard), scatter-gather is too slow for every request. The alternative is **event-driven denormalization**:

```text
Shard A ──OrderCreated event──┐
Shard B ──OrderCreated event──┼──▶ [ Kafka ] ──▶ [ Consumer ] ──▶ [ Pre-joined Read Model ]
Shard C ──OrderCreated event──┘                                    (Elasticsearch / ClickHouse)
                                                                            │
                                                                            ▼
                                                          UI queries the read model directly —
                                                          bypasses sharded relational DBs entirely
```

Every time an order is placed on any shard, that shard emits an `OrderCreated` event to a message broker. A separate consumer builds a specialized, pre-joined read model in a system optimized for this shape of query (Elasticsearch, ClickHouse). When the UI needs the cross-shard report, it queries the read model directly — no scatter-gather, no cross-shard fan-out, near-constant-time reads.

## Choosing a Strategy

| Pattern | Latency | Freshness | Best for |
| :--- | :--- | :--- | :--- |
| Scatter-Gather | High (bounded by slowest shard) | Real-time | Ad-hoc, low-frequency analytical queries |
| Global Lookup Tables | Low (local join) | Real-time | Small, rarely-changing reference data |
| Materialized View / Event Sourcing | Very low | Eventually consistent | High-frequency, latency-sensitive cross-shard reads |

## Key Takeaways

- Sharding solves the write-scaling problem but destroys native cross-shard `JOIN` — the application (or a supporting pipeline) must take over that work.
- Scatter-gather is the general-purpose fallback but is expensive: it multiplies network calls and is bounded by the slowest shard.
- Small reference tables should simply be replicated to every shard rather than sharded themselves.
- For frequent, latency-sensitive cross-shard reads, build a pre-joined, event-driven read model instead of scattering the query at request time.
- Before splitting a database, be sure the team is prepared to build the distributed aggregation and eventual-consistency pipelines this requires.
