# Project Loom Internals: Carrier Threads, Virtual Thread Scheduling, and Pinning Hazards

## The Problem: The Scalability Limit of 1:1 Threads

In standard Java (pre-JDK 21), concurrent programming relies on platform threads, which are 1:1 wrappers around OS threads. Each platform thread allocates a large, contiguous memory stack (typically 1 MB) directly from the OS. This design creates a hard ceiling: if your application attempts to handle 50,000 concurrent network connections, it demands 50 GB of RAM solely for thread stacks, crashing the JVM with an `OutOfMemoryError`.

To bypass this limit, developers turned to asynchronous reactive frameworks (e.g., RxJava, Project Reactor, WebFlux). However, reactive architectures come at a high cost: they split stack traces, break debugging tools, and force developers into complex, non-blocking fluent APIs that are notoriously difficult to read and maintain. Project Loom introduces **Virtual Threads** to solve this, offering the simple synchronous "thread-per-request" programming model with the scale of asynchronous engines.

---

## Architectural Mechanics: M:N Scheduling on Carrier Threads

Project Loom divorces Java threads from OS threads by implementing a lightweight user-mode thread scheduler inside the Java Virtual Machine (JVM).

```
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

### 1. Mounting and Unmounting
*   **Virtual Threads (VTs):** Are stored as Java objects on the JVM heap. Their memory footprint is incredibly small (~1 KB), allowing you to spawn millions of VTs simultaneously.
*   **Carrier Threads (CTs):** Are standard platform threads managed by a default ForkJoinPool scheduler. When a VT is scheduled to run, the JVM **mounts** the virtual thread onto an available carrier thread.
*   **Yielding on Block:** When a virtual thread encounters a blocking operation (e.g., executing a network socket read or `Thread.sleep`), the JVM intercepts this block. It copies the virtual thread's stack frames from the execution stack back onto the JVM heap, **unmounts** it, and schedules another ready virtual thread on the newly liberated carrier thread. Once the I/O event completes, the JVM schedules the virtual thread back onto any available carrier thread to resume execution.

---

## The Pinning Hazard: Starving the Carrier Pool

A critical vulnerability in Loom's scheduling is **Thread Pinning**. During pinning, a virtual thread becomes physically locked to its carrier thread. If the virtual thread executes a blocking operation while pinned, it cannot unmount, meaning the carrier thread itself blocks. If all carrier threads in the pool become pinned, the entire virtual thread runtime freezes.

### Causes of Pinning
1.  **Executing within a `synchronized` block or method:** The JVM's virtual thread scheduler cannot transition stack frames out of a native monitor lock.
2.  **Executing JNI/Native code:** Calling C functions through JNI locks the stack pointer.

---

## Code Study: Simulating and Resolving Thread Pinning

The following Java code simulates thread pinning using `synchronized` blocks and shows how to fix it using `ReentrantLock`.

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

---

## Diagnosis and Guidelines

To catch pinning issues before they hit production, run your JVM with the following diagnostic flag:

```bash
java -Djdk.tracePinnedThreads=short LoomPinningDemo
```

This instructs the JVM to print a stack trace whenever a virtual thread blocks while pinned to its carrier thread.

### Migration Rules
*   **Replace `synchronized` with `java.util.concurrent.locks.ReentrantLock`** in long-lived or high-contention blocking paths.
*   **Do not pool virtual threads.** Virtual threads are cheap and transient; unlike platform threads, you should instantiate them on the fly and let them garbage-collect immediately after use.
