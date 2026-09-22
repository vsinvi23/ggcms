# Go Mutexes: Starvation Modes and Fairness in sync.Mutex

Concurrency is a core tenet of the Go programming language, enabled by goroutines and channels. When shared memory must be modified, Go provides `sync.Mutex` for mutual exclusion. However, under high contention, simple locking mechanisms can cause severe latency distribution problems: some goroutines may get starved of execution, waiting indefinitely while others repeatedly acquire the lock.

To solve this, Go's `sync.Mutex` implements a sophisticated dual-mode design that balances high-throughput "barging" with strict "starvation" protection.

---

## The Problem: Throughput vs. Fairness

In mutual exclusion design, there is a fundamental trade-off between lock throughput and lock fairness:

- **Strict Fairness (FIFO)**: Goroutines acquire the lock in the exact order they requested it. While fair, this is slow because a sleeping goroutine must be context-switched and woken up by the CPU before it can grab the lock, during which the CPU remains idle.
- **Barging (Greedy)**: Newly arrived, active goroutines that are already running on a CPU can compete for the lock against a goroutine that is currently waking up. This yields much higher throughput because the running goroutine can immediately execute without waiting for a context switch.

However, unchecked barging causes **mutex starvation**. If new goroutines keep arriving, a blocked, sleeping goroutine might wait forever at the front of the queue, resulting in extreme tail-latencies.

---

## The Mental Model: Normal vs. Starvation Modes

Go's `sync.Mutex` elegantly solves this dilemma by operating in two dynamic states: **Normal Mode** and **Starvation Mode**.

```
Normal Mode (High Throughput)
Incoming Goroutines (Active on CPU) ──┐
                                     ├──► [ Grab Mutex ] 
Waking Goroutine (Front of Queue) ────┘     (Line-cutting/Barging permitted)


Starvation Mode (Fairness Guaranteed - Wait > 1ms)
Incoming Goroutines (Blocked) ───► [ Queue Tail ]
                                         ▲
[ Unlocking Goroutine ] ──Direct Handoff─┘ (Line-cutting BLOCKED)
```

### 1. Normal Mode
In normal mode, waiters are kept in a FIFO queue. However, a waking waiter at the front of the queue must compete for ownership with newly arrived goroutines. 

Because newly arrived goroutines are already running on the CPU, they easily win the lock. If the woken waiter fails to acquire the lock, it is put back at the head of the FIFO queue. If a waiter fails to acquire the lock and waits for more than **1 millisecond**, the mutex transitions into **Starvation Mode**.

### 2. Starvation Mode
In starvation mode, ownership of the mutex is transferred **directly** from the unlocking goroutine to the waiter at the head of the queue.

Newly arriving goroutines do not attempt to acquire the mutex, nor do they spin. Instead, they immediately append themselves to the tail of the FIFO queue. Barging is completely disabled.

### Returning to Normal Mode
The mutex remains in starvation mode until one of two conditions is met:
1. The acquiring waiter is the last waiter in the queue.
2. The acquiring waiter's total wait time is less than 1 millisecond.

Once either condition is satisfied, the mutex transitions back to normal mode to restore high-throughput operations.

---

## Code Investigation: Mutex Latency Simulation

The following Go program simulates a highly contested lock. It spawns long-running writers alongside frequent, short-lived readers to demonstrate how Go's scheduler and mutex guard against starvation.

```go
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Start a goroutine that holds the lock repeatedly
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 5; i++ {
			mu.Lock()
			fmt.Println("Heavy worker acquired lock.")
			time.Sleep(200 * time.Millisecond) // Simulate heavy work
			mu.Unlock()
			time.Sleep(5 * time.Millisecond) // Brief pause to let others try
		}
	}()

	// Spawn multiple lightweight goroutines competing for the same lock
	for i := 1; i <= 3; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			time.Sleep(10 * time.Millisecond) // Ensure heavy worker starts first
			
			start := time.Now()
			mu.Lock()
			fmt.Printf("Reader %d acquired lock after waiting %v\n", id, time.Since(start))
			time.Sleep(10 * time.Millisecond)
			mu.Unlock()
		}(i)
	}

	wg.Wait()
	fmt.Println("Simulation completed successfully.")
}
```

---

## Architectural Guidelines

To design highly concurrent systems in Go:
1. **Keep Critical Sections Short**: Minimize the duration a lock is held. Never perform I/O operations (network calls, database queries) inside a locked section.
2. **Prefer Channels for Orchestration**: Use channels for coordination and data ownership transfer. Defer to `sync.Mutex` only for low-level, high-frequency synchronization of primitive in-memory states.
