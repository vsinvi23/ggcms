---
title: "The Java Memory Model: Volatile, Memory Barriers, and Instruction Reordering"
description: "Why a worker thread can miss an update to a shutdown flag, how CPU store buffers and instruction reordering cause it, why double-checked locking is broken without volatile, and how the JIT compiler enforces the Java Memory Model with hardware fences."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "java"
  - "concurrency"
  - "java-memory-model"
  - "volatile"
  - "memory-barriers"
  - "double-checked-locking"
  - "jit-compiler"
---

# The Java Memory Model: Volatile, Memory Barriers, and Instruction Reordering

## The Problem: The Invisible Update Bug

In a high-throughput, multi-threaded Java application, a common and insidious bug looks like this: a background worker thread polls a boolean flag to decide when to shut down, while a management thread sets that flag to `true`. Under certain execution conditions the worker keeps running indefinitely, completely oblivious to the update.

This isn't a bug in `java.lang.Thread` scheduling. It's a direct consequence of compiler optimizations, hardware store buffers, and the rules defined by the **Java Memory Model (JMM)**. Writing correct concurrent Java code requires understanding how variables move across the boundary between CPU caches and main memory — and where the JMM lets the compiler and CPU take liberties with your code's apparent order of execution.

---

## Architectural Mechanics: Hardware Caching and the JMM Abstraction

Modern machines are multi-core systems where each core has its own fast L1/L2 caches, a shared L3 cache, and comparatively slow main memory. CPUs also use **store buffers** to delay writing data out to cache, letting the execution pipeline keep running without stalling on a cache-line invalidation round trip.

```
       Core 0 (Thread A)                         Core 1 (Thread B)
+-----------------------------+           +-----------------------------+
| Execution Units             |           | Execution Units             |
|   |                         |           |   ^                         |
|   v                         |           |   | (Reads stale value '0') |
| Store Buffer (Writes '1')   |           | L1/L2 Cache (Holds '0')     |
+-----------------------------+           +-----------------------------+
               |                                         ^
               | (Not yet flushed!)                      | (No cache invalidation)
               v                                         |
+-----------------------------------------------------------------------+
|                       Shared L3 Cache / Main Memory                   |
|                       Variable state: flag = 0                        |
+-----------------------------------------------------------------------+
```

To improve throughput, both the JIT compiler and the CPU are free to **reorder instructions**, as long as single-threaded ("as-if-serial") semantics are preserved. In a multi-threaded program, that reordering is exactly what breaks visibility between threads.

The **Java Memory Model** formalizes this with the **happens-before** relationship: a set of rules describing which memory effects are guaranteed to be visible to which threads, in which order. To enforce happens-before across wildly different hardware — strongly-ordered x86 vs. weakly-ordered ARM/PowerPC — the JIT compiler inserts CPU-level **memory barriers** (fences) at the right points.

### Memory Barrier Types

1. **LoadLoad** — preceding reads must complete before subsequent reads execute.
2. **StoreStore** — preceding writes must be flushed to cache before subsequent writes become visible.
3. **LoadStore** — preceding reads must complete before subsequent writes are flushed.
4. **StoreLoad** — the heaviest fence: preceding writes must be flushed before subsequent reads occur, preventing any stale read.

---

## The Danger of Reordering: Double-Checked Locking, Broken

The classic "double-checked locking" pattern for lazily initializing a singleton is famously broken without `volatile`, precisely because of instruction reordering.

```java
public class HelperStore {
    private static HelperStore instance; // Missing volatile!
    private int data;

    private HelperStore() {
        this.data = 42; // Step 1: initialize fields
    }

    public static HelperStore getInstance() {
        if (instance == null) { // Unsynchronized read
            synchronized (HelperStore.class) {
                if (instance == null) {
                    // Out-of-order execution hazard!
                    instance = new HelperStore();
                }
            }
        }
        return instance;
    }
}
```

Compiling `instance = new HelperStore();` conceptually generates three actions:

1. Allocate raw memory for the `HelperStore` object.
2. Run the constructor, initializing `data` to `42`.
3. Write the reference of the newly allocated memory into the static `instance` field.

Without a memory barrier, the JIT/CPU is free to reorder step 2 and step 3. If Thread A executes step 1, then step 3 (publishing the reference), *before* step 2 (initializing `data`), Thread B can read `instance != null` on the outer check, return the not-yet-initialized object, and observe `data == 0` — a corrupted, half-constructed instance leaking into production code.

---

## The Volatile Fix

Declaring a field `volatile` gives two operational guarantees:

1. **Visibility.** A write to a volatile field is immediately flushed to memory/cache and made visible to every thread; a read of a volatile field always fetches the current value rather than a stale cached copy.
2. **No reordering across the volatile access.** The compiler will not reorder instructions around a volatile read or write — which is exactly what fixes the double-checked-locking race: the write to `instance` (once declared `volatile`) cannot be reordered ahead of the constructor's field initialization.

```java
public class VolatileFlagDemo {
    // volatile guarantees any write by Thread A is immediately
    // made visible to Thread B.
    private static volatile boolean keepRunning = true;

    public static void main(String[] args) throws InterruptedException {
        Thread worker = new Thread(() -> {
            long iteration = 0;
            while (keepRunning) {
                // Without volatile, the JIT compiler might legally optimize
                // this loop into: "if (keepRunning) { while (true) { iteration++; } }"
                iteration++;
            }
            System.out.println("Worker stopped. Iterations: " + iteration);
        });

        worker.start();
        Thread.sleep(1000); // Let the worker run for 1 second

        System.out.println("Main thread signaling worker to stop...");
        keepRunning = false; // Write to volatile variable

        worker.join();
        System.out.println("Execution finished cleanly.");
    }
}
```

### Under the Hood: JIT Translation to Assembly

On x86, when HotSpot's JIT compiles a volatile write, it appends a hardware-level fence instruction:

```assembly
lock addl $0x0, (%rsp)  ; assembly fence forcing a StoreLoad boundary
```

This acts as a full compiler fence: it forces the store buffer to drain into L1/L2 immediately and invalidates the corresponding cache line on every other active core. On ARM, the compiler emits an explicit `dmb` (Data Memory Barrier) instruction to achieve the same guarantee across a weaker memory model.

---

## What `volatile` Does Not Give You: Atomicity

Visibility and ordering are not the same thing as atomicity. `count++` is not one operation — it's three: read, increment, write. If two threads run `count++` concurrently on a `volatile int count`, both can read the same value before either writes back, and one increment is lost, even though every individual read and write is immediately visible.

```java
private volatile int nonAtomicCounter = 0;
// nonAtomicCounter++ is UNSAFE under concurrent access, even though the field is volatile.
```

For compound read-modify-write operations you need either a lock (`synchronized`, `ReentrantLock`) or an atomic type (`AtomicInteger`, `AtomicLong`), which perform the read-modify-write as a single CAS-based hardware operation.

---

## Key Takeaways

- **The JMM abstracts hardware cache/reordering behavior** into a portable set of visibility and ordering guarantees the language spec commits to.
- **`volatile` gives visibility and ordering, not atomicity.** Use it for status flags and safe publication, not for compound counters.
- **Double-checked locking requires `volatile`** on the lazily initialized field — otherwise constructor writes can be observed out of order by another thread.
- **Memory barriers are the real mechanism**: LoadLoad, StoreStore, LoadStore, and the heavyweight StoreLoad fence are what the JVM actually emits to make happens-before true on real hardware.
