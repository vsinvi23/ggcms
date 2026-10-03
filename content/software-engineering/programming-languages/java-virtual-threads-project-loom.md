---
title: "Java 21 Virtual Threads: Scaling Thread-Per-Request Without Reactive Code"
description: "See how Java 21's Project Loom lets you spawn 100,000 concurrent virtual threads with simple blocking code, why they scale where platform threads can't, and the common misconceptions — pooling, CPU speed, and the pinning problem — that trip up new adopters."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "virtual-threads"
  - "project-loom"
  - "concurrency"
  - "java-21"
  - "scalability"
---

# Java 21 Virtual Threads: Scaling Thread-Per-Request Without Reactive Code

For decades, Java followed a simple and intuitive execution model: **thread-per-request**. Each incoming web request or transaction was processed by a dedicated execution thread. Writing, debugging, and tracing synchronous code was straightforward because stack traces matched the logical sequence of operations.

As web applications scaled, though, this model hit a hard physical ceiling. In Java, **platform threads** are 1:1 wrappers around operating system kernel threads. OS kernel threads are resource-heavy: each consumes around 1 MB of stack memory, and switching between them requires high-overhead CPU context switching at the kernel level.

Scaling a server to 100,000 concurrent requests using platform threads would quickly crash the OS with out-of-memory errors or overwhelm the CPU with context-switch thrashing. To bypass this, developers turned to reactive programming (Spring WebFlux, RxJava). Reactive frameworks solved the scaling problem, but introduced real cognitive cost: call stacks were split across callbacks, debugging became painful, and the simple synchronous coding style was lost.

Java 21 introduces **virtual threads** (Project Loom), bringing the simplicity of thread-per-request together with the scaling efficiency of asynchronous code.

## The Mental Model: Virtual, Carrier, and OS Threads

To understand virtual threads, look at how the JVM decouples the execution thread from the operating system thread. Instead of mapping every Java thread directly to a native OS thread, the JVM introduces a multi-tiered scheduler:

1. **Virtual threads (lightweight)** — managed entirely by the JVM, not the OS. They have near-zero creation overhead and use dynamically sized stack frames stored on the Java heap, taking up as little as a few hundred bytes.
2. **Carrier threads (heavyweight)** — standard OS platform threads managed by a `ForkJoinPool` inside the JVM.
3. **OS kernel threads** — the actual hardware threads managed by the operating system.

```text
 [ 100,000+ Virtual Threads ]  - Created instantly, stored on the heap.
    |     |     |     |
    v     v     v     v
 [ 16 Carrier Threads (ForkJoinPool) ] - One platform thread per CPU core.
    |     |     |     |
    v     v     v     v
 [ OS Kernel Threads ] - Direct hardware mapping.
```

When a virtual thread is running, the JVM **mounts** it onto an available carrier thread. If the virtual thread executes a blocking operation — a SQL query via JDBC, a REST call, `Thread.sleep` — the JVM intercepts the block instead of freezing the carrier thread. It saves the virtual thread's call stack to the heap, **unmounts** it from the carrier thread, and assigns a different virtual thread to that same carrier thread. When the I/O operation finishes, the JVM's scheduler **remounts** the original virtual thread onto any available carrier thread to resume execution seamlessly.

The application achieves massive scale using simple, blocking, synchronous code, without wasting OS threads on idle waits.

## The Code: Spawning 100,000 Concurrent Threads

Compare how easy it is to scale concurrency using virtual threads versus a traditional platform thread pool.

```java
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

public class VirtualThreadDemo {

    public static void main(String[] args) {
        long start = System.currentTimeMillis();

        // Option 1: Try to spawn 100,000 platform threads (WARNING: May crash your system!)
        // try (var executor = Executors.newFixedThreadPool(100_000)) { ... }

        // Option 2: Spawn 100,000 Virtual Threads using standard try-with-resources
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, 100_000).forEach(i -> {
                executor.submit(() -> {
                    // Simulate blocking database/network call
                    try {
                        Thread.sleep(Duration.ofSeconds(1));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    if (i % 20_000 == 0) {
                        System.out.println("Finished task " + i + " on " + Thread.currentThread());
                    }
                });
            });
        } // Auto-close block awaits completion of all tasks

        long duration = System.currentTimeMillis() - start;
        System.out.println("Completed 100,000 tasks in: " + duration + " ms");
    }
}
```

### Why this scales

Running this code with virtual threads takes roughly 1.2 seconds and consumes only a tiny fraction of system memory, because the 100,000 one-second sleeps overlap almost entirely — each virtual thread unmounts from its carrier during the sleep, freeing that carrier for the next thread.

If you attempt to run the same code using a traditional cached thread pool, your JVM will likely throw `java.lang.OutOfMemoryError: unable to create new native thread` before reaching even 5,000 threads, because each platform thread reserves a full OS stack up front.

## Common Misconceptions & Pitfalls

**Misconception:** "Virtual threads run code faster."

**Reality:** Virtual threads do not execute CPU instructions any faster than platform threads. For CPU-bound computations (cryptography, matrix multiplication), virtual threads add slight scheduling overhead. They are designed exclusively to increase **concurrency throughput** for I/O-bound applications — the win comes from not blocking an expensive OS thread during I/O wait time, not from faster computation.

**Misconception:** "We should pool virtual threads for reuse, like we do with platform threads."

**Reality:** Never pool virtual threads. Thread pools exist to recycle expensive resources (platform threads and their 1 MB stacks). Virtual threads are extremely cheap to create and are garbage-collected like any other object — creating a new virtual thread is closer to `new Object()` than to spinning up an OS thread. Just create one per task and let it be collected.

**Misconception:** "It doesn't matter what code runs inside a virtual thread."

**Reality:** This is "the pinning problem." When a virtual thread executes code inside a `synchronized` block or method, or calls native code through JNI, it becomes **pinned** to its carrier thread. If it performs blocking I/O while pinned, the carrier thread blocks too — completely defeating Loom's scheduling benefit for that thread and starving other virtual threads waiting for a carrier. To prevent pinning on hot paths, replace `synchronized` blocks with `java.util.concurrent.locks.ReentrantLock`, which is fully integrated with the virtual thread scheduler.

## Key Takeaways

- Virtual threads decouple Java's thread abstraction from OS threads via a JVM-managed M:N scheduler running on carrier threads.
- Blocking calls unmount a virtual thread from its carrier instead of blocking the carrier, which is what lets a handful of carrier threads support hundreds of thousands of virtual threads.
- Virtual threads are ideal for I/O-bound workloads — network servers, database-heavy APIs, file-processing pipelines — not for speeding up CPU-bound work.
- Never pool virtual threads, and audit `synchronized` blocks on blocking hot paths for the pinning problem, replacing them with `ReentrantLock` where needed.
