---
title: "Go Context: Cancellation Trees and Deadline Propagation"
description: "How Go's context package prevents goroutine leaks in request-scoped concurrency by modeling cancellation as a tree - context.WithCancel, WithTimeout, and the propagation rule every I/O-bound function must follow."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "context"
  - "concurrency"
  - "goroutines"
  - "cancellation"
---

# Go Context: Cancellation Trees and Deadline Propagation

## The Problem: Dangling Goroutines and Resource Leaks

In Go, concurrency is cheap — it's standard practice to spin up a goroutine per incoming HTTP request, per database query, per downstream microservice call. That ease of concurrency creates a real operational hazard, though.

Imagine an HTTP server handling a request by querying three backend microservices concurrently. If the user closes their browser tab mid-request, the HTTP request drops — but the three goroutines making those backend calls keep running. They'll keep consuming CPU, memory, and network bandwidth, eventually returning data to a client that no longer exists. At scale, this is exactly how a server accumulates a "goroutine leak" and eventually exhausts its resources. What's needed is a standardized way to tell every running goroutine involved in a request that its work is no longer needed.

## The Mental Model: The Cancellation Tree

Go's `context` package solves this. A `Context` is a standard object passed as the first argument to nearly every function that does I/O or long-running work.

Visualize contexts as an upside-down **cancellation tree**. At the root is `context.Background()` — an empty context that's never canceled. From it you derive child contexts, and when a parent is canceled, **all of its children are automatically and instantly canceled too**:

```text
                   [ Background Context ]
                            |
           +----------------+----------------+
           |                                 |
[ Request Context (A) ]           [ Request Context (B) ]
    /             \                          |
[ DB Query ]   [ API Call ]             [ API Call ]
```

*If Request Context (A) is canceled, both its DB Query and API Call children are canceled with it. Request Context (B) is completely unaffected — cancellation only propagates downward, never sideways or up.*

---

## Propagation: Passing the Baton

The rule underpinning all of this: `ctx context.Context` must be explicitly passed down the call stack as the first parameter of any function that might block or do I/O.

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    // The HTTP server automatically creates a context tied to the client connection
    ctx := r.Context()

    // Pass it down
    fetchUserData(ctx, 123)
}

func fetchUserData(ctx context.Context, id int) {
    // Pass it down further
    queryDatabase(ctx, "SELECT * FROM users WHERE id=?", id)
}
```

`r.Context()` is automatically canceled by Go's `net/http` server when the underlying client connection closes — that's the mechanism that turns "user closed the tab" into a cancellation signal in the first place.

---

## Deriving Contexts: Deadlines and Cancellations

You rarely pass the root context around unmodified — you derive specific, scoped contexts from it using `WithCancel` and `WithTimeout`.

### `context.WithTimeout`

To make sure a database query doesn't hang forever, derive a timeout context from the incoming request's context:

```go
func fetchWithTimeout(parentCtx context.Context) {
    // Create a child context that will automatically cancel after 2 seconds
    ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)

    // Best practice: ensure resources are cleaned up when the function exits
    defer cancel()

    // Pass the timeout-bound context to the database driver
    db.QueryRowContext(ctx, "SELECT sleep(10)")
}
```

If the query takes longer than 2 seconds, `ctx` emits its cancellation signal, the DB driver severs the connection, and the goroutine exits cleanly instead of hanging indefinitely. And if `parentCtx` itself is canceled earlier — say, the user closed their browser after 1 second — this child context cancels immediately too; it never waits out its own 2-second budget once its parent is gone.

### `context.WithCancel`

Sometimes you want manual control — for example, shutting down a pool of worker goroutines gracefully during server shutdown:

```go
func workerPool() {
    ctx, cancel := context.WithCancel(context.Background())

    for i := 0; i < 3; i++ {
        go worker(ctx, i) // Spawn workers
    }

    time.Sleep(1 * time.Second)
    cancel() // Manually trigger cancellation for all 3 workers
}

func worker(ctx context.Context, id int) {
    for {
        select {
        case <-ctx.Done():
            // The Done() channel is closed when the context is canceled.
            fmt.Printf("Worker %d shutting down\n", id)
            return
        default:
            // Do normal work
            time.Sleep(100 * time.Millisecond)
        }
    }
}
```

`ctx.Done()` returns a channel that's closed (not sent-on — closed) the moment the context is canceled. A `select` with `<-ctx.Done()` alongside a `default` case is the standard idiom for "check for cancellation, but don't block if there isn't any" inside a work loop.

---

## Summary

The `context` package is Go's unified answer to lifecycle management across concurrent operations. By consistently passing `Context` as the first argument down every call stack, you build a resilient cancellation tree: whether a user drops a connection, a timeout fires, or the server shuts down, cancellation propagates automatically to every goroutine descended from that context, terminating dangling work before it can leak resources. (Contexts can also carry request-scoped *values* — correlation IDs, auth tokens — via `context.WithValue`; that mechanism has its own sharp edges, covered in the companion article on context-value anti-patterns.)
