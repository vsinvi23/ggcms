---
title: "Designing a Distributed Rate Limiter with Redis and Token Bucket"
description: "Why local in-memory rate limiters collapse under horizontal scaling, a comparative look at Token Bucket, Leaky Bucket, Fixed Window, and Sliding Window Log algorithms, and a production Redis Lua + FastAPI implementation that avoids distributed locks entirely."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "rate-limiting"
  - "redis"
  - "token-bucket"
  - "lua-scripting"
  - "distributed-systems"
---

# Designing a Distributed Rate Limiter with Redis and Token Bucket

## The Problem: The Collapse of the Local Rate Limiter

Imagine a high-traffic platform that must defend `/api/v1/auth/login` against brute-force attacks with a hard rule: **max 10 requests per minute per client**.

Initially the system is simple: a single API instance keeps an in-memory hash map — client IP or JWT user ID mapped to a request counter for the current 60-second window.

```text
Incoming Requests ---> [ Single API Server (local memory map) ]
                             - IP "192.168.1.5" -> Count: 3
                             - IP "10.0.0.12"   -> Count: 9
```

This works — until the app goes viral and traffic is spread across an autoscaling group of API instances behind a round-robin load balancer:

```text
                        +-----------------------+
                        |  Load Balancer (ALB)  |
                        +-----------------------+
                        /           |           \
                       v            v            v
                +-----------+ +-----------+ +-----------+
                |   API_0   | |   API_1   | |   API_2   |
                +-----------+ +-----------+ +-----------+
                 local mem:    local mem:    local mem:
                 192... -> 3   192... -> 4   192... -> 3
```

### Stateful Limiter, Stateless Scaling

A client sending 10 rapid requests gets round-robined: `API_0` sees 3, `API_1` sees 4, `API_2` sees 3 — each node independently under its own local limit of 10, so **all 10 requests are approved**. With `N` API nodes, a client can bypass the limit by a factor of `N` because the rate-limiting state is isolated in per-server RAM while the application tier is stateless.

**Sticky sessions are not a fix.** Pinning a client's traffic to one node via IP affinity breaks down when thousands of legitimate users share one egress IP (corporate NAT, mobile carrier CGNAT, university VPN) — they'd all get routed to a single node, crushing it while the rest sit idle. And any node restart (a routine Kubernetes rotation) wipes that node's local counters, opening a reset window for attackers.

## Why the Problem Is Hard

1. **Critical path latency.** The rate limiter must evaluate *every* incoming request before business logic runs. If a login endpoint normally takes 30ms and the rate-limit check adds 40ms, you've more than doubled response time — the check needs to complete in low single-digit milliseconds.
2. **The CAP trade-off under partition.** If the centralized rate-limiting store becomes unreachable:
   - **Fail closed (CP):** block every request until it recovers — you've turned your own rate limiter into a self-inflicted denial of service.
   - **Fail open (AP):** bypass the check and let requests through — protects UX but exposes core databases to unmitigated load during the outage.

## The Four Core Algorithms

| Algorithm | Mental model | Best for | Complexity |
| :--- | :--- | :--- | :--- |
| Token Bucket | A refillable coffee pot | Bursty, unpredictable traffic | O(1) time / O(1) space |
| Leaky Bucket | A funnel leaking at a fixed rate | Smoothing bursts before a fragile downstream | O(1) time / O(1) space |
| Fixed Window Counter | A grid of wall calendars | Low-overhead basic blocking | O(1) time / O(1) space |
| Sliding Window Log | An exact ledger of timestamps | High-security endpoints (MFA, password reset) | O(log N) time / O(N) space |

### Token Bucket

A bucket holds up to `T_max` tokens; a refill mechanism adds tokens at a fixed rate `R`. Every request tries to consume one token: if tokens remain, the request proceeds; if empty, it's rejected.

```
T_current = min(T_max, T_last_checked + (t_current - t_last_checked) * R)
```

Computed lazily on read — no background refill thread needed. **Pros:** handles bursts gracefully, an idle client can immediately burst up to `T_max`. **Cons:** a burst up to `T_max` can still saturate a fragile downstream connection pool.

### Leaky Bucket

Requests fill a queue (the funnel); a constant-rate process drains it. Overflow beyond queue capacity is dropped.

```
W_current = max(0, W_last - (t_current - t_last) * D)
```

**Pros:** perfectly flat egress rate, ideal for protecting slow legacy backends. **Cons:** even idle-capacity clients get queued and delayed at the fixed drain rate.

### Fixed Window Counter

A single integer counter per client per fixed time block (e.g., `12:00:00-12:01:00`), reset each window. **Pros:** minimal memory — a single Redis-TTL'd integer. **Cons — the boundary burst:** a client idle until `12:00:59` can send 100 requests (approved, Window 1), then another 100 at `12:01:01` (approved, fresh Window 2) — 200 requests in 2 seconds against a "100/minute" limit.

