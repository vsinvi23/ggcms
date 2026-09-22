# Designing Traffic Shapers: Implementing the Leaky Bucket Algorithm for Rate Limiting

## The Problem: Thundering Herds and Resource Exhaustion

Public-facing APIs and internal microservices must defend against volumetric abuse. Whether from malicious DDoS attacks, poorly written client scripts, or legitimate traffic spikes (thundering herds), sudden surges in request volume can overwhelm backend databases, exhaust connection pools, and trigger cascading systemic failures.

Rate limiting is the perimeter defense. While algorithms like the Token Bucket allow for bursts of traffic, the **Leaky Bucket** algorithm is specifically designed to enforce a strict, consistent output rate. It acts as a traffic shaper, smoothing out bursty input into a steady, manageable stream of processing.

## Leaky Bucket Mechanics

Imagine a bucket with a hole in the bottom. 
1. **Input:** Water (API requests) pours into the top of the bucket at an unpredictable, varying rate.
2. **Capacity:** The bucket has a finite volume. If water arrives when the bucket is full, it spills over and is discarded (requests are rejected with HTTP 429 Too Many Requests).
3. **Output:** Water drips out of the hole at the bottom at a constant, unvarying rate. 

This mechanism guarantees that no matter how fast requests arrive, the underlying service will only ever process them at the configured drip rate.

## ASCII Architecture: The Leaky Queue

```text
       Bursty Ingress Traffic (100 req/sec)
                │    │    │
                ▼    ▼    ▼
          ┌─────────────────────┐
Spillover │     [ Request 5 ]   │ 
 ───────▶ │     [ Request 4 ]   │ Queue Capacity
(HTTP 429)│     [ Request 3 ]   │ (Max bucket size)
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

## Implementation: Asynchronous Queueing

Implementing a true leaky bucket often involves decoupling the ingestion of requests from their processing. This is typically achieved using a bounded queue and a background worker thread.

Below is a robust implementation in Go, utilizing channels to represent the bucket and a ticker to represent the leak.

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
		// Task successfully added to the bucket
		return nil
	default:
		// Bucket is full, spill over
		return ErrBucketFull
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
				// Process the task at the exact tick interval
				task()
			default:
				// Bucket is empty, do nothing
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

## Trade-offs and Considerations

1. **Latency Introduction:** Because the Leaky Bucket queues requests and processes them at a fixed rate, legitimate requests arriving during a burst will experience increased latency while they wait in the queue. 
2. **Resource Consumption:** Holding HTTP connections open while requests sit in the bucket consumes socket file descriptors and memory. For high-scale ingress, it is often better to use a variant like the Token Bucket, which provides instant rejection or acceptance without holding connections.
3. **Traffic Shaping vs. Policing:** Leaky Bucket is a *shaper* (it delays and smooths). Token Bucket is a *policer* (it allows bursts but drops excess immediately).

By implementing a Leaky Bucket, engineers can protect fragile backend systems from sudden spikes, ensuring a predictable maximum load profile at the cost of queueing latency.
