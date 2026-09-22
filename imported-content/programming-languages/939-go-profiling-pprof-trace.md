# Advanced Go Profiling: Finding CPU Bottlenecks and Memory Leaks with pprof and runtime/trace

## The Observability Problem in Go
When a Go application scales, performance degradation rarely manifests as a clean panic. Instead, it hides in slow memory leaks, unexpected garbage collection (GC) pauses, and inefficient CPU utilization. Relying purely on external metrics or logs is insufficient for root-cause analysis. Go provides two powerful built-in tools for deep observability: `pprof` for sampling-based profiling, and `runtime/trace` for execution tracing.

## Architecture of `pprof`
`pprof` operates by sampling the runtime state at regular intervals (default 100Hz for CPU). It interrupts the program, records the current call stack, and resumes. Memory profiling works by hooking into the runtime allocator, tracking allocations at specified byte intervals.

```ascii
+-------------------+        Interrupt (SIGPROF)       +-------------------+
|  Go Application   | <--------------------------------|  OS Scheduler     |
| (Running Goroutine|                                  +-------------------+
|  Executing FuncA) | -------------------------------->|  pprof runtime    |
+-------------------+      Save Stack: main -> FuncA   | (Stack Aggregator)|
                                                       +-------------------+
```

### Implementing `pprof`
For HTTP servers, integrating `pprof` is trivial. Importing `_ "net/http/pprof"` automatically registers handlers to the default multiplexer.

```go
package main

import (
	"log"
	"net/http"
	_ "net/http/pprof" // Registers /debug/pprof/ endpoints
)

func main() {
	go func() {
		log.Println(http.ListenAndServe("localhost:6060", nil))
	}()
	// Application logic here
	select {}
}
```

By querying `http://localhost:6060/debug/pprof/profile?seconds=30`, the Go toolchain generates a CPU profile. Use `go tool pprof cpu.prof` to explore it. Commands like `top10`, `web`, and `flamegraph` help visualize where CPU cycles are burned.

## Memory Profiling: `allocs` vs `heap`
When investigating memory issues, it is vital to understand the difference between the `allocs` and `heap` profiles:
- **`allocs`**: Tracks all allocations since the application started, regardless of whether they have been garbage collected. Ideal for finding allocation churn that stresses the GC.
- **`heap`**: Tracks memory currently in use (live objects). Crucial for identifying memory leaks.

```bash
# Capture a heap profile
go tool pprof http://localhost:6060/debug/pprof/heap
```

Inside the interactive shell, use `list <function_name>` to view per-line allocation costs. If you see high memory usage on a slice append, preallocating capacity (`make([]T, 0, capacity)`) is the standard remediation.

## The Execution Tracer: `runtime/trace`
While `pprof` is excellent for answering "what is taking CPU time?", it fails to answer "why is this goroutine waiting?". For latency analysis, scheduler contention, and blocking profiles, `runtime/trace` is the required tool.

The execution tracer instruments the Go runtime to emit an event every time a goroutine is created, blocked, unblocked, or GC runs. 

```go
package main

import (
	"os"
	"runtime/trace"
)

func main() {
	f, _ := os.Create("trace.out")
	defer f.Close()
	
	trace.Start(f)
	defer trace.Stop()
	
	// Complex concurrent workload
}
```

### Analyzing Trace Data
Analyze the output using `go tool trace trace.out`. This opens a web-based visualization tool detailing:
- **Goroutine analysis**: See exactly how long a goroutine was runnable (waiting for a processor), running, or waiting (blocked on channel/network/mutex).
- **Network blocking**: Identify if HTTP requests are delayed by DNS lookups or slow connections.
- **GC pauses**: View exact GC cycles, including the concurrent mark and sweep phases, and the stop-the-world (STW) pauses.

```ascii
Timeline (ms) ->
P0: |=== FuncA ===|...Wait...|== FuncB ==|
P1: |== GC Mark ==|==========|...Wait....|
G1: [Running]---->[Blocked]--[Runnable]->[Running]
```
*A trace visualization showing Goroutine G1 blocking, becoming runnable, and waiting for Processor P0.*

## Summary
For high-performance Go applications, profiling must be a routine practice, not an emergency intervention. Use `pprof` (CPU/Heap) to identify inefficient algorithms and memory bloat, and `runtime/trace` to unravel complex concurrency bottlenecks and scheduler latencies.
