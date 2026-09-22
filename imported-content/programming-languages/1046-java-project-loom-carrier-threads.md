# Project Loom Internals: Carrier Threads, Virtual Thread Scheduling, and Pinning Hazards

## The Problem: The High Cost of Platform Threads
Historically, Java's `java.lang.Thread` mapped 1:1 directly to OS-level threads. OS threads are heavyweight resources. They require ~1MB of memory for the stack and require a costly system call to context-switch. When a thread performs blocking I/O (e.g., calling an external API), the OS thread is parked, doing nothing but holding memory.

In a highly concurrent system handling 10,000 requests, allocating 10,000 OS threads results in 10GB of stack memory alone, causing OutOfMemoryErrors and thrashing the OS scheduler. The reactive programming model (WebFlux, RxJava) solved this by utilizing a small pool of threads and asynchronous callbacks, but it destroyed standard control flow and stack traces.

## The Architectural Solution: Virtual Threads
Project Loom (introduced in JDK 21) solves this via M:N scheduling at the JVM level. Millions of cheap "Virtual Threads" (M) are mapped to a small pool of OS threads called "Carrier Threads" (N).

Virtual threads consume a tiny fraction of memory (starting around a few hundred bytes) and are managed entirely in user space by the JVM, avoiding OS system calls.

### Virtual Thread Architecture
```text
+-------------------------------------------------------------+
| Java Virtual Machine                                        |
|                                                             |
| [Virtual Thread 1]  [Virtual Thread 2]  [Virtual Thread 3]  | <- Millions
|        | (Yield)           | (Mount)                        |
|        v                   v                                |
| +---------------------------------------------------------+ |
| | ForkJoinPool (Scheduler)                                | |
| +---------------------------------------------------------+ |
|        |                   |                                |
| [Carrier Thread A]  [Carrier Thread B]                      | <- Equal to CPU Cores
+-------------------------------------------------------------+
         |                   |
[OS Thread 1]         [OS Thread 2]
```

## How Yielding Works
When a Virtual Thread executes a blocking operation (e.g., `Thread.sleep()`, `Socket.read()`), the JVM intercepts the call.

1.  **Unmount:** The JVM copies the Virtual Thread's call stack from the Carrier Thread's stack into heap memory.
2.  **Yield:** The Carrier Thread is immediately freed. The scheduler assigns a *different* runnable Virtual Thread to that Carrier Thread.
3.  **Resume:** When the I/O operation completes, the JVM moves the Virtual Thread to the runnable queue.
4.  **Mount:** The scheduler finds a free Carrier Thread, copies the Virtual Thread's stack from the heap back onto the Carrier Thread, and resumes execution.

```java
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

public class LoomDemo {
    public static void main(String[] args) {
        // Launching 1,000,000 Virtual Threads
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, 1_000_000).forEach(i -> {
                executor.submit(() -> {
                    // This blocking call unmounts the Virtual Thread.
                    // The Carrier Thread is released to run other tasks.
                    Thread.sleep(1000); 
                    return i;
                });
            });
        }
        // Completes in ~1 second, consuming negligible memory.
    }
}
```

## The Danger of Pinning
While Project Loom makes most blocking code cheap, there are specific scenarios where a Virtual Thread cannot unmount from its Carrier Thread. This is known as **Pinning**.

When a Virtual Thread is pinned and executes a blocking operation, the underlying Carrier Thread (OS Thread) is also blocked. If all Carrier Threads are pinned, the entire application deadlocks or suffers extreme latency.

### Causes of Pinning
1.  **`synchronized` Blocks/Methods:** If a Virtual Thread executes a blocking operation *inside* a `synchronized` block, it pins the Carrier Thread. (The JVM team is actively working to remove this limitation).
2.  **Native Methods/JNI:** Virtual threads cannot unmount while executing native C/C++ code.

### Mitigating Pinning
To avoid pinning, replace `synchronized` blocks with `java.util.concurrent.locks.ReentrantLock`. `ReentrantLock` is aware of Virtual Threads and will properly unmount the thread instead of blocking the Carrier Thread.

```java
// BAD: Pins the Carrier Thread if sleep() is called
public synchronized void doWork() {
    Thread.sleep(1000); // Thread is Pinned!
}

// GOOD: ReentrantLock allows unmounting
private final ReentrantLock lock = new ReentrantLock();

public void doWorkSafe() {
    lock.lock();
    try {
        Thread.sleep(1000); // Unmounts gracefully
    } finally {
        lock.unlock();
    }
}
```

Project Loom fundamentally resets Java concurrency. By writing simple, synchronous code, developers achieve the massive scalability of asynchronous frameworks, but without the cognitive tax.
