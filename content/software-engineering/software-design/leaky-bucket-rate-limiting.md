---
title: "Leaky Bucket Rate Limiting: Shaping Bursty Traffic Into a Steady Stream"
description: "How the Leaky Bucket algorithm smooths bursty API traffic into a constant output rate using a bounded queue and background drip worker, with a full Go implementation and its trade-offs against Token Bucket."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "rate-limiting"
  - "leaky-bucket"
  - "traffic-shaping"
  - "api-throttling"
  - "backpressure"
---

# Leaky Bucket Rate Limiting: Shaping Bursty Traffic Into a Steady Stream

## The Problem: Thundering Herds and Resource Exhaustion

Public-facing APIs and internal microservices must defend against volumetric abuse. Whether it comes from malicious DDoS traffic, a poorly written client retry loop, or a perfectly legitimate flash-sale spike, a sudden surge in request volume can exhaust connection pools, overwhelm backend databases, and cascade into a full outage.

Rate limiting is the perimeter defense against this. Where the Token Bucket algorithm explicitly *allows* short bursts up to a cap, the **Leaky Bucket** algorithm takes the opposite approach: it enforces a strict, constant output rate regardless of how bursty the input is. It acts as a traffic shaper — smoothing spiky ingress into a steady, predictable stream that a downstream service can always handle.

## Leaky Bucket Mechanics

Picture a literal bucket with a small hole drilled in the bottom:

1. **Input** — water (API requests) pours in at an unpredictable, bursty rate.
2. **Capacity** — the bucket holds a finite volume. If water arrives while the bucket is already full, it spills over and is discarded (the request is rejected with `HTTP 429 Too Many Requests`).
3. **Output** — water drips out of the hole at a fixed, unvarying rate, no matter how much water is currently in the bucket.

No matter how fast requests arrive, the service behind the bucket only ever processes them at the configured drip rate.

```text
       Bursty Ingress Traffic (100 req/sec)
                │    │    │
                ▼    ▼    ▼
          ┌─────────────────────┐
Spillover │     [ Request 5 ]   │
 ───────▶ │     [ Request 4 ]   │ Queue Capacity
(HTTP 429)│     [ Request 3 ]   │ (max bucket size)
          │     [ Request 2 ]   │
          └──────────┬──────────┘
                     │
                     ▼
          Strict Egress Drip Rate
                 (10 req/sec)
                     │
                     ▼
            [ Backend Service ]
```

## Implementation: Asynchronous Queueing in Go

A true Leaky Bucket decouples request *ingestion* from request *processing* using a bounded queue plus a background worker that drains it on a fixed tick. Below, the queue is a buffered Go channel (the bucket) and a `time.Ticker` is the leak.

```go
package ratelimit

import (
	"errors"
	"time"
)

// ErrBucketFull is returned when the leaky bucket is at capacity.
var ErrBucketFull = errors.New("429 Too Many Requests: bucket full")

type LeakyBucket struct {
	queue    chan func()   // The bucket holding pending tasks
	dripRate time.Duration // The rate at which the bucket leaks
	stop     chan struct{}
}

// NewLeakyBucket initializes a bucket with a max capacity and a fixed drip interval.
func NewLeakyBucket(capacity int, dripRate time.Duration) *LeakyBucket {
	lb := &LeakyBucket{
		queue:    make(chan func(), capacity),
		dripRate: dripRate,
		stop:     make(chan struct{}),
	}
	go lb.leak()
	return lb
}

// Submit attempts to add a task to the bucket.
func (lb *LeakyBucket) Submit(task func()) error {
	select {
	case lb.queue <- task:
		return nil // successfully added to the bucket
	default:
		return ErrBucketFull // bucket is full, spill over
	}
}

// leak runs in the background, processing tasks at a strict rate.
func (lb *LeakyBucket) leak() {
	ticker := time.NewTicker(lb.dripRate)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			select {
			case task := <-lb.queue:
				task() // process exactly one task per tick
			default:
				// bucket is empty this tick, nothing to do
			}
		case <-lb.stop:
			return
		}
	}
}

// Stop shuts down the background worker.
func (lb *LeakyBucket) Stop() {
	close(lb.stop)
}
```

```go
// Usage: an HTTP handler that shapes bursty client traffic into a 10 req/sec drip.
func main() {
	bucket := NewLeakyBucket(50, 100*time.Millisecond) // 100ms tick = 10 req/sec
	defer bucket.Stop()

	http.HandleFunc("/api/resource", func(w http.ResponseWriter, r *http.Request) {
		err := bucket.Submit(func() {
			// actual work happens here, on the leak goroutine's schedule
			processRequest(r)
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})
}
```

## Trade-offs and Considerations

1. **Latency introduction.** Because requests queue and only drain at a fixed rate, legitimate traffic arriving during a burst experiences added latency waiting its turn — this is a *shaper*, not just a limiter.
2. **Resource consumption.** Holding requests (and their connections, if synchronous) in the bucket consumes memory and socket file descriptors. For high-scale ingress where you'd rather reject instantly than queue, Token Bucket is usually the better fit.
3. **Shaping vs. policing.** Leaky Bucket *delays and smooths* traffic to a constant rate. Token Bucket *polices* traffic — it allows bursts up to the bucket's token capacity and drops excess instantly, without holding anything in a queue.

## Architectural Takeaway

Reach for Leaky Bucket specifically when a downstream system (a legacy database, a rate-limited third-party API, a batch job) genuinely cannot tolerate *any* burst above a fixed rate, and you can accept added queueing latency in exchange for that guarantee. If instead you want to allow short legitimate bursts (a user clicking "refresh" five times) while still capping sustained throughput, Token Bucket is the more common choice for public API gateways.
