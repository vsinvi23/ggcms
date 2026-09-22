# Designing a Global Distributed Rate Limiter: Redis Cluster, Sliding Window Logs, and Token Buckets

> Master the architectural patterns of highly available, ultra-low-latency distributed rate limiting. Learn how to combat distributed race conditions, minimize lock contention, and leverage Redis-backed Lua scripts for atomic token-bucket execution.

---

## What We Are Going to Learn

In this deep-dive system design guide, we will explore the architecture of horizontally scaling rate-limiting systems. 

Specifically, we will cover:
1. **The Core Failure Modes:** Why naive, local in-memory rate limiters crash under horizontal scale and how they lead to API gateway bypasses.
2. **Algorithm Battleground:** A exhaustive comparative analysis of the four primary rate-limiting algorithms: *Token Bucket*, *Leaky Bucket*, *Fixed Window Counter*, and *Sliding Window Log*.
3. **Under the Hood (Distributed Pain Points):** Deep dives into distributed race conditions (the "check-then-act" anti-pattern), lock contention, multi-region replication lag, and network overhead.
4. **The Atomic Lua Solution:** How to harness Redis Lua scripting to guarantee single-thread serialization, preventing race conditions without heavy distributed locks.
5. **Hands-on Production Code:** A complete, runnable Python FastAPI wrapper and Redis-py wrapper implementing a lazily filled Token Bucket with dynamic Redis TTL management.
6. **Architectural Scaling & Topology:** Sizing gossip protocols for peer-to-peer state sharing and deploying local Envoy/Cloudflare edge filters to shield core databases from traffic storms.

---

## The Problem: The Collapse of the Local Rate Limiter

Imagine you are running a high-traffic web platform that powers user authentication and payment processing. To defend against automated brute-force attacks, credential stuffing, and scraping bots, your application security policy dictates:
* **Max Limit:** A client may make no more than 10 requests per minute to `/api/v1/auth/login`.

Initially, your system is simple. You run a single instance of your API gateway on an EC2 instance. In RAM, you maintain a hash map where the key is the client's IP address or JWT user ID, and the value is an integer counter tracking the number of requests made within the current 60-second window.

```
Incoming Requests ---> [ Single API Server (Local Memory Map) ]
                             - IP "192.168.1.5" -> Count: 3
                             - IP "10.0.0.12"   -> Count: 9
```

This works flawlessly—until your application goes viral. To handle the surge in traffic, you configure an Autoscaling Group and place a Round-Robin Load Balancer (like AWS ALB or NGINX) in front of three API servers: `API_0`, `API_1`, and `API_2`.

```
                        +-----------------------+
                        |  Load Balancer (ALB)  |
                        +-----------------------+
                        /           |           \
                       /            |            \
                      v             v             v
                +-----------+ +-----------+ +-----------+
                |   API_0   | |   API_1   | |   API_2   |
                +-----------+ +-----------+ +-----------+
                 Local Mem:    Local Mem:    Local Mem:
                 192... -> 3   192... -> 4   192... -> 3
```

### The Failures of Stateful Isolation

When a single malicious user initiates a distributed scraping attack from a single IP address, the Round-Robin Load Balancer distributes their concurrent requests across all three API nodes.
1. The client sends 10 rapid-fire requests.
2. `API_0` receives 3 requests, increments its local key to `3`, and approves them.
3. `API_1` receives 4 requests, increments its local key to `4`, and approves them.
4. `API_2` receives 3 requests, increments its local key to `3`, and approves them.

* **The Result:** The client has successfully made 10 requests across your ecosystem without triggering a single block! In fact, with $N$ API nodes, the client can theoretically bypass your rate limit by a factor of $N$ (allowing up to 30 requests instead of the strict limit of 10). 
* **The Vulnerability:** Your rate limiter is *stateful*, but your application scaling model is *stateless*. Because the rate-limiting state is isolated in server-local RAM, your nodes are blind to the global traffic volume. 

### Why "Sticky Sessions" Are a Dangerous Band-Aid
To fix this, you might be tempted to enable **Session Stickiness (IP Affinity)** on the load balancer, forcing all traffic from a specific IP to land on the same API instance. However, in modern environments, this fallback introduces severe architectural vulnerabilities:
* **The Mega-Proxy Problem:** Hundreds of thousands of legitimate users behind a corporate firewall, mobile gateway (CGNAT), or university VPN share a single public egress IP address. Sticky sessions will route this entire mass of users to a *single* API node, causing extreme load skew and crashing that node, while other nodes sit idle.
* **Failure Failovers:** If an API node crashes or is rotated by Kubernetes, its local memory is lost. The load balancer redistributes its sessions to the remaining servers, instantly resetting the rate counters for active clients and opening a window for attack amplification.

