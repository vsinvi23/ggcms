# Go Context: Propagation, Cancellation Trees, and Request Scoping

## The Problem: Dangling Goroutines and Resource Leaks
In Go, concurrency is cheap. It is standard practice to spin up a new goroutine to handle an incoming HTTP request, query a database, or fetch data from a microservice. However, this ease of concurrency introduces a massive operational hazard.

Imagine an HTTP server that handles a user request by querying three backend microservices simultaneously. What happens if the user suddenly closes their browser tab? The HTTP request drops, but the three goroutines making backend network calls are still running. They will continue to consume CPU, memory, and network bandwidth, eventually returning data to a client that no longer exists. 

If this happens at scale, your server will succumb to a "goroutine leak," exhausting resources and crashing. We need a standardized way to signal to all running goroutines that their work is no longer needed.

## The Mental Model: The Cancellation Tree
Go solves this elegantly with the `context` package. A `Context` is a standard object passed as the first argument to almost every function that does I/O or long-running work. 

You should visualize Contexts as an upside-down **Cancellation Tree**. 

At the root of every tree is `context.Background()`, an empty context that is never canceled. From this root, you derive child contexts. When a parent context is canceled, **all of its children are automatically and instantly canceled.**

```text
                   [ Background Context ]
                            |
           +----------------+----------------+
           |                                 |
[ Request Context (A) ]           [ Request Context (B) ]
    /             \                          |
[ DB Query ]   [ API Call ]             [ API Call ]
```
*If Request Context (A) is canceled, both the DB Query context and API Call context are automatically canceled. Request Context (B) is unaffected.*

## Propagation: Passing the Baton
The golden rule of Go is that `ctx context.Context` must be explicitly passed down the call stack as the first parameter of any function that might block. 

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

## Deriving Contexts: Deadlines and Cancellations
You don't just pass the root context blindly. You derive specific contextual boundaries using functions like `WithCancel` and `WithTimeout`.

### `context.WithTimeout`
If you want to ensure a database query doesn't hang forever, you derive a timeout context from the incoming request context.

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
If the database takes longer than 2 seconds, the `ctx` will emit a cancellation signal, the DB driver will sever the connection, and the goroutine can exit cleanly. Furthermore, if the `parentCtx` (e.g., the user closing their browser) is canceled after 1 second, this child context cancels immediately—it does not wait for the 2-second timeout.

### `context.WithCancel`
Sometimes you want manual control over cancellation, such as shutting down a pool of worker goroutines gracefully during server shutdown.

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

## Request Scoping: Storing Values
While primarily used for cancellation, Contexts can also carry request-scoped data across API boundaries using `context.WithValue`. This is commonly used for passing correlation IDs, trace IDs, or authentication tokens injected by middleware. However, it should be used sparingly to avoid obscuring function dependencies.

## Summary
The `context` package is Go’s unified solution for lifecycle management across concurrent operations. By adhering to the convention of passing `Context` as the first argument down the call stack, developers construct a resilient cancellation tree. Whether a user drops a connection, a timeout is reached, or a server shuts down, the propagation of cancellation signals ensures that dangling goroutines are terminated, preventing resource leaks and maintaining system stability.
