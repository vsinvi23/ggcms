# Concurrency from First Principles: Shared State, Race Conditions, and Thread Contention

Multi-threaded programming is often treated as a collection of recipes—developers learn to apply synchronization or lock APIs without understanding the mechanics underneath. To write safe, high-performance parallel code, you must analyze concurrency from first principles: hardware execution, memory sharing, and scheduling structures.

---

## The Problem: The Myth of Simultaneous Execution

We often assume that multi-threaded code runs smoothly in parallel. In reality, unless you are running on dedicated, separate physical hardware processing pipelines, "simultaneous" execution is an illusion managed by the operating system scheduler.

When multiple threads attempt to access and modify the same location in memory concurrently without proper coordination, physical execution pipelines conflict, leading to data corruption and non-deterministic behavior.

---

## Anatomy of a Race Condition

A **Race Condition** occurs when the correct execution of code depends on the exact sequence or timing of thread interleaving.

Consider the simplest non-atomic operation in Java:

```java
public class UnsafeCounter {
    private int count = 0;

    public void increment() {
        count++;
    }
}
```

At the high-level language layer, `count++` looks like a single atomic step. However, when compiled to bytecode and native instructions, it is executed as a **Read-Modify-Write** cycle:

```
Thread 1 (Core 1)               Thread 2 (Core 2)
┌─────────────────┐             ┌─────────────────┐
│ 1. Read count   │             │                 │
│    (Loads 10)   │             │ 1. Read count   │
│ 2. Modify value │             │    (Loads 10)   │
│    (10 -> 11)   │             │ 2. Modify value │
│ 3. Write back   │             │    (10 -> 11)   │
│    (count = 11) │             │ 3. Write back   │
└─────────────────┘             │    (count = 11) │
                                └─────────────────┘
```

If Thread 1 and Thread 2 execute this cycle simultaneously:
1. Both read the value `10` from shared memory.
2. Both increment their local registers to `11`.
3. Both write back the value `11`.

Two increments occurred, but the final count is `11` instead of `12`. This is a classic **Data Race**.

---

## Thread Contention and Scheduling States

When you attempt to protect shared state, you run into **Thread Contention**—a state where multiple threads are competing to acquire a lock or resource.

```
             ┌───────────────┐
             │    NEW        │ (Created)
             └───────┬───────┘
                     │  start()
                     ▼
             ┌───────────────┐
             │   RUNNABLE    │◄────────────────────────┐
             └───────┬───────┘                         │
                     │ (Blocked on Lock)               │ (Lock Acquired)
                     ▼                                 │
             ┌───────────────┐                         │
             │   BLOCKED     ├─────────────────────────┘
             └───────┬───────┘
                     │ (Waiting on Condition)
                     ▼
             ┌───────────────┐
             │   WAITING     │
             └────────────────┘
```

The OS scheduler divides CPU execution into small time segments (quanta). When thread contention occurs, threads transition through multiple states:

* **RUNNABLE:** The thread is actively running or scheduled for execution.
* **BLOCKED:** The thread is suspended, waiting to acquire an intrinsic monitor lock held by another thread. It does not consume CPU cycles, but waking it requires an expensive context switch.
* **WAITING:** The thread is suspended indefinitely until signaled by another thread (e.g., via `Object.wait()` or `LockSupport.park()`).

---

## Clean, Runnable Demonstration of a Race Condition

To demonstrate how concurrency conflicts manifest in execution, we can write a test class that spins up multiple threads to increment a shared counter:

```java
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ConcurrencyHazards {
    private int count = 0;

    public void increment() {
        count++; // Non-atomic write operation
    }

    public int getCount() {
        return count;
    }

    public static void main(String[] args) throws InterruptedException {
        int threadCount = 10;
        int incrementsPerThread = 10_000;
        int totalExpected = threadCount * incrementsPerThread;

        ConcurrencyHazards demo = new ConcurrencyHazards();
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                try {
                    for (int j = 0; j < incrementsPerThread; j++) {
                        demo.increment();
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await(); // Wait for all threads to finish
        executor.shutdown();

        System.out.println("Execution Completed.");
        System.out.println("Expected Count: " + totalExpected);
        System.out.println("Actual Count:   " + demo.getCount());
        System.out.println("Lost Increments: " + (totalExpected - demo.getCount()));
    }
}
```

### Analysis:
Because of the uncoordinated Read-Modify-Write cycle, the actual count will almost always fall far short of the expected $100,000$ iterations. To fix this, we must introduce coordinate structures (locking or atomics) to serialize updates to the shared memory field.