---

## Why the Problem Is Hard: The Critical Path Bottleneck

Before designing a distributed system to solve this, we must recognize that a rate-limiter is an exceptionally demanding piece of infrastructure. 
1. **Critical Path Latency:** The rate limiter must evaluate *every single incoming API request* before any business logic can execute. If your core login endpoint takes 30ms, and your distributed rate-limiter database lookup adds 40ms of latency, you have more than doubled your overall response time. The rate limit evaluation must complete in **under 2 milliseconds**.
2. **The High-Availability Paradox (CAP Theorem):** If the centralized rate-limiting cluster experiences a network partition or a hardware failure, how should your system respond?
   - **If you fail closed (CP System):** You prioritize consistency. Every request is blocked until the rate limiter is back online. You have just transformed a rate limiter into a self-inflicted Distributed Denial of Service (DDoS) mechanism.
   - **If you fail open (AP System):** You prioritize availability. If the rate limiter is unresponsive, you bypass the checks and allow the requests. This protects your user experience but exposes your core databases to immediate, unmitigated resource exhaustion during traffic spikes.

---

## A Simple Mental Model: The Four Core Algorithms

To rate-limit traffic effectively, we must select an algorithm that matches our workload's tolerance for burstiness, latency, and memory consumption. Let's build a clear mental model for each of the four primary algorithms.

| Algorithm | Mental Model | Best For | Complexity (Time / Space) |
| :--- | :--- | :--- | :--- |
| **Token Bucket** | A refillable coffee pot | Protecting APIs with bursty, unpredictable patterns | $O(1)$ Time / $O(1)$ Space |
| **Leaky Bucket** | A funnel leaking at a fixed rate | Smooth downstream database ingestion | $O(1)$ Time / $O(1)$ Space |
| **Fixed Window Counter** | A grid of wall calendars | Basic endpoint blocking with low memory overhead | $O(1)$ Time / $O(1)$ Space |
| **Sliding Window Log** | An exact financial ledger | High-security endpoints (e.g., password reset, MFA) | $O(\log N)$ Time / $O(N)$ Space |

---

### 1. Token Bucket

#### Mental Model: The Coffee Pot
Imagine a coffee pot (the bucket) that holds a maximum of 10 cups of coffee (tokens). Every 6 seconds, a drip-brewing mechanism adds exactly 1 fresh cup of coffee to the pot (refill rate). Every time an eager developer walks by (a request), they check the pot:
* If there is coffee inside, they take 1 cup (consume a token) and proceed with their day.
* If the pot is completely empty, they are turned away (blocked).
* If the pot is full and nobody takes coffee, the excess coffee overflows and is discarded (tokens capped at maximum capacity).

```
     Refill Rate (R tokens/sec)
            |
            v
      +-----------+
      |  o   o  o | <--- Max Capacity (Bucket Size B)
      | o  o   o  |
      |   o   o   |
      +-----------+
            |
            | (Request consumes 1 token)
            v
         [Allowed]  (or [Rejected] if empty)
```

#### Mathematical Representation
The current tokens $T_{\text{current}}$ at time $t_{\text{current}}$ is calculated lazily (without needing a background thread continuously refilling the bucket):

$$ T_{\text{current}} = \min\left(T_{\text{max}}, T_{\text{last\_checked}} + (t_{\text{current}} - t_{\text{last\_checked}}) \times R\right) $$

Where:
- $T_{\text{max}}$ is the maximum bucket capacity.
- $t_{\text{last\_checked}}$ is the Unix epoch timestamp when the bucket was last evaluated.
- $R$ is the refill rate in tokens per unit of time.

#### Analysis
* **Pros:** Highly dynamic. Seamlessly handles short-lived, bursty traffic. If a user has been idle, they can immediately execute a burst of up to $T_{\text{max}}$ parallel requests without delay.
* **Cons:** If downstream services (like a legacy SOAP payment processor) cannot survive brief bursts, the Token Bucket can allow traffic spikes that saturate downstream database connection pools.

---

### 2. Leaky Bucket

