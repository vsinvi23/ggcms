---
title: "Go Context Values: The Custom Key Pattern vs. the Global Variable Anti-Pattern"
description: "Why raw strings as context.WithValue keys cause silent collisions across packages, and how Go's unexported custom-type key pattern gives compile-time-safe request-scoped data without falling back to global state."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "context"
  - "concurrency"
  - "anti-patterns"
  - "api-design"
---

# Go Context Values: The Custom Key Pattern vs. the Global Variable Anti-Pattern

## The Problem: Passing Contextual Data Across API Boundaries

In a Go web service, an incoming HTTP request rarely touches just one function — it flows through routing middleware, authentication handlers, business logic, and repository code. Often a deeply nested function needs data extracted at the very start of the request: a user ID from a JWT, a request tracing ID, a database transaction handle.

Passing this data as explicit function parameters gets unwieldy fast. If an auth token is needed by a database function 10 layers deep, you'd have to thread it through the signatures of all 9 intermediate functions, most of which don't otherwise care about it.

New Go developers often try to solve this with global variables or maps keyed by goroutine ID. This is a **catastrophic anti-pattern** in Go: since the standard HTTP server spins up a new goroutine per request, global mutable state inevitably produces race conditions, cross-request data leaks, and security vulnerabilities — one request's auth data bleeding into another's response is not a hypothetical, it's what actually happens under concurrent load.

## The Mental Model: Scoped Key-Value Chains

The idiomatic fix is `context.Context`. A `Context` is an immutable, hierarchical tree carrying cancellation signals, deadlines, *and* request-scoped values (see the companion article on cancellation trees for the cancellation side of `Context`).

Think of `context.WithValue` as building a linked list of key-value pairs. Every call to `WithValue` doesn't mutate the existing context — it creates a new child node pointing back at its parent. `ctx.Value(key)` then walks up that chain from the current node toward the root, checking each node until it finds a match.

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

Because each `WithValue` call returns a brand-new context wrapping the old one, this is safe to share across goroutines — nothing is ever mutated in place, so there's no shared mutable state to race on, unlike the global-map approach it replaces.

---

## The Global Variable Anti-Pattern, In Miniature

Even inside `context.WithValue` itself, there's a subtler trap: using a plain string as the key.

```go
// ANTI-PATTERN: DO NOT DO THIS
ctx = context.WithValue(ctx, "user_id", 42)
userID := ctx.Value("user_id").(int)
```

If two different packages both happen to use the string `"user_id"` as a key, one middleware can silently overwrite the value another set — the compiler has no way to catch a string collision. That produces exactly the kind of horrifying runtime bug the whole mechanism was supposed to prevent: one user's request accidentally reading another's identity out of context.

---

## Deep Dive & Code: The Custom Key Pattern

The fix Go's own documentation prescribes: **define an unexported, custom type for your keys.**

Because Go interface comparisons check both value *and* type, an unexported type guarantees no other package can accidentally construct a colliding key — even if it happens to use the identical underlying string.

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

By hiding `context.WithValue`/`ctx.Value` behind explicit, typed getter and setter functions, calling code never touches the raw context key at all — it just calls `auth.WithUserID(ctx, 42)` and `auth.GetUserID(ctx)`, and the compiler enforces the types on both ends.

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

Even if another package also defines a `type contextKey string` with the value `"user_id"`, the two keys are different Go types from `auth`'s point of view whenever they aren't literally the same declared type — so `ctx.Value()` in `auth` can never accidentally return a value some unrelated package stashed under a lookalike string key.

---

## Conclusion

`context.Context` is central to robust Go applications well beyond its original design purpose of timeout and cancellation propagation — its value store is well-suited to request-scoped metadata like auth tokens and tracing IDs, provided you follow the custom-type-key discipline. Doing so eliminates key-collision risk, avoids the global-variable anti-pattern entirely, and keeps request data flowing through explicit, typed API boundaries rather than implicit global state.
