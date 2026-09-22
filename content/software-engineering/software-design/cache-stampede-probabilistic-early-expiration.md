---
title: "Cache Stampedes: Thundering Herd and Probabilistic Early Expiration"
description: "Why a popular cache key expiring under load can take down the database behind it, why mutex locks make it worse, and how probabilistic early expiration (the XFetch algorithm) eliminates the stampede without blocking a single request."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "cache-stampede"
  - "thundering-herd"
  - "xfetch"
  - "redis"
  - "distributed-caching"
---

# Cache Stampedes: Thundering Herd and Probabilistic Early Expiration

## The Problem: The High-Traffic Expiration Collapse

Caching is the standard mechanism for protecting a database from read exhaustion — a fast, in-memory store like Redis or Memcached sits in front of an expensive query and drops latency from seconds to milliseconds. But standard Time-To-Live (TTL) expiration has a critical vulnerability: the **cache stampede**, also called the **thundering herd** problem.

Consider a highly popular cache key — a homepage configuration, a trending item, a "Top 100 Recommended Products" array that takes the database 3 seconds to compute — serving 5,000-10,000 requests per second. When its TTL expires, it is evicted from memory in one instant. Every one of those concurrent requests hits a cache miss in the same millisecond, and every one of them independently tries to recompute the value from the source database, simultaneously.

```text
Time    Request Flow                        Cache State            Source Database
==================================================================================
t0      5,000+ req/sec --------------------> [ Warm Key ] --------> Idle
t1      Key expires (TTL = 0) -------------> [ Cache Miss ]
t2      5,000+ concurrent connections -----------------------------> [ Overloaded DB ]
                                                                     (CPU 100%, timeouts, crash)
```

### The Mental Model: The Broken Dam

A warm cache is a dam holding back a reservoir of traffic. The instant the TTL expires, the dam vanishes and the full weight of traffic crashes onto the database beneath it — CPU spikes to 100%, connections time out, queries fail, and the site goes down.

## Traditional Mitigation: Mutex Locks (and Why It Falls Short)

The intuitive fix is a distributed lock: on a cache miss, the first request to acquire a Redis lock for that key recomputes the value; everyone else waits and retries.

```python
def get_data_with_lock(key):
    data = redis.get(key)
    if data is None:
        if redis.acquire_lock(key + "_lock"):
            data = expensive_db_query()
            redis.set(key, data, ttl=300)
            redis.release_lock(key + "_lock")
        else:
            time.sleep(0.05)
            return get_data_with_lock(key)
    return data
```

**The flaw:** locking causes massive thread starvation. If the recompute takes 3 seconds, every one of the thousands of requests that arrived in that window is now sleeping, polling, and blocking on the lock. Web server threads and connection pools exhaust and crash before the database even finishes the one query it's allowed to run.

## The Solution: Probabilistic Early Expiration (XFetch)

Instead of waiting for the dam to break, the cache is refreshed *before* it actually expires — but only probabilistically, so exactly one (or a small handful of) requests trigger the recompute, while everyone else keeps getting instant, slightly-stale data. This is the **XFetch** algorithm (Vattani et al.).

Every read near a key's expiration computes the odds that *this* request should trigger an early, asynchronous refresh. The closer the key is to expiring, and the longer its computation takes, the higher that probability climbs. Whichever request "wins" performs the refresh in the background; every other concurrent reader is served the current (still valid) cached value immediately — no blocking, no database spike.

The formula:

```
now + (delta * beta * -ln(rand())) >= expirationTime
```

- **delta (Δ)** — the time it took to compute the cached value originally (milliseconds).
- **beta (β)** — a tuning constant (typically ≥ 1); higher values trigger early refresh sooner.
- **rand()** — a random float in `(0, 1)`.

Because `delta` scales with how expensive the query was, expensive queries start their probabilistic refresh window earlier than cheap ones — the safety margin is proportional to recompute cost.

## Implementing XFetch in TypeScript

```typescript
interface CachePayload<T> {
  value: T;
  delta: number;          // time taken to compute the value, in ms
  expirationTime: number; // unix timestamp of hard expiration, in ms
}

class CacheService {
  private redisStore: Map<string, string> = new Map();

  // Tuning parameter: > 1 triggers early refresh sooner; < 1 delays it.
  private readonly beta = 1.0;

  async get<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<T> {
    const cachedData = this.redisStore.get(key);

    if (cachedData) {
      const payload: CachePayload<T> = JSON.parse(cachedData);
      const currentTime = Date.now();

      // XFetch probabilistic early-expiration check
      const shouldRefreshEarly =
        currentTime - (payload.delta * this.beta * Math.log(Math.random())) > payload.expirationTime;

      if (shouldRefreshEarly) {
        // Refresh in the background — do NOT block the current request
        this.refreshCacheInBackground(key, fetchSource, ttlMs).catch(err => {
          console.error(`Background refresh failed for key ${key}:`, err);
        });
      }

      // Always return the cached value immediately, refresh or not
      return payload.value;
    }

    // Hard cache miss (e.g. cold start) — must compute synchronously
    return await this.refreshCacheSynchronously(key, fetchSource, ttlMs);
  }

  private async refreshCacheInBackground<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<void> {
    await this.refreshCacheSynchronously(key, fetchSource, ttlMs);
  }

  private async refreshCacheSynchronously<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<T> {
    const startTime = Date.now();
    const freshValue = await fetchSource();
    const delta = Date.now() - startTime; // measure real computation latency

    const payload: CachePayload<T> = {
      value: freshValue,
      delta,
      expirationTime: Date.now() + ttlMs,
    };

    this.redisStore.set(key, JSON.stringify(payload));
    return freshValue;
  }
}
```

```typescript
// Usage
const cache = new CacheService();

const topProducts = await cache.get(
  "homepage:top-products",
  () => db.computeTopProducts(),  // expensive: ~3000ms
  300_000                          // 5 minute TTL
);
```

## Why This Works

1. **Zero latency spikes for the caller** — the request that triggers the recompute still gets served the current cached value instantly; it never waits on the database.
2. **No thundering herd** — because the trigger is probabilistic, only one (or a very small handful) of the thousands of concurrent requests fires the recompute. The database sees one query instead of five thousand.
3. **Self-tuning safety window** — the `delta` term means expensive queries start refreshing earlier than cheap ones, sizing the safety margin to the actual cost of recomputation.

## Architectural Guardrails and Trade-offs

1. **Storage overhead** — storing `delta` and `expirationTime` alongside the value adds a few bytes per key; at millions of keys, size Redis memory accordingly.
2. **Beta tuning** — a high `beta` prevents database spikes almost entirely but increases the overall rate of background writes, since values refresh earlier. Monitor DB write load and tune `beta` to balance staleness against throughput.
3. **Background concurrency bound** — cap how many background refreshes your worker pool runs concurrently, so a burst of near-simultaneous "winners" across many keys can't itself starve the thread/worker pool.

## Key Takeaways

- Cache stampedes happen because a single hot key expiring atomically turns thousands of concurrent cache reads into thousands of simultaneous database queries.
- Mutex/lock-based mitigation avoids the database spike but shifts the cost onto the application tier — thread/connection starvation while everyone queues behind the lock.
- Probabilistic Early Expiration (XFetch) refreshes a key before its hard TTL, with the refresh probability rising as expiration approaches, so exactly one request recomputes while everyone else gets an instant, still-cached response.
- The technique requires no distributed locks at all — it eliminates the stampede at the read path instead of managing contention after the miss has already happened.
