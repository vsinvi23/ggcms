---
title: "Java JVM Memory Internals: Generational GC, G1, ZGC, and Memory Leaks"
description: "Why Stop-The-World GC pauses crash latency-sensitive Java services, how the generational heap (Eden, Survivor, Old) and Metaspace are laid out, how Parallel GC, G1, and ZGC trade throughput for latency, and how to diagnose a static-map memory leak in production."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "java"
  - "jvm"
  - "garbage-collection"
  - "g1gc"
  - "zgc"
  - "memory-leaks"
  - "metaspace"
  - "performance-tuning"
---

# Java JVM Memory Internals: Generational GC, G1, ZGC, and Memory Leaks

## The Problem: The "Out Of Memory" Death Spiral

In C++, developers manually allocate and free memory; forget to free it, and the application leaks. Java was designed to eliminate that entire class of bug with the **Garbage Collector (GC)** — an automated background process that scans the memory graph, identifies objects no longer in use, and reclaims them.

But hiding memory management behind an automatic collector introduces a different, very real operational problem: **Stop-The-World (STW) pauses**.

### The Symptom

Imagine a high-frequency trading platform written in Java. Over 30 minutes, millions of short-lived objects are created — JSON parsers, string builders, HTTP request contexts. Eventually the JVM's heap fills up. To safely reclaim memory, the JVM must physically freeze every application thread.

```
  Traffic -> [ Thread 1 ] [ Thread 2 ] [ Thread 3 ] -> Traffic Processed
                  |            |            |
                 (JVM STOPS ALL THREADS TO RUN GC)
                  |            |            |
  Traffic -> [ BLOCKED ]  [ BLOCKED ]  [ BLOCKED ] -> (Timeouts! 502 Bad Gateway!)
```

A Stop-The-World pause can last anywhere from 100ms to several minutes on a badly tuned 64GB heap. During that window the application is functionally dead — load balancers assume it crashed, drop connections, and reroute traffic, which can cascade into a wider outage.

## Why the Problem Is Hard: The Tracing Problem

To know what's safe to delete, the collector performs **reachability analysis** (tracing):

1. Start at the **GC roots** — active threads, static variables, local variables currently on some thread's stack.
2. Follow every reference from those roots out across the heap.
3. Anything reached is **alive**.
4. Anything on the heap that was never reached is **garbage**, and gets swept.

Tracing tens of millions of interconnected objects across a 32GB heap takes real CPU time. If application threads are mutating references *while* the GC traces, the collector risks reclaiming an object a thread just created — which is exactly why older GC algorithms simply froze every thread for the duration of the trace.

## A Simple Mental Model: The Generational Nightclub

Modern JVMs exploit the **weak generational hypothesis**: *"Most objects die young. If an object survives a while, it will likely live a long time."*

Picture the heap as a nightclub with a VIP lounge:

```
                      THE JVM HEAP
   ====================================================
   [ The Dance Floor (Young Generation) ]   [ VIP Lounge (Old Generation) ]

   - Everyone enters here (New Objects).    - People who stay at the club for hours
   - Very crowded, chaotic.                 are moved here.
   - The bouncers clean this area out       - Very quiet, rarely cleaned out.
     every 5 minutes (Minor GC).            - Takes hours to clean (Major GC).
     Most people leave immediately.
```

Splitting the heap this way means the collector doesn't have to scan the entire 32GB heap on every cycle — it scans only the small Young Generation (a couple of milliseconds), and that alone reclaims the vast majority of short-lived, request-scoped garbage.

## Under the Hood: The JVM Heap Architecture

### 1. The Stack (Thread-Private)

Each JVM thread gets a private stack (commonly ~1MB) holding local primitive variables and object references. It shrinks and grows automatically as methods call and return — the GC never touches it.

### 2. Metaspace (Native Memory)

Before Java 8, class metadata, method bytecode, and static variables lived in a fixed-size "PermGen" region on the heap, a frequent source of `OutOfMemoryError: PermGen space`. Java 8 replaced it with **Metaspace**, allocated from the host OS's native memory and grown dynamically as new `.class` files are loaded.

### 3. The Heap (Shared, Object Data)

#### Young Generation (Eden + Survivor spaces)

- **Eden** — every `new` allocation lands here first. When Eden fills, a **Minor GC** runs.
- **Survivor spaces (S0/S1)** — objects that survive a Minor GC move here, bouncing between S0 and S1 across subsequent collections while an age counter increments.

#### Old (Tenured) Generation

Once an object survives enough Minor GCs (commonly age 15), the JVM assumes it's long-lived — a Spring singleton bean, a connection pool, a local cache — and promotes it to the Old Generation. When Old fills up, a **Major GC (Full GC)** runs, historically the source of the worst Stop-The-World pauses.

## Evolution of GC Algorithms

### 1. Parallel GC — the Throughput King

Default in Java 8. Freezes the application entirely but throws many GC threads at the sweep to finish as fast as possible. Best for batch/big-data workloads (Hadoop, Spark) where overall throughput matters more than any single pause.

### 2. G1GC — the Latency Balancer

Default in Java 9/11/17. Splits the heap into hundreds of small (~2MB) regions and cleans the ones with the most garbage first ("Garbage First"), incrementally, aiming for a target pause (e.g., 200ms) instead of one giant Full GC. This is the right default for most Spring Boot / standard microservice workloads.

### 3. ZGC / Shenandoah — near-Zero-Latency

Production-ready from Java 15–21 depending on the collector. Performs tracing, compaction, and object relocation **concurrently** with running application threads, using colored pointers and read barriers to intercept a thread that tries to touch an object mid-move. Pause targets stay under 1ms regardless of whether the heap is 1GB or 16TB — the right tool for ultra-low-latency systems, high-frequency trading, and very large in-memory caches.