#### Mental Model: The Funnel
Imagine a funnel sitting above a delicate beaker. No matter how violently or irregularly you pour water (incoming request bursts) into the top of the funnel, the water slowly drips out of the small hole at the bottom at a perfectly constant, predictable rate of 2 drops per second (processing rate).
* If the funnel fills up to its rim (capacity), any additional water poured into it overflows immediately and falls onto the floor (requests rejected).

```
       Unstable Incoming Requests
         v   v       v
      +-----------------+
      | \             / |
      |  \           /  | <--- Funnel Capacity (Queue Size Q)
      |   \ o o o o /   |
      |    \ o o o /    |
      +------| |--------+
             | |
             v v
         Constant Smooth Output
```

#### Mathematical Representation
Let the queue size be $Q$. When a request arrives at $t_{\text{current}}$, the water level decreases by the leaked amount since the last request:

$$ W_{\text{current}} = \max\left(0, W_{\text{last}} - (t_{\text{current}} - t_{\text{last}}) \times D\right) $$

Where:
- $W$ is the current water volume in the funnel.
- $D$ is the constant leak rate (processing rate).
- If $W_{\text{current}} + 1 \le Q$, the request is appended to the queue, and $W_{\text{current}}$ is incremented by 1. Otherwise, the request is dropped.

#### Analysis
* **Pros:** Guarantees a perfectly flat, uniform egress rate. It completely protects fragile, slow legacy backend microservices from burst amplification.
* **Cons:** Introduces latency overhead. Even if your application server has massive idle capacity, requests are queued inside the bucket and processed at the fixed drip rate, artificially slowing down response times for normal users.

---

### 3. Fixed Window Counter

#### Mental Model: The Grid of Calendars
Imagine a traditional wall calendar where each grid cell represents a fixed 1-minute window (e.g., `12:00:00 to 12:01:00`). Every time a user initiates a request, you look at the current calendar block and increment its counter. If the counter exceeds 100 within that block, you reject all further requests until the second hand sweeps past 12, the minute rolls over, and you start a brand-new, empty calendar block.

```
Window 1 [12:00:00 - 12:01:00]      Window 2 [12:01:00 - 12:02:00]
+-----------------------------+     +-----------------------------+
|    Request Count: 99/100    |     |    Request Count: 12/100    |
+-----------------------------+     +-----------------------------+
```

#### Analysis
* **Pros:** Incredibly memory efficient. It only requires storing a single integer counter per user per window, which can be automatically evicted by Redis TTL.
* **Cons (The Double-Limit Boundary Burst):** If a malicious client concentrates their requests at the boundary of a window, they can bypass the rate limit completely.
  - Assume your limit is 100 requests per minute.
  - The client remains completely idle until `12:00:59`.
  - At `12:00:59`, they send 100 requests. This is approved (Window 1 is within limits).
  - At `12:01:01`, they send another 100 requests. This is approved (Window 2 is a fresh window and within limits).
  - **The Collapse:** The client has successfully processed **200 requests within a 2-second window**, bypassing your security threshold by 100% and triggering a down-stream cascade failure.

---

### 4. Sliding Window Log

#### Mental Model: The Exact Ledger
To prevent boundary cheating, you discard counters completely and replace them with an exact chronological log of timestamps. Think of this as a ledger where you write down the exact millisecond index of every request.
* Whenever a request arrives at `12:01:30`, you draw a sliding window backwards exactly 60 seconds (spanning to `12:00:30`).
* You scan your ledger, cross off and delete all timestamps older than `12:00:30`, and then count the remaining timestamps.
* If the remaining log size is less than 100, you write the new timestamp `12:01:30` onto the ledger and approve the request.

```
       Current Time: t = 12:01:30
       Window Start: t_start = 12:00:30
       
       Ledger: [ 12:00:15 (EVICT), 12:00:45, 12:01:05, 12:01:25 ]
                                      |
                                      +--> Count inside window = 3
```

#### Analysis
* **Pros:** Absolutely bulletproof. It is mathematically impossible to exploit boundary transitions because the window is calculated relative to the precise millisecond of the incoming request.
* **Cons (Memory Footprint):** Extremely expensive to scale. Under a high-throughput API gateway, storing the precise millisecond timestamps of millions of daily active users requires enormous memory. If a single user is allowed 5,000 requests per hour, you must store 5,000 64-bit timestamps in memory for that user alone. This quickly leads to multi-gigabyte Redis instances simply to maintain rate-limiting logs.

---

