# Advanced Go Profiling: Finding CPU Bottlenecks and Memory Leaks with pprof and runtime/trace

## The Problem: Mysterious Latency Spikes and Memory Growth
A high-throughput API gateway written in Go is experiencing unexplained performance degradation. Under a steady load of 10,000 requests per second, the service exhibits latency spikes where p99 latency jumps from 15ms to over 2500ms. Concurrently, the virtual memory resident set size (RSS) grows linearly by 150MB per hour, indicating a slow memory leak. 

Standard operating system metrics (such as CPU utilization and memory charts) are too coarse-grained. They confirm that the system is saturated but fail to pinpoint whether the root cause is CPU starvation, excessive Garbage Collection (GC) pressure, goroutine blocking, or lock contention.

---

## Technical Architecture: pprof vs. runtime/trace
To diagnose these issues, we must leverage Go's native profiling tools: `runtime/pprof` (sampling-based profiling) and `runtime/trace` (event-based tracing). 

```
                                GO RUNTIME PROFILING LAYER
+---------------------------------------------------------------------------------------+
|  Sampling Engine (pprof)                                                              |
|  - CPU Profiler (100Hz hardware interrupts via SIGPROF)                               |
|  - Memory Profiler (Samples 1 in 512KB allocations)                                  |
+---------------------------------------------------------------------------------------+
|  Event Engine (runtime/trace)                                                         |
|  - Execution Tracer (Precise timestamps for Scheduler, GC, and Network events)        |
+---------------------------------------------------------------------------------------+
                                           v
+------------------------------------------+--------------------------------------------+
|             pprof Output                 |               trace Output                 |
| - Statistical hotspots (CPU/Heap)        | - Nanosecond timeline of scheduler         |
| - Call graphs, Flame graphs              | - Goroutine states (Running, Runnable)     |
+------------------------------------------+--------------------------------------------+
```

### 1. `pprof` Mechanics
The `pprof` CPU profiler operates by registering a signal handler for `SIGPROF` which is triggered 100 times per second (100Hz). When the signal arrives, the runtime intercepts the executing thread, retrieves the call stack of the active goroutine, and records a sample. It is highly efficient, introducing less than 5% runtime overhead.

The memory profiler tracks heap allocations by sampling one allocation per 512KB of allocated memory (tunable via `runtime.MemProfileRate`). It traces call paths to locate objects that are allocated and still live (inuse) or allocated and already garbage collected (alloc).

### 2. `runtime/trace` Mechanics
While `pprof` gives us statistical aggregates, it fails to explain scheduling anomalies, such as a goroutine waiting for a lock, network socket, or runtime system call. This is where `runtime/trace` excels. It captures exact timestamps of events:
* Goroutine creation, block, and unblock.
* Network/Syscall blocking and unblocking.
* Garbage Collection sweeps, marks, and pauses.
* Processor (P) transitions.

Tracing incurs a higher performance overhead (7% to 15%), so it is typically enabled only for brief intervals (1 to 10 seconds).

---

## Code Implementation: Production-Grade Profiling Wrapper
The following implementation integrates an on-demand profiling and tracing hook into a production service, bypassing the need to expose the default unprotected `net/http/pprof` handlers to the public internet.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"runtime/pprof"
	"runtime/trace"
	"sync"
	"time"
)

// ProfileCoordinator coordinates profiling sessions safely across goroutines.
type ProfileCoordinator struct {
	mu           sync.Mutex
	isProfiling  bool
}

func NewProfileCoordinator() *ProfileCoordinator {
	return &ProfileCoordinator{}
}

