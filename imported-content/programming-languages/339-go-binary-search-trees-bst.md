# Binary Search Trees in Go: Pointer Mechanics and $O(\log N)$ Lookups

## The Problem: Dynamic Ordered Data
Arrays provide $O(1)$ lookups but $O(N)$ insertions. Linked lists offer $O(1)$ insertions (at known nodes) but $O(N)$ lookups. The Binary Search Tree (BST) bridges this gap, aiming for $O(\log N)$ time complexity for both operations by maintaining a strict invariant: for any node, all left descendants are smaller, and all right descendants are larger.

## Memory-Level Internals in Go
In Go, a BST is fundamentally a graph of heap-allocated structs stitched together via pointers. Each traversal step requires a pointer dereference. On modern CPUs, this pointer chasing defeats the L1/L2 cache prefetcher. Unlike arrays which enjoy contiguous spatial locality, BST nodes scatter across the heap. The garbage collector (GC) must scan these pointers, introducing overhead proportional to the tree size.

```go
package main

type Node struct {
    Key   int
    Value string
    Left  *Node
    Right *Node
}

type BST struct {
    Root *Node
}
```
A 64-bit architecture requires 24 bytes per node for pointers (Left, Right) and an additional 16 bytes for the integer and string header, totaling 40 bytes plus GC overhead.

## Implementation: Iterative vs. Recursive
While recursive insertions are elegant, iterative traversal in Go avoids function call stack overhead and potential stack overflow panics on highly unbalanced trees.

```go
func (t *BST) Insert(key int, val string) {
    newNode := &Node{Key: key, Value: val}
    if t.Root == nil {
        t.Root = newNode
        return
    }

    curr := t.Root
    for {
        if key < curr.Key {
            if curr.Left == nil {
                curr.Left = newNode
                return
            }
            curr = curr.Left
        } else if key > curr.Key {
            if curr.Right == nil {
                curr.Right = newNode
                return
            }
            curr = curr.Right
        } else {
            // Update existing
            curr.Value = val
            return
        }
    }
}
```

## The $O(N)$ Pathological Case
The fatal flaw of the naive BST is sorted input. Inserting `[1, 2, 3, 4, 5]` yields a right-leaning linked list. Lookups degrade to $O(N)$. Resolving this requires self-balancing invariants (AVL, Red-Black), introducing rotational logic to strictly bound the height to $\approx \log_2 N$. 
