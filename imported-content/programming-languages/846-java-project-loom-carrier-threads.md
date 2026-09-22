# Project Loom Internals: Carrier Threads, Virtual Thread Scheduling, and Pinning Hazards

## The Problem: Starvation Under Virtual Thread Migration
A backend engineering team migrates a high-concurrency database wrapper service to Java 21 to take advantage of **Project Loom's Virtual Threads**. The team replaces traditional OS thread pools with virtual threads, expecting high performance and scalability.

However, during benchmark loads, the database service experiences thread starvation. System throughput drops to near zero, response latency spikes, and the JVM locks up.

```text
"ForkJoinPool-1-worker-3" #32 [14820] prio=5 os_prio=0 cpu=1252.12ms elapsed=42s tid=0x00007f81 nid=0x39e4 waiting on condition
   java.lang.Thread.State: WAITING (on object monitor)
        at com.serenya.connector.DBPool.getConnection(DBPool.java:120)
        - waiting to lock <0x000000071da80e0> (a com.serenya.connector.DBPool)
```

The issue stems from a hidden virtual thread pitfall: **Carrier Thread Pinning**. Instead of releasing its carrier thread during blocking database queries, the virtual thread gets "pinned" to the underlying native OS worker thread. This causes worker thread starvation and stalls the system.

---

## Technical Architecture: Project Loom Mechanics
To build high-concurrency systems, you must understand the distinction between Virtual Threads (user-space) and Carrier Threads (kernel-space).

```
                      JAVA PROJECT LOOM VIRTUAL SCHEDULING
+-------------------------------------------------------------------------------+
|                      Virtual Threads (V1, V2, V3, V4)                         |
+-------------------+--------------------+-------------------+------------------+
                    |                    |                   |
                    v                    v                   v
+-------------------+--------------------+--------------------------------------+
|  Carrier Thread 1                      |  Carrier Thread 2 (PINNED!)          |
|  - ForkJoinPool Platform Thread        |  - Blocked on Native call or sync    |
+-------------------+--------------------+-------------------+------------------+
                    |                                        |
                    v                                        v
+-------------------+----------------------------------------+------------------+
|                   Native OS Kernel Thread (Blocked!)                          |
+-------------------------------------------------------------------------------+
```

### 1. The Scheduling Model
* **Virtual Threads (M)** are lightweight, user-space instances of `java.lang.Thread` managed entirely by the JVM runtime.
* **Carrier Threads (N)** are standard platform threads (typically managed by a custom `ForkJoinPool` scheduler) that execute virtual threads on the physical CPU.

When a virtual thread executes a blocking I/O operation (such as a socket read or a sleep command), the Loom runtime unmounts the virtual thread. It saves the virtual thread's stack frames to the Java heap and frees the underlying Carrier Thread to run other virtual threads.

### 2. The Pinning Hazard
Under certain conditions, a virtual thread **cannot** be unmounted from its carrier thread. When this happens, the carrier thread remains blocked alongside the virtual thread, neutralizing Loom's scalability benefits. 

This carrier thread pinning occurs in two scenarios:
1. **Synchronized Blocks/Methods:** When a virtual thread executes a blocking operation inside a `synchronized` block or method.
2. **Native Calls:** When a virtual thread executes blocking code inside a native foreign-function wrapper (JNI or Panama API).

If your database pool uses standard synchronized methods, every query pins its carrier thread. Since the default carrier pool size matches your system's CPU core count, just a few concurrent queries can exhaust and stall your entire scheduler.

---

## Code Implementation: Reproducing and Resolving Pinning Hazards
The following Java 21 implementation demonstrates a carrier thread pinning hazard and shows how to resolve it using modern concurrency primitives.

```java
package com.serenya.concurrency;

import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;
import java.time.Duration;

public class LoomSchedulerDemo {

    // --- CASE 1: UNOPTIMIZED BLOCK (Triggers Carrier Pinning) ---
    public static class DefectiveDatabaseConnector {
        // synchronized locks the object monitor, pinning the virtual thread
        public synchronized void executeQuery() {
            try {
                System.out.println(Thread.currentThread() + " - Query started (Synchronized)");
                // Simulate a database query that blocks the thread
                Thread.sleep(Duration.ofMillis(100));
                System.out.println(Thread.currentThread() + " - Query finished");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // --- CASE 2: OPTIMIZED BLOCK (Permits Free Thread Unmounting) ---
    public static class SafeDatabaseConnector {
        private final ReentrantLock lock = new ReentrantLock();

        public void executeQuery() {
            // ReentrantLock is recognized by the Loom runtime, allowing unmounting
            lock.lock();
            try {
                System.out.println(Thread.currentThread() + " - Query started (ReentrantLock)");
                // Virtual thread unmounts from its carrier thread during this blocking call
                Thread.sleep(Duration.ofMillis(100));
                System.out.println(Thread.currentThread() + " - Query finished");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                lock.unlock();
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        // Limit carrier thread count to expose scheduler starvation quickly
        System.setProperty("jdk.virtualThreadScheduler.parallelism", "2");

        var defectiveConnector = new DefectiveDatabaseConnector();
        var safeConnector = new SafeDatabaseConnector();

        System.out.println("=== Running Pinning Scenario (Synchronized) ===");
        runScenario(defectiveConnector::executeQuery);

        Thread.sleep(1000);

        System.out.println("\n=== Running Safe Scenario (ReentrantLock) ===");
        runScenario(safeConnector::executeQuery);
    }

    private static void runScenario(Runnable task) {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            long startTime = System.currentTimeMillis();
            for (int i = 0; i < 10; i++) {
                executor.submit(task);
            }
            // Executor auto-closes, waiting for all virtual threads to complete
            long duration = System.currentTimeMillis() - startTime;
            System.out.println("All tasks completed in: " + duration + " ms");
        }
    }
}
```

---

## Solving the Problem: Diagnostics and Hardening Rules

### Rule 1: Audit and Profile Pinning Hazards at Startup
Configure your JVM with the system property `-Djdk.tracePinnedThreads=short` (or `full`) during application startup:
```bash
java -Djdk.tracePinnedThreads=short -jar my-loom-service.jar
```
When a virtual thread pins its carrier thread, the JVM prints a stack trace to standard error. Integrate this check into your CI/CD pipelines to catch pinning issues before they hit production.

### Rule 2: Replace `synchronized` with `ReentrantLock`
Audit your dependencies and codebase, replacing synchronized blocks and methods with `java.util.concurrent.locks.ReentrantLock`. Unlike object monitors, `ReentrantLock` allows the virtual thread scheduler to safely unmount blocking tasks, preserving carrier thread availability.

### Rule 3: Throttle High-Concurrency Operations with Semaphores
Do not use unlimited virtual threads for resource-constrained backends (like databases). If your database pool only supports 50 concurrent connections, use a `java.util.concurrent.Semaphore` initialized to 50 to throttle access, preventing excessive virtual thread scheduling and reducing memory overhead.
