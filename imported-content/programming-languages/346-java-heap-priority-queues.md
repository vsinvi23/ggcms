# Min/Max Heaps in Java: Array-Based Complete Binary Trees for Priority Queues

## The Problem: Dynamic Priority
Operating systems scheduling threads or pathfinding algorithms like Dijkstra's repeatedly demand the "highest priority" element from a dynamically changing pool. Finding the max in an unsorted array takes $O(N)$. Maintaining a sorted array takes $O(N)$ for insertions. We need both operations bounded by $O(\log N)$, with strictly $O(1)$ access to the extremum.

## Memory-Level Internals: The Array Mapping
A Heap is a Complete Binary Tree. By definition, all levels are fully populated except possibly the last, which is filled from left to right. This structural rigidity allows a magical memory optimization: pointers are entirely eliminated. 

The tree is mapped directly onto a 1D array. In Java, this means `PriorityQueue<E>` is internally just an `Object[]`.
- The root is at index `0`.
- The left child of index `i` is at `2i + 1`.
- The right child is at `2i + 2`.
- The parent is at `(i - 1) / 2`.

This pointer-free layout minimizes object headers, GC overhead, and guarantees contiguous memory access, keeping the CPU cache hot.

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
The heap property dictates that every parent must be smaller than or equal to its children (in a Min-Heap). 

### Insertion ($O(\log N)$)
We append the new element to the end of the array (bottom of the tree) and "sift up" (or heapify-up) by swapping it with its parent until the invariant is restored.

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

### Extraction ($O(\log N)$)
Extracting the root leaves a hole. We move the absolute last element in the array to the root position, then "sift down" by swapping it with its smallest child.

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