## Under the Hood: The Distributed Scaling Challenges

Transitioning our rate-limiting models from a single server to a distributed microservices cluster introduces severe, low-level concurrency failures. Let's look at the mechanics of these distributed bottlenecks.

### 1. The "Check-Then-Act" Race Condition

When scaling horizontally, rate-limiting state must be centralized in a high-speed, shared database (typically Redis). However, if your API gateways query Redis sequentially, you invite the classic **Check-Then-Act** race condition.

Let's assume our Token Bucket is sitting in Redis with `tokens = 1`. Two API gateway nodes receive parallel login requests from the same user at the exact same millisecond:

```
 API Gateway Node 1                         Redis Instance                         API Gateway Node 2
         |                                         |                                         |
         | ---- [1] GET tokens ------------------> |                                         |
         |                                         | <--- [2] GET tokens ------------------- |
         | <--- [3] Return tokens = 1 ------------ |                                         |
         |                                         | ---- [4] Return tokens = 1 -----------> |
         |                                         |                                         |
         |-- (1 > 0, ALLOWED!)                     |                                         |
         |                                         |                                         |-- (1 > 0, ALLOWED!)
         | ---- [5] SET tokens = 0 --------------> |                                         |
         |                                         | <--- [6] SET tokens = 0 --------------- |
         v                                         v                                         v
   Request Approved!                                                                   Request Approved!
                                                                                     (OVER-LIMIT ALLOWED!)
```

* **The Failure:** Both nodes read `tokens = 1`, conclude that the client has sufficient quota, and proceed to execute the API call. Two requests are approved when only one was legally allowed. In high-concurrency brute-force situations, this race condition completely invalidates your security defenses.

### 2. Lock Contention and the Latency Death Spiral
To solve the race condition, your first instinct might be to implement a Distributed Mutex using a library like Redlock:
1. Prior to checking Redis, an API node must acquire a global lock for the client key.
2. The node reads the token count, performs the subtraction, writes it back, and releases the lock.
3. Any concurrent request for that same client must queue, poll, and block until the lock is released.

* **The Collapse:** Under load, this pattern introduces disastrous performance bottlenecks. If a client sends 20 concurrent requests, those requests are serialized. The overall latency scales linearly ($O(K \times RTT)$), destroying your API gateway's throughput. Furthermore, if a node crashes while holding the lock, you must wait for the lock lease to expire, causing requests to hang for hundreds of milliseconds.

### 3. Multi-Region Replication Lag and "Double Spending"
For a global enterprise with deployments in `us-east-1` (Virginia) and `eu-west-1` (Dublin), routing all European rate-limiting checks to a single US Redis database is impossible (adding ~80ms of network latency to every single European API call).

To minimize latency, you deploy a multi-region active-active database cluster (like Redis Enterprise Active-Active or Amazon DynamoDB Global Tables) using Conflict-Free Replicated Data Types (CRDTs).

```
[ Client IP 1.2.3.4 ]                      [ Client IP 1.2.3.4 ]
         |                                          |
         v                                          v
+------------------+                       +------------------+
| us-east-1 Gateway|                       | eu-west-1 Gateway|
+------------------+                       +------------------+
         |                                          |
         v                                          v
+------------------+  Sync Lag (~150ms)     +------------------+
| Redis Primary US | <====================> | Redis Primary EU |
| (Tokens: 5 -> 4) |                       | (Tokens: 5 -> 4) |
+------------------+                       +------------------+
```

* **The Vulnerability:** Because data takes roughly 150ms to replicate across the Atlantic Ocean, a client can "double-spend" their rate limit. By sending parallel bursts of requests to both Virginia and Dublin gateways simultaneously, the client can consume 5 tokens in the US and 5 tokens in Europe before the state sync occurs, successfully pushing 10 requests past a strict 5-request security ceiling.

---

## The Solution: Atomic Lua Execution on Redis

To bypass distributed locks and eliminate race conditions, the industry-standard architectural solution is **Redis Lua Scripting**.

```
                           [ API Gateway Node 1 ]
                                     |
                                     | (Single, atomic payload)
                                     v
                        +--------------------------+
                        |      Redis Engine        |
                        |                          |
                        |  +--------------------+  |
                        |  |  Lua Script Engine |  | <--- Single-Threaded
                        |  |  (Compiles & Runs  |  |      Atomic Execution
                        |  |   Check & Decrement|  |
                        |  +--------------------+  |
                        +--------------------------+
                                     ^
                                     | (Blocked until script 1 completes)
                                     |
                           [ API Gateway Node 2 ]
```

