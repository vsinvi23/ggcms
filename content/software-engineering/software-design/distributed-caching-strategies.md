---
title: "Distributed Caching Strategies: Cache-Aside, Write-Through, and Write-Behind"
description: "The three core caching topologies for scaling reads and writes against a database — cache-aside, write-through, and write-behind — with their consistency and data-loss trade-offs and a working cache-aside implementation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "caching"
  - "redis"
  - "cache-aside"
  - "write-through-cache"
  - "distributed-systems"
---

# Distributed Caching Strategies: Cache-Aside, Write-Through, and Write-Behind

## The Problem: Database Bottlenecks

As a system scales, the database inevitably becomes the primary bottleneck. Disk I/O, network latency, and complex query execution add up into sluggish response times. Throwing hardware at a database (vertical scaling) only works up to a point. To relieve database load, engineers introduce an in-memory caching layer — Redis or Memcached.

Caching, however, introduces a genuinely difficult problem: **cache invalidation and data consistency**. If the cache and the database drift out of sync, users see stale or wrong data. Choosing the right caching strategy for a given workload is the core design decision.

## The Mental Model: Caching Topologies

Introducing a cache means defining the relationship between the application, the cache, and the database. There are three standard topologies.

### 1. Cache-Aside (Lazy Loading)

The application manages both the cache and the database directly; the cache never talks to the database on its own.

```text
   Read Path:
   App --1. read--> Cache --2. MISS--> App --3. read--> DB --4. return--> App --5. write--> Cache
```

**Write path:** the application updates the database directly, then either deletes or updates the cache entry.

```python
def get_user_profile(user_id):
    cache_key = f"user:{user_id}"

    # 1. Check cache
    profile = redis_client.get(cache_key)
    if profile:
        return json.loads(profile)

    # 2. Fallback to DB
    profile = db.execute("SELECT * FROM users WHERE id = %s", user_id)

    # 3. Populate cache with a TTL (time-to-live)
    redis_client.setex(cache_key, 3600, json.dumps(profile))

    return profile
```

**Pros:** resilient to cache failure — if Redis goes down, the application falls back to the database (with a latency spike, not an outage).
**Cons:** requires custom invalidation code in the application layer; a write that updates the DB but fails to invalidate the cache leaves stale data behind.

### 2. Write-Through Cache

The application treats the cache as the primary interface; the cache (or a caching abstraction layer) synchronously writes through to the database.

```text
   Write Path:
   App --1. write--> Cache --2. sync write--> DB --3. ack--> Cache --4. ack--> App
```

**Pros:** complete consistency — the cache is never stale relative to the database.
**Cons:** higher write latency, because every write traverses two network hops (App → Cache → DB) before it's acknowledged.

### 3. Write-Behind (Write-Back)

Similar to write-through, but the database write happens *asynchronously*. The application writes to the cache and gets an immediate acknowledgment; a background process flushes updates to the database in batches.

```text
   Write Path:
   App --1. write--> Cache --2. immediate ack--> App
                        |
                        +--3. async batch flush--> DB (later)
```

**Pros:** very high write throughput — the application never waits on disk I/O, and the pattern absorbs write bursts that would otherwise overwhelm the database.
**Cons:** **data loss risk.** If the cache node crashes before the background process flushes to the database, that data is gone permanently.

## Dealing with Stale Data: TTLs and Eviction

Regardless of strategy, cached items should never live forever:

1. **Time To Live (TTL)** — every cached item gets an expiration. Even if an invalidation path has a bug, the cache eventually self-corrects.
2. **Eviction policies** — when Redis runs out of memory, it must evict entries. `LRU` (Least Recently Used) is the most common policy, keeping hot data resident while cold data is purged.

## Choosing a Strategy

| Strategy | Consistency | Write latency | Failure mode | Best for |
| :--- | :--- | :--- | :--- | :--- |
| Cache-Aside | Eventual (until TTL/invalidate) | Low (DB write only) | Falls back to DB gracefully | Read-heavy: user profiles, product catalogs |
| Write-Through | Strong | High (two hops) | Blocks on cache/DB both up | Strict-consistency systems: banking ledgers |
| Write-Behind | Eventual, with data-loss window | Very low | Data loss on cache crash before flush | Extreme write-heavy: gaming leaderboards, IoT telemetry |

## Key Takeaways

- **Cache-Aside** fits read-heavy systems where occasional staleness is acceptable and cache-down resilience matters.
- **Write-Through** fits systems that need strict consistency and can absorb the extra write-path latency.
- **Write-Behind** fits extreme write-heavy workloads where the risk of losing a small, recent batch of writes on a crash is tolerable.
- Every strategy still needs a TTL as a safety net against invalidation bugs, and an eviction policy (typically LRU) for when memory runs out.
