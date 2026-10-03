---
title: "B-Trees in Go: High-Fanout, Disk-Optimized Nodes for Database Indexes"
description: "Why databases use B-trees instead of binary search trees - packing keys into page-sized fat nodes to minimize disk seeks, with a Go implementation of node search and the split-on-overflow balancing rule."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "data-structures"
  - "b-tree"
  - "database-indexing"
  - "algorithms"
---

# B-Trees in Go: High-Fanout, Disk-Optimized Nodes for Database Indexes

## The Problem: The Cost of Disk I/O

Traditional binary search trees assume all data lives in RAM. Once a dataset exceeds memory, it has to spill to disk — and disk reads happen in fixed-size blocks (pages), typically 4KB or 8KB. A BST traversal might touch 20 nodes scattered randomly across disk, triggering 20 separate page faults and crippling throughput. This is precisely the problem that motivates B-trees, which is why they — not binary search trees — are what every production relational database uses for its indexes.

## Memory-Level Internals: Embracing Fat Nodes

A B-tree solves the disk-I/O problem by packing multiple keys and child pointers into a single "fat" node, explicitly sized to match the OS page size. A B-tree of order $m$ can have up to $m$ children and $m-1$ keys per node.

In Go, storing keys in a contiguous slice gives spatial locality: a B-tree node pulls its entire key array into L1/L2 cache in a single fetch, letting an in-node binary search run almost entirely out of cache.

```go
package btree

const Order = 4 // Defines maximum children. Max keys = 3.

type Node struct {
    Keys     []int
    Children []*Node
    IsLeaf   bool
}

func NewNode(isLeaf bool) *Node {
    // Pre-allocate to prevent slice resizing overhead
    return &Node{
        Keys:     make([]int, 0, Order-1),
        Children: make([]*Node, 0, Order),
        IsLeaf:   isLeaf,
    }
}
```

---

## Traversing the B-Tree

Searching a B-tree is a two-step process at each node:

1. Binary search (or a linear scan, for small $m$) within the node's `Keys` slice.
2. If found, return. Otherwise, recurse into the corresponding child pointer.

```go
import "sort"

func (n *Node) Search(key int) bool {
    // sort.Search performs binary search within the node
    i := sort.Search(len(n.Keys), func(i int) bool {
        return n.Keys[i] >= key
    })

    if i < len(n.Keys) && n.Keys[i] == key {
        return true // Key found
    }

    if n.IsLeaf {
        return false // Hit the bottom
    }

    // Traverse down
    return n.Children[i].Search(key)
}
```

`sort.Search` returns the index of the first key `>= key`; if that slot exactly matches, we're done. Otherwise, that same index tells us which child pointer to descend into, because in a B-tree, `Children[i]` holds every key strictly between `Keys[i-1]` and `Keys[i]`.

---

## The Split: Maintaining Balance

When an insertion would overfill a node (keys reach $m$), the node **splits**: its middle key is pushed up into the parent, and the node divides into two siblings. This bottom-up splitting is how B-trees grow in height while staying perfectly balanced — there's no separate rebalancing pass like AVL rotations; the split *is* the balancing operation, and it only ever increases the tree's height by one, uniformly, at the root.

In databases like PostgreSQL or MySQL (which typically use B+ Trees — a B-tree variant that stores actual row values only at the leaves, with internal nodes holding keys purely for routing), this high fanout means a billion-row table's index might have a tree height of only 3 or 4. Looking up a single row requires only 3-4 disk seeks — the entire point of the structure is treating RAM latency and disk latency as fundamentally different architectural constraints, and packing as much branching as possible into each unit of disk I/O.
