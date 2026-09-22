# How Java Garbage Collectors Work: Generational Hypothesis, Mark, Sweep, and Copy

Modern enterprise software handles terabytes of dynamic allocations. If a Garbage Collector (GC) had to scan every object on a 128GB heap during every run, application response latency would skyrocket. To prevent this, JVM garbage collectors leverage physical memory structures optimized around the natural behavior of software objects.

---

## The Problem: The Cost of Global Scanning

The simplest garbage collection algorithm is a global Mark-and-Sweep:
1. **Mark:** Traverses from GC roots, setting a "live" bit on all reachable objects.
2. **Sweep:** Scans the entire heap sequentially, freeing memory of unmarked objects.

While correct, this approach has two massive problems:
* **Fragmentation:** Reclaiming individual objects leaves holes of empty space scattered across memory. When a large array is allocated, the JVM fails to find contiguous free memory, throwing an OOM even if aggregate free memory is high.
* **Stop-The-World (STW) Latency:** Scanning the entire heap requires pausing application threads (STW) to keep the object graph consistent. Pausing for 128GB could take several minutes—completely unacceptable for production systems.

---

## The Weak Generational Hypothesis

JVM engineers observed a fundamental pattern in software performance: **Most allocated objects have extremely short lifetimes.**

```
 Allocation Volume
  ▲
  │   █
  │   █  (Eden Allocations)
  │   █
  │   █
  │   █
  │   █ 
  │   █──┐
  │   │  └───► [ Promotion Threshold ] ────┐
  │   │                                   │  █  (Tenured Old Gen)
  └───────────────────────────────────────────────────────────────► Time / Age
```

Objects are either transient (such as JSON parsing buffers, string builders, local variables within short method calls) which die within milliseconds, or they are highly durable (caches, singletons, active database connection pools) which survive for hours or the application's entire runtime.

Based on this observation, the JVM partitions the Heap into distinct physical generations:

```
Young Generation                                Old Generation
┌──────────────────┬──────────┬──────────┐     ┌────────────────────────┐
│      Eden        │    S0    │    S1    │     │      Tenured           │
│  [New Objects]   │ [To]     │ [From]   │     │  [Long-lived Objects]  │
└──────────────────┴──────────┴──────────┘     └────────────────────────┘
       │                │                      ▲
       │ (Minor GC)     └─────── Promotion ────┘
       ▼
   [ Survivor Copy ]
```

---

## Young Gen Scavenging (Copying Collector)

Because most young objects die quickly, the Young Generation uses a fast **Copying Algorithm**:

1. **Eden Space:** All fresh allocations (`new`) occur here.
2. **Survivor Spaces (S0 / S1):** Two equal-sized blocks. At any moment, one acts as the "From" space and the other as the "To" space.
3. **Execution Cycle (Minor GC):**
   * When Eden fills up, a Minor GC is triggered.
   * The collector marks live objects in Eden and "From" Survivor (e.g., S0).
   * It copies all live objects into the "To" Survivor (e.g., S1) in a tight, contiguous block, resetting their age headers (adding +1).
   * Eden and S0 are wiped clean instantly.
   * The roles of S0 and S1 are swapped.

This copying strategy is extremely fast because it only processes *live* objects. Since ~95% of young objects are dead, the cost is minimal, and the active destination space remains perfectly compacted (no fragmentation).

---

## Old Generation Management (Mark-Sweep-Compact)

If an object survives multiple Young Gen cycles (exceeding the tenuring age threshold, typically 15), it is **Promoted** to the **Old Generation (Tenured)**.

Since the Old Gen holds massive, long-lived datasets, copying them back and forth would be incredibly wasteful. Old Gen collectors (like Serial Old or Parallel Old) use **Mark-Sweep-Compact**:

1. **Mark:** Identifies live objects in Tenured space.
2. **Sweep:** Frees memory occupied by unreachable objects.
3. **Compact:** Shifts all remaining live objects to the beginning of the generation, creating a contiguous free memory zone to prevent fragmentation.

---

## Modern Concurrent Collectors: G1 and ZGC

Traditional collectors pause application threads during these phases. Modern production collectors minimize pause times using advanced heap-splitting strategies:

* **G1 (Garbage-First):** Splits the heap into thousands of small, independent logical regions. It tracks which regions contain the most dead objects and cleans those first ("Garbage-First"), executing marking phases concurrently with application threads.
* **ZGC (Z Garbage Collector):** A scalable low-latency collector. By utilizing **colored pointers** (storing GC metadata within the reference pointer bits) and **load barriers**, ZGC performs almost all marking and compaction work concurrently with active application threads, reducing STW pauses to sub-millisecond durations regardless of heap size.
