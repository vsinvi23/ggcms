---
title: "Go Channels: Unbuffered Rendezvous vs. Buffered Queues"
description: "The practical difference between unbuffered and buffered Go channels - synchronous handoff vs bounded async queue - with a runnable example showing the deadlock unbuffered channels expose and buffered channels hide."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "channels"
  - "concurrency"
  - "goroutines"
  - "deadlocks"
---

# Go Channels: Unbuffered Rendezvous vs. Buffered Queues

## The Problem: Safe Concurrency Without Lock Contention

Managing shared state across multiple threads is notoriously difficult. Traditional multi-threaded languages lean on shared memory protected by mutexes, condition variables, and read-write locks — a model prone to deadlock, race conditions, and lock-contention slowdowns.

Go instead implements the Communicating Sequential Processes (CSP) model, summarized by its own design philosophy: *"Do not communicate by sharing memory; instead, share memory by communicating."* The mechanism for that is the **channel**. But developers still routinely hit unexpected deadlocks and latency issues because they don't understand the different blocking behavior of unbuffered versus buffered channels.

---

## The Mental Model: Synchronous Handoff vs. Asynchronous Queue

Channels behave differently depending on their capacity:

1. **Unbuffered channels (synchronous)** — capacity zero, facilitating a direct handoff.
2. **Buffered channels (asynchronous)** — a predefined capacity, acting as a bounded circular queue that decouples sender from receiver.

```text
UNBUFFERED (Rendezvous)
Sender (Blocks) ---------> [ Handoff Point ] ---------> Receiver (Blocks)
                              (Zero Capacity)

BUFFERED (Bounded Queue)
Sender (Non-blocking) ---> [ Slot 1 | Slot 2 | Slot 3 ] ---> Receiver (Non-blocking)
                              (Capacity = 3)
```

Both are backed by the same underlying `hchan` runtime struct (ring buffer, mutex, and `sendq`/`recvq` wait queues of parked `sudog`s — see the companion deep dive on `hchan` internals for the full memory layout). The difference is purely in how full the ring buffer needs to get before a sender or receiver blocks.

### Unbuffered Channels (Rendezvous)

With no internal buffer, `ch <- x` blocks the sending goroutine until a receiver executes `<-ch`. A receiver equally blocks until a sender shows up. As an optimization, if a receiver is already parked in `recvq`, the sender writes its value **directly into the receiver's stack memory**, bypassing the ring buffer and the global channel lock's slow path entirely.

### Buffered Channels (Bounded Queue)

A buffered channel accepts sends without blocking as long as its ring buffer `buf` has room:

- **Send blocks** once `buf` is full — the sender parks in `sendq`.
- **Receive blocks** when `buf` is empty — the receiver parks in `recvq`.

---

## Practical Implementation: Preventing Deadlocks and Leaks

```go
package main

import (
	"fmt"
	"time"
)

// Synchronous worker (unbuffered)
func syncWorker(ch chan string) {
	fmt.Println("[Sync] Worker starting computation...")
	time.Sleep(100 * time.Millisecond)
	ch <- "Job Complete" // Blocks until main goroutine reads it
	fmt.Println("[Sync] Worker resumed after handoff.")
}

// Asynchronous producer (buffered)
func asyncProducer(ch chan int) {
	for i := 1; i <= 3; i++ {
		ch <- i // Does not block because channel has capacity = 3
		fmt.Printf("[Async] Sent item %d without blocking\n", i)
	}
	close(ch)
}

func main() {
	// 1. Unbuffered Channel (Synchronous)
	syncChan := make(chan string)
	go syncWorker(syncChan)
	time.Sleep(200 * time.Millisecond) // Let worker reach send block
	msg := <-syncChan
	fmt.Printf("[Main] Received: %s\n\n", msg)

	// 2. Buffered Channel (Asynchronous)
	bufferedChan := make(chan int, 3)
	go asyncProducer(bufferedChan)

	time.Sleep(100 * time.Millisecond) // Allow producers to fill buffer
	for num := range bufferedChan {
		fmt.Printf("[Main] Processed item %d\n", num)
	}
}
```

If we tried writing to `syncChan` without ever starting a receiver goroutine, the Go runtime would immediately raise a deadlock panic (`fatal error: all goroutines are asleep - deadlock!`) — because on an unbuffered channel, that's a hard guarantee, not a race. The buffered channel, by contrast, lets `asyncProducer` finish all three sends immediately and exit, entirely decoupled from when `main` gets around to reading them; nothing observes a deadlock unless the buffer itself fills up.

This asymmetry is the practical trap: a bug that would surface instantly as a deadlock on an unbuffered channel can hide silently on a buffered one until the buffer happens to fill under load in production.

---

## Key Takeaways

- **Unbuffered channels** guarantee synchronization between goroutines — use them when you need a precise coordination point (a signal, a handoff of ownership) rather than a data pipe.
- **Buffered channels** decouple producer and consumer timing, turning a synchronous barrier into an asynchronous pipeline — but must be sized deliberately, since an unbounded producer against a fixed buffer just moves the point where backpressure (or a deadlock) eventually appears.
- **Blocking is governed by the runtime wait queues** (`sendq`, `recvq`), not busy-polling — a parked goroutine consumes no CPU cycles while it waits.
