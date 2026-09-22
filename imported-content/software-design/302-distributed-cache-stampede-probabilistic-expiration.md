# Cache Stampedes: Preventing Thundering Herds with Probabilistic Early Expiration

## The Problem: The High-Traffic Expiration Collapse

In high-concurrency systems, caching is the primary mechanism used to protect databases from read exhaustion. However, standard Time-To-Live (TTL) expiration strategies suffer from a critical vulnerability known as the **Cache Stampede** or **Thundering Herd** problem.

Consider a highly popular cache key—such as a homepage configuration or trending item—that handles 10,000 requests per second. When the key's TTL expires, it is evicted from memory. In that exact millisecond, all 10,000 concurrent requests encounter a cache miss. Because the cache is empty, these requests attempt to fetch the data from the source database and recompute the cache simultaneously.

```
Time    Request Flow                        Cache State            Source Database
==================================================================================
t0      10,000 req/sec -------------------> [ Warm Key ] --------> Idle
t1      Key Expires (TTL = 0) ------------> [ Cache Miss ]
t2      10,000 concurrent connections ---------------------------> [ Overloaded DB ]
                                                                   (CPU 100%, Crash)
```

This sudden spike in connection pooling and CPU usage overwhelms the database, leading to slow response times, cascading database timeouts, and total service outages. Standard mitigations like locking/mutexes force requests to queue, which still degrades client response latencies and can lead to thread pool exhaustion at the API gateway layer.

---

## The Mental Model: Probabilistic Early Expiration (XFetch)

Instead of waiting for a hard TTL to expire, we can refresh the cache *before* it actually dies, but only do so probabilistically. This is known as the **XFetch** algorithm (proposed by Vattani et al.).

As the cache key approaches its expiration, every read request calculates a probability of triggering an early, asynchronous refresh. The closer the key is to expiration, and the longer the database computation takes, the higher the probability that a read request will trigger a background refresh. The request that "wins" the probability lottery performs the background query and updates the cache. Crucially, all other concurrent readers continue to receive the currently cached (but slightly older) value instantly, avoiding any database spikes or request blocking.

The mathematical formulation for XFetch is:

$$\text{currentTime} - (\delta \cdot \beta \cdot \ln(\text{rand}())) > \text{expirationTime}$$

Where:
- $\delta$ (delta): The time (in milliseconds) it takes to compute the value from the database.
- $\beta$ (beta): A tuning parameter ($> 0$). Increasing beta makes early expiration happen sooner.
- $\ln(\text{rand}())$: The natural logarithm of a random floating-point number between 0 and 1.

---

## Implementing XFetch in TypeScript

Here is a complete, production-grade implementation of the XFetch algorithm using TypeScript and a mock Redis client.

```typescript
interface CachePayload<T> {
  value: T;
  delta: number;          // Time taken to compute the value in ms
  expirationTime: number; // Unix timestamp of hard expiration (ms)
}

class CacheService {
  private redisStore: Map<string, string> = new Map();

  // Tuning parameter: > 1 triggers early refresh faster; < 1 delays it.
  private readonly beta = 1.0;

  async get<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<T> {
    const cachedData = this.redisStore.get(key);

    if (cachedData) {
      const payload: CachePayload<T> = JSON.parse(cachedData);
      const currentTime = Date.now();

      // XFetch Algorithm check:
      // Probabilistic early expiration trigger
      const shouldRefreshEarly = 
        currentTime - (payload.delta * this.beta * Math.log(Math.random())) > payload.expirationTime;

      if (shouldRefreshEarly) {
        // Trigger background refresh asynchronously without blocking the client
        this.refreshCacheInBackground(key, fetchSource, ttlMs).catch(err => {
          console.error(`Background refresh failed for key ${key}:`, err);
        });
      }

      // Return the cached value immediately to ensure zero latency
      return payload.value;
    }

    // Hard cache miss fallback (synchronous computation)
    return await this.refreshCacheSynchronously(key, fetchSource, ttlMs);
  }

  private async refreshCacheInBackground<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<void> {
    await this.refreshCacheSynchronously(key, fetchSource, ttlMs);
  }

  private async refreshCacheSynchronously<T>(key: string, fetchSource: () => Promise<T>, ttlMs: number): Promise<T> {
    const startTime = Date.now();
    const freshValue = await fetchSource();
    const delta = Date.now() - startTime; // Measure database computation latency

    const payload: CachePayload<T> = {
      value: freshValue,
      delta: delta,
      expirationTime: Date.now() + ttlMs,
    };

    this.redisStore.set(key, JSON.stringify(payload));
    return freshValue;
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **Storage Overhead**: Storing `delta` and `expirationTime` inside the cache payload increases cache memory consumption by a few bytes per key. For millions of keys, ensure Redis has sufficient memory capacity.
2. **Beta Tuning**: A high $\beta$ value prevents database spikes completely but increases the overall write traffic to your database, as values are refreshed very early. Monitor database write loads and tune $\beta$ to balance stale reads against database throughput.
3. **Background Job Concurrency**: Ensure that your API worker pool has an upper bound on concurrent background refreshes to prevent Node.js or thread-pool starvation under extreme traffic conditions.
