---
title: "Preventing Cache Stampedes with XFetch Probabilistic Early Expiration"
description: "How a hot cache key expiring under load triggers a thundering herd of simultaneous recompute queries, and how the XFetch algorithm prevents it without locking by probabilistically refreshing keys before they expire, with a full Go implementation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "cache-stampede"
  - "xfetch"
  - "thundering-herd"
  - "caching"
  - "probabilistic-algorithms"
---

# Preventing Cache Stampedes with XFetch Probabilistic Early Expiration

## The Problem: The Thundering Herd at Expiry

In a high-traffic application, caching shields the primary database from repeated reads of the same data. But caching introduces its own failure mode: the **cache stampede** (thundering herd). When a heavily requested, expensive-to-compute cache key hits its TTL and expires, hundreds or thousands of concurrent requests check the cache in the same instant, all see a MISS, and all simultaneously hammer the database to recompute the exact same value. That instantaneous load spike can lock tables, exhaust the connection pool, and take the database down.

A distributed lock (e.g. Redis `SETNX`) can ensure only one request recomputes the value while the rest wait — but that introduces its own added latency for every waiting request. **XFetch (Probabilistic Early Expiration)** avoids the stampede entirely, without any locking, by having requests probabilistically decide to refresh a key *before* it actually expires.

## XFetch Mechanics

Each cache entry tracks a *logical* expiration time, but is physically retained in the cache slightly longer than that. As the logical expiry approaches, every request checking the key effectively rolls a weighted die — the closer the key is to its logical expiry, the higher the probability that a given request treats it as an early miss and takes on the job of refreshing it in the background, while every other concurrent request keeps serving the still-valid, slightly stale value.

The formula:

```
now - (delta * beta * log(rand())) >= logical_expiry
```

- `delta` — how long it took to compute the value last time.
- `beta` — a tunable constant (commonly ~1.0) controlling how aggressively early the refresh kicks in.
- `rand()` — a fresh random float in `(0, 1)` on every check.

## ASCII Timeline: Probabilistic Refresh in Action

```text
 Cache holds "Trending Data" (logical expiry: 10:05:00)

 10:04:55 -> Thread A reads. P(early miss) = 1%.  Returns cached value.
 10:04:57 -> Thread B reads. P(early miss) = 5%.  Returns cached value.
 10:04:59 -> Thread C reads. P(early miss) = 50%. LUCKY ROLL -> treats as miss.
               │
               ├─▶ Thread C returns the (still valid) stale value to its own caller immediately.
               └─▶ Thread C spins up a background recompute job.
                    Database returns fresh data; cache updated with new logical expiry (10:10:00).

 10:05:00 -> Thread D reads. Sees the new logical expiry (10:10:00). Returns fresh cache. No stampede.
```

Notice that no thread ever blocks waiting on another thread's recompute — the probability model spreads the "who refreshes" decision out statistically, so exactly one (or a small few) requests take on the recompute cost while the rest are unaffected.

## Implementation: XFetch in Go

```go
package cache

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

type CacheItem struct {
	Value         string
	DeltaMs       float64 // time taken to generate the value last time
	LogicalExpiry int64   // Unix ms when the item should logically expire
}

type XFetchCache struct {
	mu    sync.Mutex
	store map[string]CacheItem // stand-in for Redis or local memory
	beta  float64              // tuning parameter, e.g. 1.0
}

func NewXFetchCache(beta float64) *XFetchCache {
	return &XFetchCache{store: make(map[string]CacheItem), beta: beta}
}

func (c *XFetchCache) Get(key string, recomputeFn func() string) string {
	c.mu.Lock()
	item, exists := c.store[key]
	c.mu.Unlock()

	if !exists {
		return c.computeAndStore(key, recomputeFn) // real physical miss
	}

	now := float64(time.Now().UnixMilli())
	randomFactor := math.Log(rand.Float64()) // always negative, in (-inf, 0)
	probabilisticTime := now - (item.DeltaMs * c.beta * randomFactor)

	if probabilisticTime >= float64(item.LogicalExpiry) {
		// This request won the probabilistic "early refresh" lottery.
		go c.computeAndStore(key, recomputeFn) // fire-and-forget, don't block the caller

		// Nudge the logical expiry forward so other concurrent requests
		// don't also win the lottery while this refresh is in flight.
		c.mu.Lock()
		item.LogicalExpiry += int64(item.DeltaMs)
		c.store[key] = item
		c.mu.Unlock()
	}

	return item.Value // stale-but-valid, or freshly updated — either way, non-blocking
}

func (c *XFetchCache) computeAndStore(key string, fn func() string) string {
	start := time.Now()
	val := fn() // e.g. an expensive DB query or aggregation
	deltaMs := float64(time.Since(start).Milliseconds())

	c.mu.Lock()
	c.store[key] = CacheItem{
		Value:         val,
		DeltaMs:       deltaMs,
		LogicalExpiry: time.Now().Add(5 * time.Minute).UnixMilli(),
	}
	c.mu.Unlock()
	return val
}
```

## Trade-offs and Considerations

1. **Stale-data tolerance.** XFetch deliberately serves slightly stale data during the refresh window. That's fine for trending lists, dashboards, and configuration values — not acceptable for a financial ledger or anything requiring read-your-write guarantees.
2. **Self-correcting compute-time tracking.** Because the algorithm's aggressiveness scales with `delta` (measured compute time), a slowing database automatically causes the algorithm to start refreshing earlier on the *next* cycle — a naturally self-healing backpressure mechanism, with no manual tuning required when load patterns shift.

## Architectural Takeaway

XFetch replaces a distributed lock with pure math: instead of coordinating "who gets to recompute" explicitly, it makes that decision probabilistically and independently at each node, which means no cross-node coordination overhead and no thundering herd at exact TTL boundaries. It pairs naturally with the caching strategies discussed for cache-aside/write-through systems — use it specifically on your highest-traffic, most-expensive-to-recompute keys, where a lock-based stampede guard would otherwise become a bottleneck in its own right.
