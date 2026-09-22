---
title: "Project Loom Internals: Carrier Threads, Mounting, and the Pinning Hazard"
description: "Go inside Project Loom's M:N scheduler to see how virtual threads mount and unmount from carrier threads, and learn how synchronized blocks and JNI calls can pin a virtual thread and starve the entire carrier pool."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "java"
  - "project-loom"
  - "virtual-threads"
  - "carrier-threads"
  - "thread-pinning"
  - "concurrency"
---

# Project Loom Internals: Carrier Threads, Mounting, and the Pinning Hazard

## The Problem: The Scalability Limit of 1:1 Threads

In standard Java (pre-JDK 21), concurrent programming relies on platform threads, which are 1:1 wrappers around OS threads. Each platform thread allocates a large, contiguous memory stack (typically 1 MB) directly from the OS. This design creates a hard ceiling: if your application attempts to handle 50,000 concurrent network connections, it demands 50 GB of RAM solely for thread stacks, crashing the JVM with an `OutOfMemoryError`.

To bypass this limit, developers turned to asynchronous reactive frameworks (RxJava, Project Reactor, WebFlux). Reactive architectures come at a high cost, though: they split stack traces, break debugging tools, and force developers into complex, non-blocking fluent APIs that are notoriously difficult to read and maintain. Project Loom introduces **virtual threads** to solve this, offering the simple synchronous "thread-per-request" programming model at the scale of asynchronous engines — but only if you understand the one hazard that can silently defeat the whole model: pinning.

## Architectural Mechanics: M:N Scheduling on Carrier Threads

Project Loom divorces Java threads from OS threads by implementing a lightweight, user-mode thread scheduler inside the JVM.

```text
       Virtual Threads (Heap Allocated, ~1KB)
+-----+  +-----+  +-----+  +-----+  +-----+
| VT1 |  | VT2 |  | VT3 |  | VT4 |  | VT5 |
+-----+  +-----+  +-----+  +-----+  +-----+
   |        |        |        |        |
   +--------+--------+--------+--------+ (JVM Scheduler: ForkJoinPool)
                     |
                     v
       Carrier Threads (Standard OS Platform Threads)
       +--------------------+      +--------------------+
       | Carrier Thread 1   |      | Carrier Thread 2   |
       +--------------------+      +--------------------+
       | (Running VT3)      |      | (Running VT4)      |
       +--------------------+      +--------------------+
```

### Mounting and Unmounting

- **Virtual Threads (VTs)** are stored as Java objects on the JVM heap. Their memory footprint is incredibly small (~1 KB), allowing you to spawn millions of VTs simultaneously.
- **Carrier Threads (CTs)** are standard platform threads managed by a default `ForkJoinPool` scheduler. When a VT is scheduled to run, the JVM **mounts** the virtual thread onto an available carrier thread.
- **Yielding on Block**: when a virtual thread encounters a blocking operation (a network socket read, `Thread.sleep`), the JVM intercepts the block. It copies the virtual thread's stack frames from the execution stack back onto the JVM heap, **unmounts** it, and schedules another ready virtual thread on the newly liberated carrier thread. Once the I/O event completes, the JVM schedules the virtual thread back onto any available carrier thread to resume execution.

This is the entire trick behind Loom's scalability: the expensive OS thread is only "borrowed" for the CPU-bound slices of work, never held hostage for the duration of a blocking call.

## The Pinning Hazard: Starving the Carrier Pool

A critical failure mode in Loom's scheduling is **thread pinning**. During pinning, a virtual thread becomes physically locked to its carrier thread. If the virtual thread executes a blocking operation while pinned, it cannot unmount — meaning the carrier thread itself blocks. If all carrier threads in the pool become pinned simultaneously, the entire virtual thread runtime freezes, even though there may be thousands of other ready-to-run virtual threads waiting.

### Causes of Pinning

1. **Executing within a `synchronized` block or method**: the JVM's virtual thread scheduler cannot transition stack frames out of a native monitor lock, because the lock is tied to the OS thread identity, not the virtual thread.
2. **Executing JNI/native code**: calling C functions through JNI locks the stack pointer, so the JVM cannot safely relocate the virtual thread's stack to the heap mid-call.

## Code Study: Simulating and Resolving Thread Pinning

The following Java code simulates thread pinning using `synchronized` blocks, and shows how to fix it using `ReentrantLock`.

```java
import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;

public class LoomPinningDemo {
    private static final int THREAD_COUNT = 10;
    private static final Object monitorLock = new Object();
    private static final ReentrantLock reentrantLock = new ReentrantLock();

    public static void main(String[] args) throws InterruptedException {
        // Run with system property enabled to diagnose pinning:
        // -Djdk.tracePinnedThreads=short

        System.out.println("--- 1. Running with Pinning Hazard (synchronized) ---");
        long start = System.currentTimeMillis();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < THREAD_COUNT; i++) {
                executor.submit(LoomPinningDemo::executeWithPinning);
            }
        } // Wait for all virtual threads to finish
        System.out.println("Completed in: " + (System.currentTimeMillis() - start) + " ms\n");

        System.out.println("--- 2. Running Optimized Solution (ReentrantLock) ---");
        start = System.currentTimeMillis();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < THREAD_COUNT; i++) {
                executor.submit(LoomPinningDemo::executeWithoutPinning);
            }
        }
        System.out.println("Completed in: " + (System.currentTimeMillis() - start) + " ms");
    }

    // PINNED PATH: Uses synchronized monitor locks
    private static void executeWithPinning() {
        synchronized (monitorLock) {
            try {
                // When executing Thread.sleep inside synchronized,
                // the carrier thread is PINNED. No other VT can use this CT.
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // OPTIMIZED PATH: Uses ReentrantLock
    private static void executeWithoutPinning() {
        reentrantLock.lock();
        try {
            // ReentrantLock is fully integrated with Project Loom.
            // When executing Thread.sleep, the VT unmounts cleanly,
            // leaving the carrier thread free to execute other VTs.
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            reentrantLock.unlock();
        }
    }
}
```

With only a handful of carrier threads (bounded by CPU core count by default), the `synchronized` path serializes execution because every pinned virtual thread ties up an entire carrier thread for the full sleep duration. The `ReentrantLock` path lets virtual threads unmount during the sleep, so many more of them can share the same small pool of carrier threads concurrently.

## Diagnosis and Guidelines

To catch pinning issues before they hit production, run your JVM with the following diagnostic flag:

```bash
java -Djdk.tracePinnedThreads=short LoomPinningDemo
```

This instructs the JVM to print a stack trace whenever a virtual thread blocks while pinned to its carrier thread.

### Migration Rules

- **Replace `synchronized` with `java.util.concurrent.locks.ReentrantLock`** in long-lived or high-contention blocking paths.
- **Do not pool virtual threads.** Virtual threads are cheap and transient; unlike platform threads, you should instantiate them on the fly and let them be garbage-collected immediately after use.

## Key Takeaways

- Virtual threads run M:N on top of a small pool of carrier threads (platform threads), mounting and unmounting around blocking calls.
- Pinning happens inside `synchronized` blocks and JNI calls, where the JVM cannot relocate the virtual thread's stack.
- A pinned virtual thread that then blocks on I/O freezes its carrier thread — and if every carrier thread is pinned, the whole runtime stalls.
- `-Djdk.tracePinnedThreads=short` is the diagnostic tool for finding pinning hotspots; `ReentrantLock` is the fix for `synchronized`-caused pinning.