## Code Example: Diagnosing a Java Memory Leak

If Java has a garbage collector, how does it still leak memory? **A Java memory leak happens when code holds a strong reference to an object it no longer needs.** As long as that reference exists, the object is reachable from a GC root, so the collector correctly refuses to delete it — and the Old Generation slowly fills up until the process crashes.

### The Bug: An Accidental Cache

```java
import java.util.HashMap;
import java.util.Map;

public class UserSessionManager {

    // VULNERABILITY: static maps act as GC roots.
    // Anything stored here is never collected unless explicitly removed!
    private static final Map<String, byte[]> activeSessions = new HashMap<>();

    public void processUserLogin(String sessionId) {
        // Simulate loading a 1MB user profile into memory
        byte[] userProfileMemory = new byte[1024 * 1024];

        activeSessions.put(sessionId, userProfileMemory);
        System.out.println("Session created. Active sessions: " + activeSessions.size());
    }

    public void processUserLogout(String sessionId) {
        // BUG: the developer forgets to remove the session from the map!
        // activeSessions.remove(sessionId);
        System.out.println("User logged out... but memory remains in the static map!");
    }

    public static void main(String[] args) throws InterruptedException {
        UserSessionManager manager = new UserSessionManager();

        // Simulate 5000 users logging in and out over time
        for (int i = 0; i < 5000; i++) {
            String sessionId = "session_uuid_" + i;
            manager.processUserLogin(sessionId);

            // The user logs out, but the 1MB profile stays in the static map.
            manager.processUserLogout(sessionId);

            Thread.sleep(10);
        }
    }
}
```

Run this and it crashes with `java.lang.OutOfMemoryError: Java heap space` within seconds — every "logged out" session's 1MB profile is still strongly referenced by the static map, so the GC can never reclaim it.

### The Fix

1. **Explicit removal.** Always call `remove()`/`clear()` on a collection once its entries are no longer needed.
2. **`WeakHashMap` for caches.** In a `WeakHashMap`, keys are wrapped in `WeakReference`s. If the map is the *only* thing still referencing a key, the GC is free to reclaim that entry on the next collection — the leak is prevented structurally.
3. **Use a production caching library.** Caffeine or Guava Cache support TTL-based and size-based eviction out of the box; hand-rolled caching layers are exactly where this bug tends to appear.

## Security Analysis: Denial of Service via Metaspace

Can an attacker weaponize this? Yes — via **Metaspace exhaustion**. If a Java service dynamically generates proxy classes at runtime based on user input (older Hibernate/CGLIB proxy generation, or a Nashorn-style dynamic proxy path), an attacker who controls that input can force the server to generate an unbounded number of unique classes. Because class metadata lives in Metaspace — native OS memory, not the bounded JVM heap — Metaspace can grow until the *host* runs out of RAM, at which point the Linux OOM-killer terminates the process.

### Mitigation

Cap Metaspace explicitly so the JVM fails predictably instead of taking the whole host down:

```bash
# Secure, production-ready JVM startup flags (Java 17/21)
java -server \
     -Xms4G -Xmx4G \                  # Lock heap size to 4GB (avoids OS resizing overhead)
     -XX:MaxMetaspaceSize=256m \      # Cap Metaspace to prevent class-generation OOM DoS
     -XX:+UseZGC \                    # Enable the ultra-low-latency Z Garbage Collector
     -jar microservice.jar
```

## Common Misconceptions

**Misconception:** Calling `System.gc()` helps clean up memory faster.
**Reality:** Never call `System.gc()` in production code. It forces a full Stop-The-World Major GC across the entire heap. Called from inside an HTTP handler, it will freeze the web server on the spot. The JVM's own heuristics are far better at deciding when to collect than a hardcoded call.

**Misconception:** Java is slow and bloated compared to C++ or Go.
**Reality:** Java has slower startup (JVM init + JIT warmup), but long-running Java services are extremely fast in steady state. The C2 JIT compiler actively profiles and compiles hot bytecode into heavily optimized native machine code. Combined with ZGC and virtual threads, modern Java competes seriously with Go and C++ in latency-critical workloads.

## Pause and Think

**Critical Question:** If the JVM heap is sized at 8GB (`-Xmx8G`), why does the Java process show up using 10GB of RAM in `top`/`htop`?

### Answer

`-Xmx` only bounds the **heap** — where Java objects live. The process as a whole also allocates:

1. **Metaspace** (class metadata)
2. **Thread stacks** (roughly 1MB per thread — 1000 threads is ~1GB of off-heap memory)
3. **Direct byte buffers** (NIO memory used by Netty/Tomcat for fast network I/O)
4. **JVM internals and JIT code caches**

When sizing a container in Docker/Kubernetes, set the container memory limit 20–30% above the `-Xmx` value — otherwise the kernel kills the container for exceeding its cgroup limit even though the JVM heap itself never overflowed.

---

## Key Takeaways

- **The generational heap (Eden/Survivor/Old)** exists to exploit the fact that most objects die young, avoiding a full-heap scan on every collection.
- **Stop-The-World pauses** must be minimized for latency-sensitive services; G1GC targets a bounded pause, ZGC targets sub-millisecond pauses regardless of heap size.
- **Memory leaks in Java come from accidental strong references** — most often a static collection nobody remembers to clean up. `WeakHashMap` or a real caching library (Caffeine, Guava) fixes this structurally.
- **Metaspace is native memory, not heap memory** — cap it explicitly, or unbounded dynamic class generation can crash the whole host, not just the JVM.
- **Never call `System.gc()`** in production code.