### Sliding Window Log

Replace the counter with an exact chronological log of request timestamps. On each request, evict entries older than `now - windowSize`, then count what remains.

```
Ledger: [ 12:00:15 (EVICT), 12:00:45, 12:01:05, 12:01:25 ]
Window start: 12:00:30, current time: 12:01:30
Count inside window = 3
```

**Pros:** mathematically immune to boundary gaming. **Cons:** storing millions of per-client 64-bit timestamps (e.g., 5,000 sensors × thousands of requests/hour) is extremely memory-hungry — this is the classic O(N) space blowup that makes Token Bucket's O(1) footprint attractive at scale.

## The Distributed Scaling Challenges

### The Check-Then-Act Race Condition

If two API gateway nodes read the same Redis key sequentially (`GET` then `SET`) instead of atomically, both can read `tokens = 1`, both conclude "allowed," and both proceed — one request too many gets through.

```text
 API Gateway Node 1                Redis                 API Gateway Node 2
         | GET tokens ---------------> |                          |
         |                             | <--------- GET tokens ---|
         | <-- tokens = 1 -------------|                          |
         |                             |------- tokens = 1 ------>|
         |-- (1 > 0, ALLOWED) ---------|                          |
         |                             |                          |-- (1 > 0, ALLOWED)
         | SET tokens = 0 ------------>|                          |
         |                             | <------- SET tokens = 0 -|
   Request approved                                          Request approved (OVER LIMIT!)
```

### Lock Contention

Wrapping the check-then-act in a distributed mutex (e.g., Redlock) serializes concurrent requests for the same client: `K` concurrent requests now cost `O(K × RTT)` in total latency, and a crashed lock holder stalls every waiter until the lease expires.

### Multi-Region Replication Lag

A global deployment (`us-east-1` + `eu-west-1`) using active-active replication with roughly 150ms cross-region sync lag lets a client "double-spend" — bursting 5 tokens' worth of requests at each region simultaneously, consuming 10 total against a 5-request limit before state converges.

## The Solution: Atomic Lua Execution on Redis

Redis's single-threaded execution model makes Lua scripts atomic by construction: once a script starts, Redis processes nothing else until it finishes. Moving the read-calculate-write sequence into one Lua script collapses "check-then-act" into a single indivisible operation — no distributed lock required.

```text
 [ API Gateway Node 1 ] ---(single atomic payload)---> [ Redis: Lua engine, single-threaded ]
 [ API Gateway Node 2 ] ---(blocked until script 1 completes)---^
```

### The Atomic Token Bucket Lua Script

```lua
-- KEYS[1]: Redis key, e.g. "rate_limit:user_12345"
-- ARGV[1]: max bucket capacity
-- ARGV[2]: refill rate, tokens per millisecond
-- ARGV[3]: current unix epoch (ms)
-- ARGV[4]: tokens requested (usually 1)

local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local state = redis.call("HMGET", key, "tokens", "last_updated")
local current_tokens = tonumber(state[1])
local last_updated = tonumber(state[2])

if not current_tokens then
    current_tokens = max_tokens
    last_updated = now
else
    local elapsed = now - last_updated
    if elapsed > 0 then
        local refilled = elapsed * refill_rate
        current_tokens = math.min(max_tokens, current_tokens + refilled)
        last_updated = now
    end
end

local approved = 0
if current_tokens >= requested then
    current_tokens = current_tokens - requested
    approved = 1
    redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)

    -- Dynamic TTL: expire once the bucket would naturally refill to 100%
    local fill_time_ms = math.ceil((max_tokens - current_tokens) / refill_rate)
    local ttl_ms = math.max(1000, fill_time_ms)
    redis.call("PEXPIRE", key, ttl_ms)
else
    redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)
end

return { approved, math.floor(current_tokens) }
```

### Python Client Wrapper

