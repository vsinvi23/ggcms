---
title: "Java Binary Heaps: Array-Backed Priority Queues Without Pointers"
description: "How Java's PriorityQueue maps a complete binary tree onto a flat array with index arithmetic instead of node pointers, and how sift-up and sift-down keep insertion and extraction at O(log N)."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "priority-queue"
  - "binary-heap"
  - "data-structures"
  - "algorithms"
  - "dijkstra"
---

# Java Binary Heaps: Array-Backed Priority Queues Without Pointers

## The Problem: Dynamic Priority

An OS scheduler picking the next thread to run, or Dijkstra's shortest-path algorithm picking the next node to relax, both repeatedly need the "highest priority" element out of a pool that keeps changing. Scanning an unsorted array for the max is O(N) every time. Keeping the array fully sorted makes lookup O(1) but insertion O(N). A binary heap gets both insertion and extraction down to O(log N), with O(1) access to the current extremum.

## Memory-Level Internals: The Array Mapping

A heap is a **complete binary tree** — every level is fully populated except possibly the last, which fills strictly left to right. That structural rigidity enables a memory trick: pointers disappear entirely. The tree maps directly onto a 1D array using pure index arithmetic. In Java, `PriorityQueue<E>` is internally backed by an `Object[]` for exactly this reason.

- The root lives at index `0`.
- The left child of index `i` is at `2i + 1`.
- The right child of index `i` is at `2i + 2`.
- The parent of index `i` is at `(i - 1) / 2`.

```
Array:  [ 4, 10, 15, 20, 12, 30 ]
Index:    0   1   2   3   4   5

Tree view:
                 4(0)
                /    \
            10(1)    15(2)
            /   \      /
        20(3) 12(4)  30(5)
```

This pointer-free layout minimizes object headers and GC overhead, and guarantees contiguous memory access — the CPU cache stays hot because sibling and parent nodes live near each other in memory, unlike a pointer-linked tree scattered across the heap.

```java
public class MinHeap {
    private int[] heap;
    private int size;

    public MinHeap(int capacity) {
        heap = new int[capacity];
        size = 0;
    }

    private int parent(int i) { return (i - 1) / 2; }
    private int left(int i) { return 2 * i + 1; }
    private int right(int i) { return 2 * i + 2; }
}
```

## The Invariant: Heapify

A **min-heap** requires every parent to be less than or equal to both its children. Both mutating operations work by breaking the invariant at one point, then locally repairing it.

### Insertion — O(log N)

Append the new element at the end of the array (the next open slot in the bottom level), then **sift up**: repeatedly swap it with its parent until the invariant holds again.

```java
public void insert(int val) {
    if (size == heap.length) throw new IllegalStateException();
    int current = size++;
    heap[current] = val;

    while (current != 0 && heap[current] < heap[parent(current)]) {
        swap(current, parent(current));
        current = parent(current);
    }
}
```

Because a complete binary tree has height `O(log N)`, sift-up touches at most `O(log N)` ancestors.

### Extraction — O(log N)

Removing the root leaves a hole at index 0. Move the very last element in the array into the root position (this keeps the tree complete), shrink `size`, then **sift down**: repeatedly swap the new root with its smaller child until the invariant holds.

```java
public int extractMin() {
    if (size == 0) throw new IllegalStateException();
    int min = heap[0];
    heap[0] = heap[--size]; // Move last element to root
    siftDown(0);
    return min;
}

private void siftDown(int i) {
    int smallest = i;
    if (left(i) < size && heap[left(i)] < heap[smallest]) smallest = left(i);
    if (right(i) < size && heap[right(i)] < heap[smallest]) smallest = right(i);

    if (smallest != i) {
        swap(i, smallest);
        siftDown(smallest);
    }
}
```

---

## Key Takeaways

- **Array index arithmetic replaces pointers entirely** for a complete binary tree, giving both cache locality and lower per-node memory overhead than a linked node structure.
- **Sift-up repairs the heap after insertion at the bottom**; **sift-down repairs it after removing the root**. Both are bounded by the tree's height, O(log N).
- **`java.util.PriorityQueue`** is exactly this structure under the hood — knowing the array mapping explains its O(log N) `offer`/`poll` complexity and why it doesn't support fast arbitrary-element removal (finding an arbitrary element still takes O(N), since the array isn't sorted, only heap-ordered).
