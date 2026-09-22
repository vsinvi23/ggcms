# Go Context Values: Safely Passing Request-Scoped Data vs The Global Variable Anti-Pattern

## The Problem: Passing Contextual Data Across API Boundaries

In Go web services, an incoming HTTP request rarely touches just one function. It flows through routing middleware, authentication handlers, business logic, and database repositories. Often, a deeply nested function needs contextual data extracted at the very beginning of the request—such as a User ID from a JWT, a request tracing ID, or a database transaction handle.

Passing this data as explicit function parameters quickly becomes unwieldy. If an authorization token is required by a database function 10 layers deep, you must pollute the signatures of all 9 intermediate functions. 

New Go developers often try to solve this by storing request data in global variables or maps keyed by the goroutine ID. This is a catastrophic anti-pattern in Go. Since Go's HTTP server spins up a new goroutine per request, global state inevitably leads to race conditions, cross-request data leaks, and security vulnerabilities.

## The Mental Model: Scoped Key-Value Chains

The idiomatic solution is the `context.Context` interface. A Context is an immutable, hierarchical tree that carries cancellation signals, deadlines, and request-scoped values. 

Think of `context.WithValue` as a linked list of key-value pairs. Each time you add a value to a Context, you do not mutate the original Context. Instead, you create a new child node that points back to its parent. When you retrieve a value using `ctx.Value(key)`, Go traverses up the tree, checking each node until it finds a match.

## Visualizing the Context Tree

```text
[ Root Context (Background) ]
          |
[ Context + Trace ID ("req-123") ] <-- Middleware Layer
          |
[ Context + User ID ("user-99") ]  <-- Auth Layer
          |
[ Database Query Function ]        <-- Business Logic Layer

Lookup for "User ID" searches up the chain:
Query -> Auth Node (Found!) -> Trace Node (Ignored) -> Root
```

## The Global Variable Anti-Pattern

A common mistake when using `context.WithValue` is using standard strings as keys. 

```go
// ANTI-PATTERN: DO NOT DO THIS
ctx = context.WithValue(ctx, "user_id", 42)
userID := ctx.Value("user_id").(int)
```

If multiple packages in your application use the string `"user_id"` as a key, one middleware might silently overwrite the value set by another. Because the compiler cannot catch string collisions, this leads to horrific runtime bugs where a user might accidentally assume the identity of another.

## Deep Dive & Code: The Custom Key Pattern

To safely use Context values, Go dictates a strict pattern: **Define an unexported, custom type for your keys.**

Because Go's interface comparisons check both the *value* and the *type*, an unexported type guarantees that no other package can accidentally create a matching key, even if the underlying string or integer values are identical.

```go
package auth

import (
	"context"
	"errors"
)

// 1. Define an UNEXPORTED custom type for the context key.
// This guarantees that external packages cannot collide with it.
type contextKey string

const userIDKey = contextKey("user_id")

// 2. Provide an exported setter function (usually called in middleware)
func WithUserID(ctx context.Context, id int) context.Context {
	// The key is type `contextKey`, value is type `int`
	return context.WithValue(ctx, userIDKey, id)
}

// 3. Provide an exported getter function (called in business logic)
func GetUserID(ctx context.Context) (int, error) {
	// Value() returns an empty interface{} `any`. 
	// We must safely type-assert it.
	val := ctx.Value(userIDKey)
	if val == nil {
		return 0, errors.New("user ID not found in context")
	}

	id, ok := val.(int)
	if !ok {
		return 0, errors.New("user ID in context is not of type int")
	}

	return id, nil
}
```

By abstracting `context.WithValue` and `ctx.Value` behind explicit getter and setter functions, you introduce strong compile-time type safety to an otherwise loosely typed API. The calling code never interacts with the raw context key.

```go
package main

import (
	"context"
	"fmt"
	"myapp/auth"
)

func main() {
	ctx := context.Background()

	// 1. Middleware adds the data
	ctx = auth.WithUserID(ctx, 42)

	// 2. Deeply nested function retrieves it
	processRequest(ctx)
}

func processRequest(ctx context.Context) {
	userID, err := auth.GetUserID(ctx)
	if err != nil {
		fmt.Println("Unauthorized:", err)
		return
	}
	fmt.Printf("Processing request for user %d\n", userID)
}
```

## Conclusion

The `context.Context` is the lifeblood of robust Go applications. While it was primarily designed for timeout and cancellation propagation, its value store is perfectly suited for request-scoped metadata like authentication tokens and tracing IDs. By strictly adhering to the custom type key pattern, you eliminate the risk of key collisions, entirely avoid the global variable anti-pattern, and maintain robust, safe API boundaries across your entire application.