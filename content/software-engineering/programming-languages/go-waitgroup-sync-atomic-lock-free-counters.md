---
title: "Go sync.WaitGroup and sync/atomic: Wait-Free Counters with Hardware CAS"
description: "Why mutexes are overkill for simple shared counters, how sync/atomic uses hardware Compare-And-Swap instructions to update state without blocking, and a worker-pool pattern combining WaitGroup with atomic counters."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "golang"
  - "concurrency"
  - "sync-waitgroup"
  - "sync-atomic"
  - "compare-and-swap"
  - "goroutines"
---

# Go sync.WaitGroup and sync/atomic: Wait-Free Counters with Hardware CAS

## The Problem: The High Cost of Mutexes

In highly concurrent Go applications, goroutines constantly need to share and update state: active connection counts, request metrics, task-completion tallies. The default tool for protecting shared state is `sync.Mutex`.

But mutexes carry a real performance penalty under contention. When many goroutines compete for one lock, only one wins; the rest block, triggering context switches at the OS and Go scheduler level. If the shared state is a plain numeric counter, locking an entire critical section just to do `x = x + 1` is overkill — and under high contention it becomes a serious bottleneck.

## The Mental Model: Hardware Compare-And-Swap (CAS)

`sync/atomic` sidesteps OS-level blocking by using low-level hardware instructions. At its core is **Compare-And-Swap (CAS)**, an instruction provided directly by modern CPUs (x86_64, ARM).

Think of CAS as a microscopic, hardware-enforced transaction: the CPU reads a memory address, compares it against an expected value, and — if they match — swaps in the new value, all in a single, uninterruptible cycle.

If two cores try to CAS the same memory location simultaneously, the memory bus arbitrates the conflict in hardware. One core succeeds instantly; the other's CAS fails and it simply retries in a tight, wait-free loop. No context switches, no blocked threads, no scheduler involvement.

```text
[ Mutex (Locking) ]                   [ Atomic CAS (Wait-Free) ]

Goroutine 1: Lock() -> Success        Goroutine 1: CAS(expected, new) -> Success
Goroutine 2: Lock() -> BLOCKED        Goroutine 2: CAS(expected, new) -> Failed
Goroutine 3: Lock() -> BLOCKED                     |--> Loops and retries instantly
             |                                     |--> CAS(expected, new) -> Success
             v
        Context Switch
        (Heavy Overhead)                      (Zero context switches, CPU bound)
```

---

## Combining WaitGroup and Atomics

When you fan out a batch of goroutines, `sync.WaitGroup` blocks the main goroutine until all workers finish. If those workers also need to update a shared counter, pairing `WaitGroup` with `sync/atomic` gives you the most performant, lock-free pattern available for that case.

Here's an analytics processor tracking how many events a worker pool has handled:

```go
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

func main() {
	var wg sync.WaitGroup
	var processedEvents int64 = 0 // Our wait-free counter

	workerCount := 100
	tasksPerWorker := 1000

	// Register the exact number of goroutines we're about to launch
	wg.Add(workerCount)

	for i := 0; i < workerCount; i++ {
		go func(workerID int) {
			// Ensure Done() runs when the goroutine exits
			defer wg.Done()

			for j := 0; j < tasksPerWorker; j++ {
				// Simulate processing an event
				_ = j * 2

				// Wait-free atomic increment — uses hardware CAS directly.
				atomic.AddInt64(&processedEvents, 1)
			}
		}(i)
	}

	// Block the main goroutine until the WaitGroup counter reaches 0
	wg.Wait()

	// Safely read the final value using an atomic load
	finalCount := atomic.LoadInt64(&processedEvents)
	fmt.Printf("Successfully processed %d events without mutexes.\n", finalCount)
}
```

`sync.WaitGroup` itself uses atomics internally to track the number of active goroutines across `Add` and `Done`. By also using `atomic.AddInt64` for the custom `processedEvents` counter, all 100 goroutines can update the same memory location aggressively without ever sleeping or invoking the Go scheduler's blocking path.

---

## Memory Visibility and CPU Caches

`sync/atomic` interacts with CPU caches in a way that matters. Modern CPUs have per-core L1/L2 caches plus a shared L3. If a goroutine on Core A updates a plain (non-atomic) variable, Core B might not see the update immediately — the new value can sit in Core A's L1 cache.

Atomic instructions issue hardware-level memory barriers (fences). When `atomic.AddInt64` executes, the CPU guarantees the new value is flushed to main memory (or shared L3) and invalidates the corresponding cache line on every other core. That's what gives atomics their memory-visibility guarantee across goroutines — not just the arithmetic itself.

---

## Key Takeaways

- **Mutexes still win for complex, multi-field state** — protecting an invariant that spans several fields needs a critical section, not a single CAS.
- **Atomics win for simple counters and flags** — state that's a single word (int32/int64/pointer/bool) benefits from wait-free CAS instead of blocking.
- **`WaitGroup.Add`/`Done`/`Wait` and `atomic.Add*`/`Load*` compose cleanly** — this is the standard pattern for fan-out workers that share a simple aggregate counter.
- **Atomic operations carry their own memory barriers**, guaranteeing visibility across cores without an explicit lock.
