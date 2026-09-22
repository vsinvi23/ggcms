# Project Loom: Virtual Threads and Concurrency in Java 21

For decades, Java followed a simple and intuitive execution model: the **Thread-per-Request** paradigm. Each incoming web request or transaction was processed by a dedicated execution thread. Writing, debugging, and tracing synchronous code was straightforward because stack traces matched the logical sequence of operations.

However, as web applications scaled, this model hit a hard physical ceiling. In Java, **Platform Threads** are 1:1 wrappers around Operating System kernel threads. OS kernel threads are incredibly resource-heavy: each consumes around 1MB of stack memory, and switching between them requires high-overhead CPU context switching at the kernel level. 

Attempting to scale a server to 100,000 concurrent requests using platform threads would quickly crash the OS due to Out-Of-Memory (OOM) errors or overwhelm the CPU with context-switch thrashing. To bypass this, developers turned to **Reactive Programming** (e.g., Spring WebFlux, RxJava). While reactive frameworks solved the scaling issue, they introduced high cognitive complexity: call stacks were split, debugging became a nightmare, and synchronous coding paradigms were lost.

Java 21 introduces **Virtual Threads** (Project Loom), bringing the simplicity of the Thread-per-Request model together with the scaling efficiency of asynchronous code.

---

## The Mental Model: Virtual, Carrier, and OS Threads

To understand Virtual Threads, we must look at how the Java Virtual Machine (JVM) decouples the execution thread from the operating system thread.

Instead of mapping every Java thread directly to a native OS thread, the JVM introduces a multi-tiered scheduler:

1. **Virtual Threads (Lightweight):** Managed entirely by the JVM, not the OS. They have virtually zero creation overhead and use dynamically sized stack frames stored on the Java heap, taking up as little as a few hundred bytes.
2. **Carrier Threads (Heavyweight):** Standard OS platform threads managed by a ForkJoinPool inside the JVM.
3. **OS Kernel Threads:** The actual hardware threads managed by the operating system.

```
 [ 100,000+ Virtual Threads ]  - Created instantly, stored on the heap.
    |     |     |     |
    v     v     v     v
 [ 16 Carrier Threads (ForkJoinPool) ] - One platform thread per CPU core.
    |     |     |     |
    v     v     v     v
 [ OS Kernel Threads ] - Direct hardware mapping.
```

When a Virtual Thread is running, the JVM **mounts** it onto an available Carrier Thread. If the Virtual Thread executes a blocking operation—such as querying a SQL database via JDBC, calling a REST API, or sleeping—the JVM intercepts this block. 

Instead of freezing the Carrier Thread, the JVM saves the Virtual Thread's call stack to the heap, **unmounts** it from the Carrier Thread, and assigns a different Virtual Thread to that Carrier Thread. When the I/O operation finishes, the JVM's scheduler **remounts** the first Virtual Thread onto any available Carrier Thread to resume execution seamlessly.

The application achieves massive scale using simple, blocking synchronous code without wasting OS threads.

---

## The Code: Spawning 100,000 Concurrent Threads

Let's look at how easy it is to scale concurrency using Virtual Threads compared to the traditional Platform Thread Pool.

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

### Why this scales:
* Running this code with virtual threads takes roughly **1.2 seconds** and consumes only a tiny fraction of system memory.
* If you attempt to run the same code using a traditional cached thread pool, your JVM will likely throw `java.lang.OutOfMemoryError: unable to create new native thread` before reaching even 5,000 threads.

---

## Common Misconceptions & Pitfalls

### 1. "Virtual threads run code faster."
**The Reality:** Virtual threads do not execute CPU instructions any faster than platform threads. In fact, for CPU-bound computations (like cryptography or matrix multiplication), virtual threads add slight scheduling overhead. They are designed exclusively to increase **concurrency throughput** for I/O-bound applications.

### 2. "We should pool virtual threads."
**The Reality:** **Never pool virtual threads.** Thread pools are designed to recycle expensive resources (platform threads). Because virtual threads are extremely cheap and garbage-collected, creating a new virtual thread is as inexpensive as creating a simple `new Object()`. Simply create a virtual thread per task, use it, and let it be collected.

### 3. "The Pinning Problem."
**The Reality:** When a virtual thread executes code inside a `synchronized` block or method, or calls a native C library/JNI, it becomes **pinned** to its carrier thread. If it performs a blocking I/O operation while pinned, the carrier thread is blocked too, completely defeating Loom's scheduling benefits. To prevent pinning on hot paths, replace `synchronized` blocks with modern Java locks like `java.util.concurrent.locks.ReentrantLock`.

---

## Key Takeaways

* **Ideal for I/O-bound Workloads:** Use Virtual Threads for network servers, database-heavy APIs, and file-processing pipelines.
* **Keep Code Simple:** Stop writing complex reactive streams if your primary goal is concurrency throughput. Go back to writing readable, blocking, linear code.
* **Avoid Synchronized Blocks:** Audit your codebase and libraries for `synchronized` statements on blocking operations. Refactor them to `ReentrantLock` to prevent thread pinning and ensure smooth unmounting behavior.