### Why Lua Scripts Are Guaranteed Atomic
Redis uses a **single-threaded event loop** to execute commands. When you send a Lua script to Redis:
1. Redis stops processing any other commands.
2. It compiles (or retrieves from cache via SHA) and executes your entire Lua script from start to finish *on its main thread*.
3. No other client command can interleave or modify the keys while the script is running.

By moving your rate-limiting logic (evaluating token count, performing mathematical refill, and decrementing) *inside* the Lua script, you transform multiple sequential commands (Get, Calculate, Set) into a single, indivisible **Atomic Transaction**.

---

## Hands-On: Production-Grade Python & FastAPI Implementation

Let's build a complete, runnable, production-ready distributed rate limiter. We will implement an atomic, lazily filled **Token Bucket** algorithm utilizing Python (FastAPI) and Redis.

### 1. Defining the Atomic Lua Script
This script calculates the elapsed time, adds the regenerated tokens, evaluates the request against the limit, updates the state, and dynamically calculates and applies a Redis key TTL (ensuring idle keys do not accumulate in RAM).

```lua
-- Lua script to execute an atomic Token Bucket rate limit check.
-- KEYS[1]: The Redis key (e.g., "rate_limit:user_12345")
-- ARGV[1]: Max bucket capacity (e.g., 100)
-- ARGV[2]: Refill rate in tokens per millisecond (e.g., 0.05 tokens/ms = 3 tokens/sec)
-- ARGV[3]: Current Unix epoch timestamp in milliseconds
-- ARGV[4]: Tokens to consume per request (usually 1)

local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- Retrieve current bucket state
local state = redis.call("HMGET", key, "tokens", "last_updated")
local current_tokens = tonumber(state[1])
local last_updated = tonumber(state[2])

if not current_tokens then
    -- The bucket doesn't exist yet, initialize it as completely full
    current_tokens = max_tokens
    last_updated = now
else
    -- Lazily calculate refilled tokens based on millisecond delta
    local elapsed = now - last_updated
    if elapsed > 0 then
        local refilled = elapsed * refill_rate
        current_tokens = math.min(max_tokens, current_tokens + refilled)
        last_updated = now
    end
end

-- Evaluate if the request can be safely approved
local approved = 0
if current_tokens >= requested then
    current_tokens = current_tokens - requested
    approved = 1
    
    -- Save the updated state
    redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)
    
    -- Dynamic TTL optimization: set key expiration to the exact time
    -- it will take for the bucket to naturally fill back up to 100% capacity.
    local fill_time_ms = math.ceil((max_tokens - current_tokens) / refill_rate)
    -- Ensure expiration is at least 1 second (1000ms)
    local ttl_ms = math.max(1000, fill_time_ms)
    redis.call("PEXPIRE", key, ttl_ms)
else
    -- Request is blocked. Save current state to preserve any fractional refill.
    redis.call("HMSET", key, "tokens", current_tokens, "last_updated", last_updated)
end

return { approved, math.floor(current_tokens) }
```

---

### 2. The Python Implementation

To execute this, we will write a highly optimized Python wrapper using `redis-py`. Save this file as `rate_limiter.py`.

```python
"""
Distributed Rate Limiter using Redis Cluster and Atomic Lua execution.
Provides high-performance, low-latency API defense for FastAPI.
"""
import time
import redis
from typing import Tuple, Optional


class RedisTokenBucketLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis_client = redis_client
        # Register and cache the Lua script in Redis memory to minimize network payload
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
        # Register the script to obtain an optimized SHA1 hash for execution
        self.script_runner = self.redis_client.register_script(self.lua_script)

    def evaluate(
        self,
        identifier: str,
        capacity: int,
        refill_rate_per_sec: float,
        requested_tokens: int = 1
    ) -> Tuple[bool, int]:
        """
        Evaluates an API request against the distributed token bucket limiter.
        
        Args:
            identifier: The unique key identifier (e.g., IP address, user_id).
            capacity: The maximum capacity of the bucket.
            refill_rate_per_sec: Rate at which tokens regenerate per second.
            requested_tokens: Number of tokens this request consumes.
            
        Returns:
            Tuple containing:
            - approved (bool): True if allowed, False if blocked.
            - remaining_tokens (int): The current remaining tokens left in the bucket.
        """
        # Prefix keys to prevent collisions and isolate rate limiting namespaces
        # Use Hash Tags {} to ensure Redis Cluster routes keys to the same shard
        key = f"rate_limit:{{user:{identifier}}}"
        
        # Convert seconds to milliseconds for high-resolution timing
        refill_rate_ms = refill_rate_per_sec / 1000.0
        now_ms = int(time.time() * 1000)
        
        try:
            # Execute the script atomically via Redis evalsha
            approved, remaining = self.script_runner(
                keys=[key],
                args=[capacity, refill_rate_ms, now_ms, requested_tokens]
            )
            return bool(approved == 1), remaining
        except redis.RedisError as e:
            # Fall open strategy: Log error and allow traffic during a database outage.
            # Replace print with production logger (e.g., structlog)
            print(f"[-] Redis rate limiter failed: {e}. Falling open to prioritize availability.")
            return True, -1
```

