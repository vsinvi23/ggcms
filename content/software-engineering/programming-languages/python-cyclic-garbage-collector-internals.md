---
title: "CPython Internals: How the Cyclic Garbage Collector Works"
description: "A deep dive into CPython's generational cyclic garbage collector — why reference counting alone cannot free circular references, and how the trial deletion algorithm finds and reclaims them."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "python"
  - "cpython"
  - "garbage-collection"
  - "reference-counting"
  - "memory-management"
---

# CPython Internals: How the Cyclic Garbage Collector Works

In CPython (the standard reference implementation of Python), memory management relies primarily on **reference counting**. Every Python object contains a header field called `ob_refcnt`, which tracks how many references point to that object. When `ob_refcnt` drops to zero, CPython immediately deallocates the object's memory.

While reference counting is deterministic and fast, it has a fatal flaw: it cannot resolve **reference cycles**. To prevent silent, permanent memory leaks caused by circular references, CPython implements a secondary, cyclic garbage collector.

## The Problem: The Reference Cycle Deadlock

A reference cycle occurs when two or more objects refer to each other, directly or indirectly, creating a closed loop.

```python
class Node:
    def __init__(self):
        self.ref = None

# Create circular references
node_a = Node()
node_b = Node()
node_a.ref = node_b
node_b.ref = node_a

# Sever the external references
del node_a
del node_b
```

Before the `del` statement, both nodes have a reference count of 2 (one external reference and one internal cross-reference). After deleting the external references, the reference counts drop to 1.

Because the counts are not zero, reference counting alone cannot reclaim them. Yet, they are completely unreachable from the application, resulting in a classic memory leak.

```text
Unreachable Cycle on the Heap
┌──────────┐  ref   ┌──────────┐
│  Node A  ├───────>│  Node B  │
│(ob_ref=1)│<───────┤(ob_ref=1)│
└──────────┘  ref   └──────────┘
```

## The Mental Model: Generational GC and Trial Deletion

To clear these orphaned cycles, Python's cyclic garbage collector runs periodically in the background. It employs two key concepts: **Generational Collection** and **Trial Deletion**.

### 1. Generational Collection (GC Generations)

CPython categorizes container objects (objects capable of holding references to other objects, like lists, dicts, tuples, and user classes) into three generations:

- **Generation 0**: Newly created objects. Collected most frequently.
- **Generation 1**: Survivors of Generation 0 collections.
- **Generation 2**: Long-lived survivors of Generation 1. Collected least frequently.

The collection is triggered when the number of allocations minus deallocations exceeds a generation's configured threshold.

### 2. The Trial Deletion Algorithm

To identify cycles without affecting valid objects, the cyclic GC performs a dry-run deduction process on container objects in a targeted generation:

1. **Copy Counts**: The GC copies the `ob_refcnt` of each container object into a temporary counter field named `gc_refs`.
2. **Trial Dec**: The GC traverses all container objects and, for every referenced child object, decrements that child's `gc_refs` by 1.
3. **Partition**:
   - Any object whose `gc_refs` remains **greater than 0** is deemed reachable from outside the generation.
   - Any object whose `gc_refs` drops to **exactly 0** is suspected to be part of an unreachable cycle.
4. **Reconciliation**: The GC performs a depth-first search starting from all definitely reachable objects. If a suspected "zero-ref" object is reachable from a live object, its status is restored to reachable.
5. **Sweep**: Objects remaining with a `gc_refs` of 0 are confirmed as garbage and are safely swept.

## Code Investigation: Watching Cycle Reclamation

The following complete Python script demonstrates reference cycles, disables auto-GC to observe the leak, and then forces manual cyclic GC collection to reclaim the leaked memory.

```python
import gc
import sys

class CycleNode:
    def __init__(self, name):
        self.name = name
        self.partner = None

def trigger_cycle():
    # Disable automatic collection to isolate our test
    gc.disable()

    # Create cyclic reference
    a = CycleNode("Node A")
    b = CycleNode("Node B")
    a.partner = b
    b.partner = a

    # Get id references
    id_a, id_b = id(a), id(b)

    print(f"Reference count of A: {sys.getrefcount(a) - 1}") # Prints 2

    # Sever external pointers
    del a
    del b

    # Force a collection and print results
    unreachable_count = gc.collect()
    print(f"Garbage collector found and freed {unreachable_count} objects.")

    # Re-enable GC
    gc.enable()

if __name__ == "__main__":
    trigger_cycle()
```

## Engineering Guidelines for Python GC

To minimize memory overhead and keep GC pauses low in high-throughput Python applications:

1. **Break Cycles Manually**: Use the `weakref` module (such as `weakref.ref` or `weakref.proxy`) when implementing parent-child or observer patterns so that back-references do not increment the reference count.
2. **Disable GC Carefully**: In massive, batch-processing pipelines, temporarily calling `gc.disable()` can improve execution speeds by preventing mid-loop trial deletion runs, provided you call `gc.collect()` manually once the batch finishes.