// StartTrace starts an execution trace for a fixed duration and writes to the writer.
func (pc *ProfileCoordinator) StartTrace(ctx context.Context, duration time.Duration, filepath string) error {
	pc.mu.Lock()
	if pc.isProfiling {
		pc.mu.Unlock()
		return fmt.Errorf("profiler or tracer is already active")
	}
	pc.isProfiling = true
	pc.mu.Unlock()

	defer func() {
		pc.mu.Lock()
		pc.isProfiling = false
		pc.mu.Unlock()
	}()

	f, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create trace file: %w", err)
	}
	defer f.Close()

	if err := trace.Start(f); err != nil {
		return fmt.Errorf("failed to start tracing: %w", err)
	}
	defer trace.Stop()

	// Wait for duration or context cancellation
	select {
	case <-time.After(duration):
	case <-ctx.Done():
		return ctx.Err()
	}

	return nil
}

// CaptureHeapProfile writes a heap profile to the designated file path.
func (pc *ProfileCoordinator) CaptureHeapProfile(filepath string) error {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	f, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create heap profile file: %w", err)
	}
	defer f.Close()

	// Run GC first to get clean, up-to-date memory metrics
	runtime.GC()

	if err := pprof.WriteHeapProfile(f); err != nil {
		return fmt.Errorf("failed to write heap profile: %w", err)
	}
	return nil
}

func main() {
	coordinator := NewProfileCoordinator()
	
	// Example HTTP Trigger
	http.HandleFunc("/admin/trace", func(w http.ResponseWriter, r *http.Request) {
		durationStr := r.URL.Query().Get("duration")
		duration, err := time.ParseDuration(durationStr)
		if err != nil {
			duration = 5 * time.Second
		}

		tracePath := "/tmp/execution.trace"
		log.Printf("Starting execution trace for %s", duration)
		
		go func() {
			err := coordinator.StartTrace(context.Background(), duration, tracePath)
			if err != nil {
				log.Printf("Tracing error: %v", err)
			} else {
				log.Printf("Trace completed. Written to %s", tracePath)
			}
		}()

		w.WriteHeader(http.StatusAccepted)
		fmt.Fprintf(w, "Trace initiated for %v", duration)
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

---

## Solving the Problem: Diagnostics and Walkthrough

### Step 1: Solving the CPU Starvation (p99 Spikes)
First, collect a 30-second CPU profile under load:
```bash
go tool pprof http://localhost:8080/debug/pprof/profile?seconds=30
```
Upon entering the interactive shell, run `top20` or `web`. 

If `runtime.cgocall` dominates, the bottleneck is boundary transitions between Go and C. If `runtime.scanobject` or `runtime.gcDrain` is at the top of the list, your application is allocating transient objects too quickly, forcing the GC garbage collector to consume CPU cycles.

To verify lock contention, analyze the mutex profile:
```bash
go tool pprof http://localhost:8080/debug/pprof/mutex
```
Look for scheduler blocks. If the app is spending significant time in `sync.(*Mutex).Lock`, refactor the critical path to use atomic primitives (`sync/atomic`) or shard the locks to reduce contention.

### Step 2: Tracking Down the Memory Leak
Compare two heap profiles taken 15 minutes apart to isolate the memory leak:
```bash
go tool pprof -diff_base=heap_base.prof heap_current.prof
```
Using the `inuse_space` or `inuse_objects` option, type `top` or `list`:
```bash
(pprof) top -inuse_space
```
This isolates the exact line of code holding onto memory. Typical Go memory leaks occur because:
1. Sub-slices are kept alive on a large backing array. To resolve this, copy the needed slice data to a new slice and let the parent array be collected.
2. Goroutines are blocked permanently on channels that are never closed, leaving their stacks and referenced variables pinned in memory.

### Step 3: Analyzing Thread Pinning and Scheduling with `trace`
Download the generated trace file and open the visualizer:
```bash
go tool trace /tmp/execution.trace
```
Navigate to the "Goroutine Analysis" and "Network Blocking Profile". 
* **GC Spans:** Inspect if the GC phase takes longer than 2ms. If you observe excessive "STW" (Stop The World) sweeps, implement memory pools (`sync.Pool`) to reuse byte slices and high-frequency structs.
* **Scheduler Latency:** If you see goroutines spending long periods in the `Runnable` state, the number of OS threads or blocking syscalls is saturating the Go scheduler. Ensure you are not performing blocking I/O inside hot loops without yielding.