---

### 3. Integrating with FastAPI Middleware

Below is a complete FastAPI integration showing how to wire this limiter directly into your HTTP pipeline. Save this file as `main.py`.

```python
"""
FastAPI Integration with Redis Atomic Rate Limiting Middleware.
"""
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
import redis
from rate_limiter import RedisTokenBucketLimiter

app = FastAPI(title="Serenya Secured Distributed API Gateway")

# Initialize a pooled, thread-safe Redis client connection
redis_pool = redis.ConnectionPool(host="localhost", port=6379, db=0, decode_responses=True)
redis_client = redis.Redis(connection_pool=redis_pool)
limiter = RedisTokenBucketLimiter(redis_client)


@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    # Determine client identity (Using IP address for demo; use JWT claims in production)
    client_ip = request.client.host if request.client else "unknown"
    
    # Configure limits dynamically based on endpoint hierarchy
    # Example: Capped at 10 requests max, refilling at 2 tokens per second (0.5s per token)
    capacity = 10
    refill_rate = 2.0  # tokens per second
    
    # Evaluate limit atomically in Redis
    approved, remaining = limiter.evaluate(
        identifier=client_ip,
        capacity=capacity,
        refill_rate_per_sec=refill_rate
    )
    
    if not approved:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "Too Many Requests",
                "message": f"Global API limit exceeded. Capacity: {capacity}/min.",
                "status": "rate_limited"
            },
            headers={
                "Retry-After": "10",
                "X-RateLimit-Limit": str(capacity),
                "X-RateLimit-Remaining": "0"
            }
        )
    
    # Process request if approved
    response = await call_next(request)
    
    # Append helpful debugging metadata to response headers
    response.headers["X-RateLimit-Limit"] = str(capacity)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return response


@app.get("/api/v1/resource")
async def get_secure_resource():
    return {"status": "success", "data": "This endpoint is guarded globally."}


if __name__ == "__main__":
    import uvicorn
    # Start the server locally
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

---

## Expert Insights: Extreme Scale Strategies

When operating at an extreme scale (e.g., processing 100,000 requests per second across a global network), query amplification to Redis can degrade system performance. To survive, distributed architects leverage a combination of gossip protocols and local edge caching.

```
                         [ Global Client Requests ]
                                    |
                                    v
                       +-------------------------+
                       |   Edge Layer (Envoy)    |
                       |  - Local Token Bucket   | <--- Handled at edge
                       |  - Drops obviously bad  |      without querying core Redis
                       +-------------------------+
                                    |
                                    | (Batch sync / Gossip updates)
                                    v
                       +-------------------------+
                       |      Redis Cluster      |
                       |  - Keeps global state   |
                       +-------------------------+
