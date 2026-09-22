# Project Loom Internals: Carrier Threads, Virtual Thread Scheduling, and Pinning Hazards

## The High Cost of Platform Threads
Historically, Java concurrency followed a 1:1 mapping: every `java.lang.Thread` mapped directly to an operating system (OS) thread. OS threads are heavy; they require ~1MB of allocated stack space and rely on the kernel for context switching. If a server attempts to spawn 100,000 threads to handle concurrent socket connections, it will exhaust RAM and thrash the OS scheduler.

Project Loom (finalized in Java 21) introduces **Virtual Threads**—lightweight, JVM-managed threads that decouple Java concurrency from OS scheduling.

## The Architecture of Carrier Threads
Virtual threads operate on an M:N scheduling model. Millions of Virtual Threads (M) are scheduled onto a small pool of OS threads (N). In Loom terminology, the OS threads executing Virtual Threads are called **Carrier Threads**.

Under the hood, the JVM utilizes a dedicated `ForkJoinPool` for Carrier Threads. By default, the size of this pool equals the number of available CPU cores.

```ascii
[ Virtual Threads (Millions) ]
 VT1  VT2  VT3  VT4  VT5  VT6
  |    |    |    |    |    |
============================== (JVM Scheduler / ForkJoinPool)
      |            |
 [Carrier 1]  [Carrier 2]      <- Platform/OS Threads (CPU Cores)
```

## Continuations: Mounting and Unmounting
The magic of Loom is how it handles blocking operations (e.g., waiting for a database response or an HTTP call).

When a Virtual Thread executes a blocking I/O operation via standard JDK libraries (`java.net`, `java.io`), it does not block the underlying Carrier Thread. Instead, the JVM employs **Continuations**.
1. **Unmount**: The Virtual Thread yields execution. The JVM captures its call stack and variables, saving them to the Java heap.
2. **Free Carrier**: The Carrier Thread is immediately freed to execute a different Virtual Thread (`VT2`).
3. **Mount**: When the I/O operation completes, the JVM retrieves the stack from the heap, remounts the Virtual Thread onto an available Carrier Thread, and resumes execution exactly where it left off.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 100_000).forEach(i -> {
        executor.submit(() -> {
            Thread.sleep(Duration.ofSeconds(1)); // Unmounts! Carrier thread freed.
            System.out.println("Task " + i);
        });
    });
} // Finishes in ~1 second, not days.
```

## The Hazard of Thread Pinning
While Project Loom rewrote most of the JDK to support yielding, there are edge cases where a Virtual Thread *cannot* unmount. When this happens, the Virtual Thread is **Pinned** to the Carrier Thread. If it blocks while pinned, the Carrier Thread blocks, starving the system of CPU resources.

### Causes of Pinning
1. **`synchronized` Blocks/Methods**: The most common culprit. If a Virtual Thread enters a `synchronized` block and then performs a blocking I/O operation, it is pinned.
   *Remediation*: Replace `synchronized` with `java.util.concurrent.locks.ReentrantLock`.
2. **Native Code (JNI)**: If a Virtual Thread calls into C/C++ code via JNI, and the native code blocks, the JVM cannot capture the native stack. The Carrier thread is pinned.

```java
// DANGEROUS IN LOOM
public synchronized void fetchData() {
    // Virtual thread gets pinned here!
    String data = db.readBlocking(); 
}

// LOOM-SAFE
private final ReentrantLock lock = new ReentrantLock();
public void fetchDataSafe() {
    lock.lock();
    try {
        // Unmounts perfectly safely
        String data = db.readBlocking();
    } finally {
        lock.unlock();
    }
}
```

## Diagnostics
To detect pinning hazards in existing codebases, run the JVM with the diagnostic flag:
`-Djdk.tracePinnedThreads=full`
This prints stack traces whenever a thread pins, allowing you to systematically replace legacy `synchronized` I/O blocks.

## Conclusion
Project Loom revolutionizes Java concurrency, making Thread-Per-Request architectures scalable again. However, mastering it requires understanding the Carrier Thread model and diligently auditing legacy code for `synchronized` blocks that could pin Carrier Threads and cripple application throughput.