```python
"""Distributed rate limiter using Redis and an atomic Lua-scripted Token Bucket."""
import time
import redis
from typing import Tuple


class RedisTokenBucketLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis_client = redis_client
        self.lua_script = """
        local key = KEYS[1]
        local max_tokens = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local requested = tonumber(ARGV[4])

        local state = redis.call("HMGET", key, "tokens", "last_updated")
        local current_tokens = tonumber(state[1])
        local last_updated = tonumber(state[2])

        if not current_tokens then
            current_tokens = max_tokens
            last_updated = now
        else
            local elapsed = now - last_updated
            if elapsed > 0 then
                local refilled = elapsed * refill_rate
                current_tokens = math.min(max_tokens, current_tokens + refilled)
                last_updated = now
            end
        end

        local approved = 0
        if current_tokens >= requested then
            current_tokens = current_tokens - requested
            approved = 1
            redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)
            local fill_time_ms = math.ceil((max_tokens - current_tokens) / refill_rate)
            local ttl_ms = math.max(1000, fill_time_ms)
            redis.call("PEXPIRE", key, ttl_ms)
        else
            redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)
        end

        return { approved, math.floor(current_tokens) }
        """
        # Registering caches the script under a SHA1 hash for cheap re-invocation
        self.script_runner = self.redis_client.register_script(self.lua_script)

    def evaluate(
        self,
        identifier: str,
        capacity: int,
        refill_rate_per_sec: float,
        requested_tokens: int = 1
    ) -> Tuple[bool, int]:
        # Hash-tag the key so Redis Cluster routes it to a single shard
        key = f"rate_limit:{{user:{identifier}}}"
        refill_rate_ms = refill_rate_per_sec / 1000.0
        now_ms = int(time.time() * 1000)

        try:
            approved, remaining = self.script_runner(
                keys=[key],
                args=[capacity, refill_rate_ms, now_ms, requested_tokens]
            )
            return bool(approved == 1), remaining
        except redis.RedisError as e:
            # Fail open: prioritize availability over strict enforcement during an outage
            print(f"[-] Redis rate limiter failed: {e}. Failing open.")
            return True, -1
```

### FastAPI Middleware Integration

```python
"""FastAPI integration with the Redis atomic rate limiter."""
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
import redis
from rate_limiter import RedisTokenBucketLimiter

app = FastAPI(title="Secured Distributed API Gateway")

redis_pool = redis.ConnectionPool(host="localhost", port=6379, db=0, decode_responses=True)
redis_client = redis.Redis(connection_pool=redis_pool)
limiter = RedisTokenBucketLimiter(redis_client)


@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"

    capacity = 10
    refill_rate = 2.0  # tokens per second

    approved, remaining = limiter.evaluate(
        identifier=client_ip,
        capacity=capacity,
        refill_rate_per_sec=refill_rate
    )

    if not approved:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": "Too Many Requests", "status": "rate_limited"},
            headers={
                "Retry-After": "10",
                "X-RateLimit-Limit": str(capacity),
                "X-RateLimit-Remaining": "0"
            }
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(capacity)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return response
```

## Extreme Scale: Edge Filtering and Gossip

At very high throughput (100K+ req/sec globally), even a single atomic Redis call per request adds up. Two complementary techniques reduce query volume to the core store:

```text
                         [ Global Client Requests ]
                                    |
                       +-------------------------+
                       |   Edge Layer (Envoy)    |
                       |  - local token bucket   | <--- handled at the edge,
                       |  - drops obvious abuse  |      no query to core Redis
                       +-------------------------+
                                    |
                                    | (only surviving traffic reaches core)
                                    v
                       +-------------------------+
                       |      Redis Cluster      |
                       |  - authoritative state  |
                       +-------------------------+
```

- **Gossip protocols** (as in Cassandra) let peers exchange lightweight, periodic status messages to build an eventually consistent global view without any centralized database — trading strict correctness for the elimination of a single point of failure.
- **Edge filtering** (Envoy, Cloudflare Workers) applies a fast local check that drops obviously abusive traffic at the network border before it ever reaches the internal rate limiter, filtering out the bulk of brute-force/DDoS noise cheaply.

## Common Misconceptions

**"Fail-closed is always the right posture."** Failing closed during a Redis outage locks out 100% of legitimate traffic. Most consumer-facing rate limiters fail open deliberately: log the failure, page the reliability team, and let requests through rather than self-inflict an outage.

**"Distributed locks are required for strict consistency here."** Locks introduce serialization and contention that are a severe anti-pattern for a per-request hot path. Atomic Redis primitives (Lua scripts, `INCRBY`, `ZREMRANGEBYSCORE`) achieve the same correctness without ever taking an external lock.

**"Lua scripts run concurrently across a Redis Cluster."** A Lua script can only access keys on the same physical shard. Cross-slot key access inside one script raises a runtime error. The fix is **hash tags** — e.g. `{user:12345}:rate_limit` — which force every key for one user onto the same shard, so the Lua script stays local and fast.

## Key Takeaways

- In-memory limiters fail under horizontal scaling because state is isolated per node while traffic is distributed — a client can bypass the limit by roughly a factor of the node count.
- Token Bucket handles bursty traffic in O(1) space; Sliding Window Log is bulletproof against boundary gaming but costs O(N) space per client; Fixed Window Counter is cheap but exploitable at window boundaries.
- Atomic Redis Lua scripting eliminates the check-then-act race condition without any distributed lock, because Redis executes the whole script as one indivisible unit on its single-threaded engine.
- A hybrid architecture — local edge filtering plus a centralized Redis authority — absorbs the bulk of abusive traffic before it ever reaches the core rate-limiting store.
