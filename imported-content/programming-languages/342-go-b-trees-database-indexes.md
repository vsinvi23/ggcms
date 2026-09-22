# B-Trees in Go: Implementing High-Fanout Disk-Optimized Nodes for Databases

## The Problem: The Cost of Disk I/O
Traditional Binary Search Trees (BSTs) assume all data resides in RAM. When datasets exceed memory, they spill to disk. Disk reads operate in blocks (pages), typically 4KB or 8KB. A BST traversal might require jumping across 20 nodes scattered randomly across the disk, triggering 20 separate page faults and crippling throughput. 

## Memory-Level Internals: Embracing Fat Nodes
The B-Tree solves this by packing multiple keys and child pointers into a single "fat" node explicitly sized to match the OS page size. A B-Tree of order $m$ can have up to $m$ children and $m-1$ keys per node. 

In Go, arrays offer spatial locality. By storing keys in contiguous slices, a B-Tree node pulls the entire array into the CPU L1/L2 cache in one fetch, enabling rapid in-node binary search.

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

## Traversing the B-Tree
Searching a B-Tree is a two-step process: 
1. Perform a binary search (or linear scan for small $m$) within the node's `Keys` slice.
2. If found, return. Else, recursively search the corresponding child pointer.

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

## The Split: Maintaining Balance
When an insertion overfills a node (keys = $m$), the node splits. The middle key is pushed up to the parent, and the node divides into two. This bottom-up splitting is how B-Trees grow in height while remaining perfectly balanced.

In databases like PostgreSQL or MySQL (which use B+ Trees, storing values only at leaves), this high fanout means a billion-row table might only have a tree height of 3 or 4. Searching for a row requires only 3-4 disk seeks. By treating RAM latency and Disk latency as distinct architectural constraints, B-Trees enable modern DB indexing.
