# Rate Limiting as a Security Control: Defeating Credential Stuffing and L7 DDoS

At the application layer, availability and authentication security are inextricably linked. Without robust rate limiting, any endpoint—particularly resource-heavy ones like `/api/v1/auth/login` or PDF generation routes—becomes a massive liability. Attackers exploit these gaps through credential stuffing (testing millions of stolen username/password pairs) or Layer 7 (L7) Distributed Denial of Service (DDoS) attacks designed to exhaust database connection pools or CPU cycles.

---

## The Problem: Resource Exhaustion and Account Takeovers

When an application server receives an HTTP request, it expends physical resources (CPU, RAM, database connections, bandwidth) to compute the response. 
An authentication route typically requires:
1. Parsing the incoming JSON/Form request.
2. Querying a database to check for user existence.
3. Performing a cryptographic hashing operation (such as Argon2id or bcrypt) to verify the password.

Cryptographic hashing is intentionally CPU-intensive, taking between 50ms and 500ms by design. If an attacker submits 1,000 login requests per second, they can easily lock up all available CPU threads, rendering the application completely unresponsive to legitimate users.

Furthermore, credential stuffing relies on high-volume automated spraying. Without rate limits, an attacker can compromise thousands of accounts in minutes.

```
       [ Distributed Botnet / Attackers ]
          |            |             |
     (10,000 requests / second to /login)
          v            v             v
   +---------------------------------------+
   |             Reverse Proxy             | (No rate limiting configured)
   +---------------------------------------+
                       |
                       v
   +---------------------------------------+
   |          Application Server           | (Spawns worker threads, CPU spiked to 100%)
   +---------------------------------------+
                       |
                       +---> [ Argon2id Password Hashing Engine ] (CPU Bottleneck)
                       |
                       +---> [ PostgreSQL Connection Pool ] (Exhausted, returning 503)
```

---

## Technical Architectures: Rate Limiting Algorithms

Securing these endpoints requires placing an intelligent gatekeeper in front of the application layer. The three most common algorithms for rate limiting are:

1. **Token Bucket:** Tokens are added to a bucket at a constant rate. Each request consumes a token. If the bucket is empty, the request is rejected. This supports short bursts of traffic.
2. **Leaky Bucket:** Requests enter a queue and are processed (leaked) at a constant, smooth rate. Good for smoothing out traffic, but adds latency to bursts.
3. **Sliding Window Log:** Stores timestamps of every request in a sorted set (e.g., in Redis). It calculates the exact number of requests made within the last window (e.g., 60 seconds). This is the most precise algorithm but is memory-intensive.
4. **Sliding Window Counter:** A low-memory approximation of the sliding window log that blends counters from the previous window and the current window.

```
Token Bucket:                           Sliding Window Log:
+------------------------+              Req Timestamps in Redis Sorted Set (ZSET)
|  Tokens added (10/s)   |              
|  =======>              |              Window: [ 12:00:00  to  12:01:00 ]
|  [ * * * * * * * * ]   |              +------------------------------------+
|  Max Capacity: 100     |              | 12:00:05 | 12:00:15 | 12:00:42     | -> Count: 3
+------------------------+              +------------------------------------+
       |                                (Timestamps older than 12:00:00 are pruned)
       v Request Consumes Token
```

---

## Client Identification Pitfalls: The Spoofing Vector

A rate limiter is only as reliable as its client identification mechanism. If you limit solely by IP address using the `X-Forwarded-For` HTTP header, you invite disaster:
* **The Spoofing Threat:** Attackers can inject arbitrary IPs in the header (`X-Forwarded-For: 1.2.3.4`), tricking your rate limiter into thinking each request comes from a unique client.
* **The Collateral Damage Threat:** Legitimate users behind a corporate NAT or proxy share a single public IP. Aggressive IP-based rate limiting will lock out hundreds of real users.

### The Solution: Multi-Key Rate Limiting

