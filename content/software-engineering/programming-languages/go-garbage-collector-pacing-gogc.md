---
title: "Go Garbage Collection: Pacing, Mark Assists, and the GOGC Variable"
description: "How Go's concurrent tricolor mark-sweep garbage collector decides when to run, how GOGC and GOMEMLIMIT control that decision, and how mark assists throttle greedy allocators."
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "golang"
  - "garbage-collection"
  - "gogc"
  - "gomemlimit"
  - "runtime-internals"
  - "performance-tuning"
---

# Go Garbage Collection: Pacing, Mark Assists, and the GOGC Variable

## The Problem: The Latency vs. Throughput Tradeoff

Garbage collection (GC) is the automated management of memory. The runtime tracks object allocations, determines which objects are no longer reachable (garbage), and reclaims that memory. However, garbage collection is not free. It consumes CPU cycles and, historically, required pausing the entire application ("Stop-The-World") to safely inspect memory.

In highly concurrent systems — where Go typically thrives — long pauses lead to unacceptable tail latencies. Go's garbage collector is explicitly designed to prioritize **low latency** over raw throughput. To achieve this, it uses a concurrent mark-sweep algorithm. But concurrency introduces a new problem: what happens if the application (the "mutator") allocates memory faster than the background GC can sweep it?

## The Mental Model: Tricolor Concurrent Mark-Sweep

Go's GC operates concurrently alongside your application goroutines. It models memory as a directed graph of objects and references, coloring them as it traverses:

1. **White Objects:** Potentially garbage. At the start of a GC cycle, everything is white.
2. **Grey Objects:** Reachable from the root (e.g., globals, stack variables), but their children haven't been inspected yet.
3. **Black Objects:** Reachable, and all of their immediate children have been colored grey or black. Guaranteed not to be garbage.

```text
+---------+        +---------+        +---------+
|  Root   | -----> | ObjectA | -----> | ObjectB |
| (Black) |        | (Grey)  |        | (White) |
+---------+        +---------+        +---------+
```

*The GC traverses from Roots. As it processes ObjectA, A becomes Black, and its child B becomes Grey.*

The cycle ends when there are no Grey objects left. Any remaining White objects are inaccessible and safely reclaimed. Because mutator goroutines are running simultaneously, Go uses a "Write Barrier" — a small piece of code executed during pointer updates — to ensure that mutators don't accidentally hide objects from the GC by moving them behind Black objects.

## Pacing: When Does the GC Start?

Since the GC is concurrent, it must start *before* the heap runs out of memory. If it waits too long, it will be forced to stop the application completely to finish the job. If it starts too early, it burns CPU cycles unnecessarily, hurting throughput.

This delicate balancing act is called **pacing**. The GC pacer attempts to predict the optimal time to trigger a cycle based on the current allocation rate and the time it took to complete previous GC cycles.

### The GOGC Variable

The primary tuning knob for the pacer is the `GOGC` environment variable. By default, `GOGC=100`. This value represents a percentage. A value of 100 means the GC will attempt to finish its next cycle when the heap size has grown by 100% relative to the amount of live data remaining after the *previous* collection.

* If the last GC cycle ended with 10MB of live objects, the next GC cycle will target completion when the heap reaches 20MB.
* If you set `GOGC=200`, the heap will be allowed to grow to 30MB before the GC finishes. This reduces GC frequency (higher throughput) but uses more memory.
* If you set `GOGC=50`, the GC triggers more frequently, keeping memory usage tighter but consuming more CPU.

```go
package main

import (
	"fmt"
	"runtime/debug"
)

func main() {
	// Programmatically set GOGC instead of via environment variable.
	// Returns the previous setting.
	previous := debug.SetGCPercent(50)
	fmt.Printf("Changed GOGC from %d to 50\n", previous)
}
```

Starting in Go 1.19, a soft memory limit (`GOMEMLIMIT`) was introduced to force the pacer to become more aggressive as memory nears a hard ceiling, preventing out-of-memory (OOM) crashes in containerized environments where the container's cgroup limit is lower than the host's total memory:

```bash
# Give the GC a 512MiB soft ceiling regardless of GOGC's target
GOGC=100 GOMEMLIMIT=512MiB ./my-service
```

## Mark Assists: Slowing Down Greedy Goroutines

Even with intelligent pacing, a problematic scenario remains: a goroutine allocating massive amounts of memory in a tight loop. If this goroutine outpaces the background GC workers, the heap will grow unbounded.

To prevent this, Go utilizes a mechanism called **mark assists**.

When the GC is active, every time a mutator goroutine attempts to allocate memory on the heap, the runtime checks the overall progress of the GC compared to the pacing target. If the GC is falling behind, the allocating goroutine is essentially "taxed." Before it is allowed to complete its allocation, it is forced to pause and perform GC marking work proportional to the size of its allocation.

```go
// A theoretical greedy mutator
func processData() {
    for i := 0; i < 1000000; i++ {
        // If the GC is falling behind, this allocation will trigger a Mark Assist.
        // The goroutine will do GC work before proceeding.
        data := make([]byte, 1024)
        compute(data)
    }
}
```

This elegant design solves two problems simultaneously:

1. It adds computational manpower to the GC exactly when it needs it most.
2. It artificially slows down the offending goroutine, throttling its allocation rate to a manageable level.

## Observing Pacing Decisions in Practice

`GODEBUG=gctrace=1` prints one line per GC cycle, showing exactly when the pacer triggered a collection and how long it took:

```bash
GODEBUG=gctrace=1 ./my-service
```

```text
gc 1 @0.014s 2%: 0.021+0.45+0.006 ms clock, 0.17+0.11/0.30/0.62+0.052 ms cpu, 4->4->2 MB, 5 MB goal, 8 P
```

The `4->4->2 MB, 5 MB goal` segment shows the heap size before the cycle, at mark termination, and after sweep, against the pacer's computed goal — the exact mechanism described above, made observable.

## Key Takeaways

* Go's GC is a concurrent tricolor mark-sweep collector tuned to minimize latency, not maximize throughput.
* **Pacing** decides *when* to start a GC cycle based on the live heap size and `GOGC`'s target growth percentage.
* **`GOMEMLIMIT`** (Go 1.19+) adds a hard soft-ceiling on top of `GOGC`, essential for containers with a fixed memory cgroup limit.
* **Mark assists** force fast-allocating goroutines to do proportional GC work, preventing unbounded heap growth when the collector falls behind.
* `GODEBUG=gctrace=1` is the fastest way to see pacing decisions in a running process without attaching a profiler.
