---
title: "Go Channel Internals: Deconstructing the hchan Struct"
description: "The hchan struct behind every Go channel - ring buffer, sudog wait queues, and the direct stack-to-stack copy optimization - inspected live via unsafe.Pointer, with the production implications of channel locking."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "go"
  - "channels"
  - "go-runtime"
  - "concurrency"
  - "goroutines"
---

# Go Channel Internals: Deconstructing the hchan Struct

## The Problem

Go's channels are usually presented as high-level concurrency primitives implementing the CSP (Communicating Sequential Processes) model. Developers frequently treat them as lightweight, lock-free queues — they aren't. Under heavy load, misconfigured buffer sizes or high concurrency can cause serious performance degradation, locking bottlenecks, or memory leaks.

When a channel operation blocks, goroutines are suspended, context-switched, and later resumed. Understanding that behavior means looking at the actual Go runtime structure behind every channel: `hchan`. Channels aren't magic — they're built from ordinary memory structures, locks, and scheduler integration, and their runtime behavior follows directly from that.

---

## The Anatomy of the `hchan` Struct

Every channel is backed by an `hchan` struct, defined in the Go runtime (`src/runtime/chan.go`). It's a locked, thread-safe queue containing a ring buffer plus two doubly-linked wait queues.

```text
                  hchan Struct in Memory
 ┌─────────────────────────────────────────────────────────────┐
 │ lock mutex          - Protects all fields in hchan          │
 ├─────────────────────────────────────────────────────────────┤
 │ buf unsafe.Pointer  - Points to the circular ring buffer    │
 ├─────────────────────────────────────────────────────────────┤
 │ qcount uint         - Number of elements currently in buf   │
 ├─────────────────────────────────────────────────────────────┤
 │ dataqsiz uint       - Total capacity of the buffer (size)  │
 ├─────────────────────────────────────────────────────────────┤
 │ sendx uint          - Circular buffer index for writes      │
 ├─────────────────────────────────────────────────────────────┤
 │ recvx uint          - Circular buffer index for reads       │
 ├─────────────────────────────────────────────────────────────┤
 │ closed uint32       - State flag (0 = open, 1 = closed)     │
 ├─────────────────────────────────────────────────────────────┤
 │ recvq waitq         - Doubly-linked list of waiting readers │
 │                     - Points to sudog nodes                 │
 ├─────────────────────────────────────────────────────────────┤
 │ sendq waitq         - Doubly-linked list of waiting writers │
 │                     - Points to sudog nodes                 │
 └─────────────────────────────────────────────────────────────┘
```

### The Role of `sudog`

When a goroutine blocks on a channel — waiting to write to a full channel, or read from an empty one — it can't remain scheduled on an OS thread indefinitely. The runtime packages the goroutine (`g`) and its element pointer into a `sudog` struct and appends it to the channel's `recvq` or `sendq`. The goroutine is set to a waiting state, and the scheduler parks it (`gopark`), freeing the execution context for another goroutine to run.

### The Direct Stack-to-Stack Optimization

To maximize throughput, the compiler bypasses the ring buffer entirely whenever it can hand data straight from one goroutine's stack to another's:

- **Direct copy on receive** — if a goroutine is already blocked in `sendq` (waiting to write) when a receiver arrives, the receiver copies the data **directly** from the sender's stack to its own. `buf` is never touched.
- **Direct copy on send** — if a receiver is already blocked in `recvq` when a sender arrives, the sender copies the data straight into the receiver's stack slot.

This cuts memory footprint and cache misses versus round-tripping through the ring buffer.

---

## Deconstructing `hchan` at Runtime via unsafe Pointer Maps

We can mirror the runtime's internal `hchan` layout in our own code and inspect a live channel's structural fields directly with `unsafe.Pointer`. **This relies on undocumented, unstable runtime internals — never do this in production code; it exists here purely to make the structure concrete.**

```go
package main

import (
	"fmt"
	"unsafe"
)

// runtimeHchan matches the Go runtime's internal hchan struct layout
// for the target platform (64-bit systems).
type runtimeHchan struct {
	qcount   uint           // total data in the queue
	dataqsiz uint           // size of circular queue
	buf      unsafe.Pointer // points to an array of dataqsiz elements
	elemsize uint16
	closed   uint32
	elemtype unsafe.Pointer // internal element type descriptor
	sendx    uint           // send index
	recvx    uint           // receive index
	recvq    waitq          // list of blocked receivers (sudog)
	sendq    waitq          // list of blocked senders (sudog)
	lock     mutex          // protects hchan
}

// Stub structures to match runtime padding and pointers
type waitq struct {
	first unsafe.Pointer
	last  unsafe.Pointer
}

type mutex struct {
	key uintptr
}

func main() {
	// Initialize a buffered channel with capacity 5
	ch := make(chan int, 5)

	// Send 3 values into the channel
	ch <- 100
	ch <- 200
	ch <- 300

	// Obtain raw hchan pointer by casting the channel variable
	// In Go, a channel variable is inherently a pointer to the hchan struct.
	hchanPtr := (*runtimeHchan)(*(*unsafe.Pointer)(unsafe.Pointer(&ch)))

	fmt.Println("=== Go Channel Internal State ===")
	fmt.Printf("Buffer Capacity (dataqsiz): %d\n", hchanPtr.dataqsiz)
	fmt.Printf("Current Count (qcount):     %d\n", hchanPtr.qcount)
	fmt.Printf("Next Write Index (sendx):   %d\n", hchanPtr.sendx)
	fmt.Printf("Next Read Index (recvx):    %d\n", hchanPtr.recvx)
	fmt.Printf("Is Closed:                  %t\n\n", hchanPtr.closed != 0)

	// Perform a read operation to observe structural updates
	<-ch

	fmt.Println("=== State After 1 Receive (<-ch) ===")
	fmt.Printf("Current Count (qcount):     %d\n", hchanPtr.qcount)
	fmt.Printf("Next Write Index (sendx):   %d\n", hchanPtr.sendx)
	fmt.Printf("Next Read Index (recvx):    %d\n", hchanPtr.recvx)
}
```

Running this shows `qcount` drop from 3 to 2 and `recvx` advance by one after a single `<-ch`, confirming the ring buffer is a real, ordinary circular array under the familiar channel syntax.

---

## Architectural Implications for Production

1. **Mutex contention.** Every send and receive acquires `hchan.lock`. When dozens of goroutines write to a single channel, execution is serialized by that lock. For very high-throughput fan-in scenarios, consider sharded channels (multiple channels, hashed by key) instead of one hot channel.
2. **Unbuffered channels amplify scheduling cost.** With no internal buffer, the sender blocks until a receiver is ready, forcing an immediate context switch on every handoff — fine for coordination, expensive if used as a high-frequency data pipe.
3. **Memory retention from abandoned channels.** Goroutines blocked in `sendq`/`recvq` are kept alive by their `sudog` references, and their entire stacks stay pinned in memory as a result. If a channel is abandoned (nobody ever sends/receives/closes it again) while goroutines are parked on it, those goroutines — and everything they reference — leak silently, with no crash or error to signal the problem.