```

### Gossip Protocols for Synchronization
In peer-to-peer distributed networks (like Apache Cassandra), nodes use **Gossip Protocols** (epidemic information dissemination algorithms) to share rate-limiting states directly without relying on a centralized database.
* Nodes exchange lightweight, periodic status messages ("gossip rounds") containing localized client transaction counters.
* Each node aggregates these reports to build an eventually consistent global state map.
* **Tradeoff:** Excellent durability and no database single point of failure (SPOF). However, the system is strictly *eventually consistent*, which can allow malicious clients to exploit replication windows to bypass rates momentarily.

### Local Edge Filtering (The Envoy/Cloudflare Pattern)
To protect your core Redis Cluster from getting saturated by request surges:
1. **Edge Proxies (like Envoy or Cloudflare Workers)** execute a fast, local check using a local sliding window in memory.
2. If the client makes an obviously massive, volume-heavy attack, the edge proxy drops the requests immediately at the network border without forwarding any queries to your internal Redis instances.
3. If the request is within normal parameters, the edge proxy passes it downstream to your API gateway, which evaluates the strict, centralized database lock.
4. **The Savings:** This hybrid model filters out 99% of brute-force and DDoS noise at the edge, reducing Redis query volume by orders of magnitude.

---

## Common Misconceptions

### Misconception 1: "Fail-Closed is always the right security posture for API rate limiters."
**Reality:** While failing closed is a robust security practice, it is often a business disaster. If Redis goes down under a brief load spike, failing closed means 100% of your legitimate users are locked out of your application. In consumer-facing production platforms, rate limiters are almost always designed to **Fail Open**. They log the exception, trigger alert pager alerts for the platform reliability team, and bypass verification checks, ensuring business continuity during database outages.

### Misconception 2: "Distributed Locks are required to ensure strict consistency in rate limiters."
**Reality:** Absolutely not. Distributed locks introduce severe synchronization latency, high lock contention, and complex dead-lock scenarios. They are a massive anti-pattern for performance-critical systems. Single-threaded **Redis Lua scripts** or Redis atomic primitives (like `INCRBY` or `ZREMRANGEBYSCORE`) achieve absolute atomic consistency inside Redis memory without the overhead of external locking states.

### Misconception 3: "Redis Lua scripts execute concurrently across a Redis Cluster."
**Reality:** When running Redis in a clustered configuration, a Lua script can *only* access keys that reside on the exact same physical shard. If a script attempts to read or write keys belonging to multiple shards, Redis will crash with a runtime cross-slot command exception.
* **The Solution:** You must enforce **Hash Tags** inside your keys (e.g., `{user:12345}:rate_limit` and `{user:12345}:tokens`). This forces Redis to hash only the content within the curly braces, guaranteeing that all keys for a specific user land on the exact same cluster shard, keeping Lua execution localized and lightning-fast.

---

## Pause and Think

> **Critical Architectural Question:** Assume you are designing a high-throughput public API gateway and must select between **Sliding Window Log** and **Token Bucket**. Under what specific structural conditions does Sliding Window Log become an unacceptable bottleneck in terms of memory footprint, and how does Token Bucket elegantly mitigate this risk?

### Answer
The core bottleneck of the **Sliding Window Log** is its space complexity: **$O(N)$ Space**, where $N$ is the number of requests processed within the window. 
* If a high-frequency telemetry API allows a single system sensor to make 10,000 requests per minute, the sliding log must store 10,000 distinct Unix epoch timestamps (typically 64-bit integers) inside a sorted set (`ZSET`) in Redis memory. For 1,000 sensors, this represents 10 million memory elements, rapidly exhausting server RAM.
* **The Token Bucket alternative:** The Token Bucket requires exactly **$O(1)$ Space** regardless of the request volume. It only stores a simple hash map with two numeric values: `tokens` (a float) and `last_updated` (an integer). Whether the client makes 5 requests or 5,000,000 requests per minute, the Redis memory footprint remains static, saving gigabytes of expensive RAM.

---

## Key Takeaways

* **In-memory limiters fail** under horizontal scaling because stateless application nodes cannot share state without a centralized caching layer, permitting overlimit bypasses.
* **The Token Bucket** algorithm handles bursty client traffic efficiently, whereas **Leaky Bucket** acts as a funnel, smoothing output to prevent downstream resource saturation.
* **Fixed Window Counter** algorithms are vulnerable to boundary spikes, allowing clients to send double the legal traffic limit during window roll-overs.
* **Atomic Redis Lua Scripting** eliminates complex check-then-act race conditions by executing token logic in a single, non-blocking single-threaded transaction.
* Deploying a **Hybrid Edge Architecture** (local filters in Envoy paired with a global fallback in Redis) shields backend databases from DDoS storms without saturating internal caching layers.

---

## What to Learn Next

To expand your expertise in Distributed Systems Engineering, explore:
* **The PACELC Theorem:** How to trade off consistency and latency under partition-free conditions.
* **Token Buckets with Priority Queues:** Implementing adaptive rate limiters that throttle low-tier users while prioritizing premium billing accounts under global resource starvation.
* **Redis Cluster Partitioning & Resharding:** How hash slots are redistributed across physical nodes when adding new Redis shards dynamically.