A production-grade rate limiter uses a hybrid key strategy:
1. **Unauthenticated Routes (e.g., Login):** Combine the client's validated IP (parsed correctly from trusted upstream proxy configurations) with the target username: `limit:login:username@domain.com` and `limit:ip:1.2.3.4`.
2. **Authenticated Routes:** Use the authenticated Session ID or JWT Subject: `limit:user:1093284`.

---

## Robust sliding Window Implementation (Go + Redis)

The following Go implementation uses Redis and a Lua script to implement an atomic, thread-safe Sliding Window Log rate limiter. Using Lua ensures that the entire "read-and-update" transaction runs atomically inside Redis, preventing race conditions under high concurrency.

### Redis Lua Script (`sliding_window.lua`)

```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local clear_before = now - window

-- Remove timestamps older than the current sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

-- Count requests in the current window
local req_count = redis.call('ZCARD', key)

if req_count < limit then
    -- Log the current request with a unique payload (using timestamp as score and value)
    redis.call('ZADD', key, now, now .. "_" .. math.random())
    -- Set TTL on the set to avoid memory leaks
    redis.call('EXPIRE', key, window + 1)
    return 1 -- Allowed
else
    return 0 -- Blocked
end
```

### Go Implementation

```go
package ratelimit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
)

var slidingWindowLua = redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local rand_val = ARGV[4]

local clear_before = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)
local req_count = redis.call('ZCARD', key)

if req_count < limit then
    redis.call('ZADD', key, now, now .. "_" .. rand_val)
    redis.call('EXPIRE', key, window + 1)
    return 1
else
    return 0
end
`)

type RateLimiter struct {
	rdb    *redis.Client
	limit  int
	window time.Duration
}

func NewRateLimiter(rdb *redis.Client, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		rdb:    rdb,
		limit:  limit,
		window: window,
	}
}

// GetTrustedIP extracts the real IP address from a trusted upstream reverse proxy.
func GetTrustedIP(r *http.Request) (string, error) {
	// In production, verify that r.RemoteAddr matches your trusted reverse proxy (e.g., Cloudflare, AWS ALB)
	// before reading X-Forwarded-For.
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		clientIP := strings.TrimSpace(parts[0])
		if parsed := net.ParseIP(clientIP); parsed != nil {
			return clientIP, nil
		}
	}
	
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "", err
	}
	return ip, nil
}

func (rl *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	now := time.Now().UnixNano() / int64(time.Millisecond)
	windowMs := rl.window.Milliseconds()

	// Generate a unique random string to prevent member collisions in Redis ZSET
	randBytes := make([]byte, 8)
	if _, err := rand.Read(randBytes); err != nil {
		return false, err
	}
	randVal := hex.EncodeToString(randBytes)

	res, err := slidingWindowLua.Run(ctx, rl.rdb, []string{key}, now, windowMs, rl.limit, randVal).Int()
	if err != nil {
		return false, err
	}

	return res == 1, nil
}

// Middleware returns an HTTP handler middleware for rate limiting.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, err := GetTrustedIP(r)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		key := "rate_limit:" + ip
		allowed, err := rl.Allow(r.Context(), key)
		if err != nil {
			// Fail-open or Fail-closed depends on business security posture.
			// Fail-closed is safer to prevent bypass during Redis degradation.
			http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
			return
		}

		if !allowed {
			w.Header().Set("Retry-After", "60")
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}
```

---

## Architecture Mitigation Checklist

1. **Deploy Envoy or Cloudflare at the Edge:** Block simple, volumetric layer 7 volumetric flooding before it touches application VMs or Kubernetes clusters.
2. **Implement Dual-Scope Limits:** Maintain both an IP-wide sliding window (e.g., 60 requests/min) and an account-specific rate limit (e.g., 5 login attempts/min) to prevent low-and-slow credential stuffing attacks.
3. **Handle Failure Gracefully:** If the Redis rate-limiting cluster falls offline, ensure your application alerts security operations immediately. In critical settings, fail-closed to prevent brute-force attacks from running unmonitored during an outage.
