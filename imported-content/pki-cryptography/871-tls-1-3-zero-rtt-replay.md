# TLS 1.3 0-RTT: The Dangers of Early Data Replay Attacks and Non-Idempotent APIs

## The Problem: The Latency vs. Security Trade-Off

In high-frequency networks, latency is the ultimate bottleneck. Standard TLS 1.2 requires two network round-trips (2-RTT) to complete a handshake before application data can be sent. TLS 1.3 optimized this by reducing the handshake to a single round-trip (1-RTT). To achieve even greater performance, TLS 1.3 introduced **0-RTT (Zero Round-Trip Time)** mode, allowing clients that have previously connected to a server to send encrypted application data ("Early Data") in the very first flight of the handshake.

However, this dramatic optimization destroys a foundational cryptographic guarantee: **replay protection**. Because the server cannot provide a unique, interactive random challenge (nonce) before the client transmits its 0-RTT packet, an attacker sitting on the wire can capture this initial packet and replay it to the server.

If the replayed early data contains non-idempotent HTTP API requests (such as a POST request to `/api/v1/payments/checkout` or a PUT request to `/api/v1/user/balance`), the server will process the operation multiple times, leading to duplicate transactions, unauthorized modifications, or state corruption.

```text
Client                              Attacker / Wire                          Server
  |                                        |                                    |
  |--- 0-RTT (ClientHello + Early Data) -->|                                    |
  |    GET /api/v1/profile (Idempotent)    |                                    |
  |    POST /api/v1/transfer (NOT!)        |--- 1. Captured & Forwarded ------->| (Processed)
  |                                        |                                    |<-- 1-RTT Response --
  |                                        |                                    |
  |                                        |--- 2. Replayed by Attacker ------->| (Processed TWICE!)
  |                                        |                                    |<-- 1-RTT Response --
```

## The Solution: Designing Robust Replay Defenses

Securing systems against TLS 1.3 0-RTT replay attacks requires a multi-layered approach across both the transport layer and the application layer.

### 1. The Protocol Layer: Anti-Replay Caches
TLS 1.3 servers must maintain an anti-replay cache of unique identifiers associated with session tickets.
* **ClientHello Monotonicity**: The server tracks the Client Hello’s unique session identifier (or obfuscated ticket age).
* **Sliding Window**: The server maintains a sliding window of accepted times. If a ticket age deviates too far from the expected server time, or if the identifier is already in the cache, the server rejects the 0-RTT data and falls back to a standard 1-RTT handshake.

### 2. The Gateway Layer: Restricting HTTP Methods
Most reverse proxies (e.g., Nginx, Cloudflare) or API Gateways implement safe defaults for early data:
* **Allowing Only Safe Methods**: Only permit `GET`, `HEAD`, and `OPTIONS` requests within the 0-RTT flight.
* **Forwarding Header Signals**: Gateways can forward the header `Early-Data: 1` to upstream application services. This allows the application to inspect the request origin and make granular security decisions.

### 3. The Application Layer: Strict Idempotency Validation
For non-idempotent endpoints that must accept early data, the application must enforce an idempotency key check using a fast memory store (e.g., Redis).

---

## Implementation: Go Middleware for Early-Data Anti-Replay

Below is a production-grade Go HTTP middleware demonstrating how to process incoming early data, detect the `Early-Data: 1` header, and reject or securely handle non-idempotent requests using an API-level sliding-window token check in Redis.

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-redis/redis/v8"
)

var ctx = context.Background()

// AntiReplayMiddleware enforces replay protection against TLS 0-RTT requests.
type AntiReplayMiddleware struct {
	RedisClient *redis.Client
}

func NewAntiReplayMiddleware(rdb *redis.Client) *AntiReplayMiddleware {
	return &AntiReplayMiddleware{RedisClient: rdb}
}

func (arm *AntiReplayMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	// 1. Detect if the request arrived via TLS 1.3 0-RTT Early Data
	isEarlyData := r.Header.Get("Early-Data") == "1"

	if isEarlyData {
		// 2. Reject non-idempotent methods immediately for early data
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			w.Header().Set("Retry-After", "0")
			http.Error(w, "425 Too Early: Non-idempotent operations rejected on 0-RTT", http.StatusTooEarly)
			return
		}

		// 3. For GET requests, check if they contain a custom request identifier (e.g. idempotency token)
		requestId := r.Header.Get("X-Request-ID")
		if requestId != "" {
			// Try to set the request ID in Redis with an expiration window matching the TLS ticket lifetime (e.g. 2 hours)
			lockKey := fmt.Sprintf("replay_lock:%s", requestId)
			acquired, err := arm.RedisClient.SetNX(ctx, lockKey, "1", 2*time.Hour).Result()
			if err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}

			if !acquired {
				// Request ID has already been seen; potential replay attack!
				http.Error(w, "425 Too Early: Replay attempt detected", http.StatusTooEarly)
				return
			}
		}
	}

	// Request is safe to proceed
	next(w, r)
}

func main() {
	// Setup mock router and server
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	middleware := NewAntiReplayMiddleware(rdb)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/payment", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Payment Processed Safely")
	})

	// Wrap handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		middleware.ServeHTTP(w, r, mux.ServeHTTP)
	})

	fmt.Println("Server starting on :8443 with 0-RTT mitigation...")
	_ = http.ListenAndServeTLS(":8443", "server.crt", "server.key", handler)
}
```

---

## Security Considerations and System Hardening

1. **The "Too Early" Fallback (`HTTP 425`)**:
   If an application or gateway detects that a request could be a replayed 0-RTT request, it should reply with an HTTP `425 Too Early` status code. RFC 8470 specifies that when a client receives a 425 response, it *must* retry the request over a safe, 1-RTT connection where replay is impossible.
2. **Single-Use Session Tickets**:
   Servers should implement single-use session tickets. Once a session ticket is used for a 0-RTT connection, the server must invalidate that ticket in its session cache, completely blocking any duplicate handshakes.
3. **Strict Client-Side Policies**:
   Client developers (e.g., mobile apps) must never put sensitive business APIs inside the initial flight. Only read-only bootstrap configurations should ever be marked as safe for 0-RTT early data.
