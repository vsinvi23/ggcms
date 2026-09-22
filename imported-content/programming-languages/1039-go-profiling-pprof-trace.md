# Advanced Go Profiling: Finding CPU Bottlenecks and Memory Leaks with pprof and runtime/trace

## The Problem: Silent Degradation Under Load
A Go service operating flawlessly in staging suddenly exhibits latency spikes and memory bloat under production throughput. Traditional logging metrics point to specific endpoints, but they fail to reveal *why* the application is stalling. Is the garbage collector (GC) pausing the world? Are goroutines blocked on a mutex? Are string allocations overwhelming the heap? Without low-level introspection, these issues are invisible.

## The Architectural Solution: pprof and runtime/trace
Go's runtime provides native, low-overhead telemetry mechanisms. The `net/http/pprof` package exposes HTTP endpoints for sampling CPU and memory utilization, while `runtime/trace` provides nanosecond-precision timelines of goroutine execution, GC events, and system calls.

### Telemetry Pipeline
```text
+-------------------+       +-------------------+       +---------------------+
| Go Application    |       | Sampling Engine   |       | Analysis Tools      |
|                   |       |                   |       |                     |
| [Goroutines]      | =====>| CPU Profiler      | =====>| go tool pprof       |
| [Heap Allocator]  |       | Memory Profiler   |       | - top, web, flame   |
| [Scheduler]       |       | Trace Recorder    |       |                     |
|                   |       |                   |       | go tool trace       |
+-------------------+       +-------------------+       +---------------------+
```

## Instrumenting for pprof
To enable pprof in an HTTP server, import `net/http/pprof` for side-effects. This implicitly registers handlers under `/debug/pprof/`.

```go
package main

import (
	"log"
	"net/http"
	_ "net/http/pprof" // Implicitly registers /debug/pprof/
	"runtime"
)

func main() {
	// Optional: Increase memory profiling rate for granular heap tracking.
	// Default is 1 profile per 512KB allocated.
	runtime.MemProfileRate = 1 // Profile ALL allocations (Warning: High overhead)
    
	// Start a dedicated multiplexer for debug endpoints on a private port
	go func() {
		log.Println("Starting pprof server on :6060")
		log.Println(http.ListenAndServe("localhost:6060", nil))
	}()

	// Application logic here...
	select {}
}
```

## Diagnosing Memory Leaks
A memory leak in Go often manifests as dangling goroutines (which hold onto their stack and local variables) or accumulating references in global maps/slices.

To capture a heap profile:
```bash
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/heap
```

### Analyzing Allocations
In the interactive pprof shell or web UI, `inuse_space` reveals memory currently retained, while `alloc_space` shows total memory requested over time. If `inuse_space` continuously grows, a leak exists. 

To pinpoint the leak, look for the `flat` vs `cum` (cumulative) values. High `flat` means the function itself allocated the memory. High `cum` means the function called other functions that allocated memory.

## Pinpointing CPU Bottlenecks
When CPU utilization peaks but throughput remains low, inefficient algorithms or excessive locking are typical culprits.

Capture a 30-second CPU profile:
```bash
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/profile?seconds=30
```

The resulting Flame Graph visualizes call hierarchies. The width of a block indicates CPU time consumed. Look for unexpected wide blocks, particularly those involving `runtime.mallocgc` (allocation overhead) or `runtime.gcBgMarkWorker` (GC pressure).

## Identifying Latency Spikes with runtime/trace
When pprof's sampling (100Hz default) misses micro-stalls, `runtime/trace` offers deterministic execution tracing.

```bash
curl -o trace.out http://localhost:6060/debug/pprof/trace?seconds=5
go tool trace trace.out
```

### The Trace Viewer
The trace viewer exposes the internal scheduler state:
1.  **Goroutine Analysis:** Identifies goroutines blocked in `SYSCALL`, waiting for `network`, or starved in the `runnable` queue.
2.  **Network Blocking:** Highlights latency caused by synchronous I/O.
3.  **Synchronization:** Reveals contention on channels or `sync.Mutex`.

```text
Time (ms) ->
[P0]  |-- Goroutine 1 (Running) --|  |-- GC (Stop The World) --|  |-- Goroutine 2 --|
[P1]  |-- Goroutine 3 (Running) --|  |-- GC (Sweep) -----------|  |-- IDLE ---------|
[P2]  |-- Syscall (Blocked) -----------------------------------|  |-- Goroutine 4 --|
```
*In this trace, GC pauses preempt all logical processors (P).*

## Remediation Strategies
1.  **Reduce Allocations:** If `runtime.mallocgc` dominates CPU time, implement `sync.Pool` to reuse objects, or use stack allocation via struct value semantics.
2.  **Mitigate Contention:** If `runtime.trace` shows goroutines stacked in `sync.Mutex.Lock`, narrow the critical section, shard the locks, or utilize lock-free atomic operations.
3.  **Optimize String Concatenation:** Replace `+` with `strings.Builder` in tight loops to avoid quadratic memory allocations.
