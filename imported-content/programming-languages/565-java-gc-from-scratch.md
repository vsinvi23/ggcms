# Garbage Collection from First Principles: Tracing GC Roots and Object Reachability

To build systems that run continuously without leak-induced degradation, you must understand how a tracing Garbage Collector operates. Rather than relying on simple, flawed metrics like reference counts, modern execution environments determine memory liveness using graph-theoretic reachability analyses.

---

## The Problem: The Inadequacy of Reference Counting

A naive approach to automated memory management is **Reference Counting**. In this model, every object keeps a counter tracking how many references point to it. When a pointer changes, the counter increments or decrements:

```
[ Object A (count=1) ] ───► [ Object B (count=1) ]
```

When an object's reference count drops to 0, it is immediately deleted. 

While simple, reference counting fails to handle **Cyclic References**. Consider the following scenario:

```java
class Node {
    Node partner;
}

public class CycleDemo {
    public void createLeak() {
        Node x = new Node(); // Node x count = 1
        Node y = new Node(); // Node y count = 1
        
        x.partner = y; // Node y count = 2
        y.partner = x; // Node x count = 2
        
        // Scope ends: local variables x and y are destroyed.
        // Node x and y counts decrement by 1, leaving both at count = 1.
        // They are completely inaccessible to the application, yet count != 0!
    }
}
```

Because their reference counts never reach 0, they leak. To prevent leaks from cyclic references, the JVM uses **Tracing Garbage Collection** based on **GC Roots**.

---

## The Reachability Graph

A tracing garbage collector treats the entire heap of memory as a directed graph. The nodes are objects, and the edges are the reference pointers within those objects.

```
  [ GC Root: Thread Stack Local ]
                │
                ▼
         [ Live Object A ] ────────► [ Live Object B ]
                │
                ▼
         [ Live Object C ]

   [ Dead Object D ] ◄─────────────► [ Dead Object E ]
```

The Garbage Collector identifies all active objects by tracing paths outward from a core set of highly secure, entry-point nodes called **GC Roots**.

An object is classified as **Live** if there is a valid traversal path from a GC Root to that object. If no such path exists—even if the dead objects refer to each other in a closed loop (like `Object D` and `Object E` above)—they are classified as unreachable and marked for reclamation.

---

## What is a GC Root?

For the JVM to guarantee that an object is safe to delete, it must ensure no active pathway in the current application execution can access it. GC Roots are the absolute anchor points of execution. They are categorised into four main groups:

1. **Local Variables on Thread Stacks:** Parameters and variables in active method frames (such as the currently running threads). If a thread is executing a method, any local reference variable is actively alive.
2. **Static Variables (System Dictionary):** Static fields of loaded classes. Because static fields belong to the class definition and classes persist throughout application runtimes, these references remain active.
3. **JNI / Native References:** Objects passed to native C/C++ code via the Java Native Interface (JNI) or held by global native code references.
4. **Active Monitors:** Objects holding active synchronization locks (`synchronized` monitors or objects used in active thread sync).

---

## The Tracing Cycle (Pseudo-Code)

A basic tracing algorithm follows a **Mark-and-Sweep** process. Here is a simplified conceptual representation of how a tracer scans memory:

```java
import java.util.*;

public class TracingCollector {
    private final Set<Object> heap = new HashSet<>();
    private final Set<Object> gcRoots = new HashSet<>();

    public void runGarbageCollection() {
        // 1. Initialize mark phase
        Set<Object> markedLive = new HashSet<>();
        Queue<Object> greyNodes = new LinkedList<>();

        // 2. Load GC Roots onto traversal queue
        for (Object root : gcRoots) {
            if (root != null) {
                greyNodes.add(root);
                markedLive.add(root);
            }
        }

        // 3. Breadth-first search traversal of the graph
        while (!greyNodes.isEmpty()) {
            Object current = greyNodes.poll();
            for (Object child : getReferences(current)) {
                if (!markedLive.contains(child)) {
                    markedLive.add(child);
                    greyNodes.add(child);
                }
            }
        }

        // 4. Sweep Phase: Reclaim everything that was not marked live
        Iterator<Object> iterator = heap.iterator();
        while (iterator.hasNext()) {
            Object item = iterator.next();
            if (!markedLive.contains(item)) {
                System.out.println("Reclaiming unreachable object memory: " + item);
                iterator.remove(); // Reclaim space
            }
        }
    }

    private List<Object> getReferences(Object obj) {
        // In actual JVM, reads object metadata field layouts to extract references
        return Collections.emptyList(); 
    }
}
```

Through this graph traversal, the tracing collector guarantees that cyclic data structures are cleaned up seamlessly the moment they are decoupled from active GC Roots.
