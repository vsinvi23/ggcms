---
title: "Graph BFS in Go: Finding Shortest Paths with Queues and Channels"
description: "Implement breadth-first search for unweighted shortest-path discovery in Go, including the hidden memory leak in slice-based queues and when concurrent BFS actually pays off."
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "golang"
  - "algorithms"
  - "graphs"
  - "breadth-first-search"
  - "shortest-path"
  - "data-structures"
---

# Graph BFS in Go: Finding Shortest Paths with Channels and Queues

## The Problem: Unweighted Shortest Path Discovery

In social network analysis or peer-to-peer routing, a fundamental operation is finding the shortest path between two nodes in an unweighted graph. For unweighted graphs, Breadth-First Search (BFS) is the optimal algorithm, guaranteeing O(V + E) time complexity. Go's concurrency primitives (channels) and slice-based queues offer elegant and performant ways to implement this traversal.

## Memory-Level Internals of BFS

BFS explores a graph radially, visiting all neighbors of a node before moving deeper. This requires a FIFO (first-in-first-out) queue. In Go, an idiomatic queue is simply a slice where we append to enqueue and slice off the front to dequeue.

```text
   Level 0: [ 0 ]
              |
   Level 1: [ 1 ][ 2 ]          <- all neighbors of 0, visited together
              |    |
   Level 2: [ 3 ][ 4 ]          <- all neighbors of level 1, one hop further
              |    |
   Level 3: [ 5 ]

   Queue evolution while processing node 0:
   [0]  -> dequeue 0, enqueue 1,2 -> [1,2]
   [1,2] -> dequeue 1, enqueue 3   -> [2,3]
   [2,3] -> dequeue 2, enqueue 4   -> [3,4]
   ...
```

Under the hood, appending to a Go slice may trigger a reallocation if the capacity is exceeded. To minimize GC pressure and memory copying, it is best to pre-allocate the slice with a reasonable capacity, or use a linked-list-based queue for graphs with massive branching factors. Furthermore, a `visited` array (or a map, if node IDs are non-contiguous) is crucial to prevent infinite loops in cyclic graphs.

## Robust Go Implementation

Below is an implementation of a standard queue-based BFS that tracks distance from the start node.

```go
package main

import (
	"fmt"
)

// Graph represents an unweighted, directed graph using an adjacency list.
type Graph struct {
	Vertices int
	Edges    map[int][]int
}

// NewGraph creates a new Graph.
func NewGraph(vertices int) *Graph {
	return &Graph{
		Vertices: vertices,
		Edges:    make(map[int][]int),
	}
}

// AddEdge adds a directed edge from u to v.
func (g *Graph) AddEdge(u, v int) {
	g.Edges[u] = append(g.Edges[u], v)
}

// ShortestPathBFS finds the shortest path length from start to target.
// Returns -1 if no path exists.
func (g *Graph) ShortestPathBFS(start, target int) int {
	if start == target {
		return 0
	}

	// Queue for BFS; storing the vertex and its distance from the start
	type nodeDist struct {
		id   int
		dist int
	}

	// Pre-allocating slice capacity to reduce memory re-allocations
	queue := make([]nodeDist, 0, g.Vertices)
	queue = append(queue, nodeDist{id: start, dist: 0})

	visited := make([]bool, g.Vertices)
	visited[start] = true

	for len(queue) > 0 {
		// Dequeue
		current := queue[0]
		queue = queue[1:]

		// Iterate through neighbors
		for _, neighbor := range g.Edges[current.id] {
			if !visited[neighbor] {
				if neighbor == target {
					return current.dist + 1
				}
				visited[neighbor] = true
				queue = append(queue, nodeDist{id: neighbor, dist: current.dist + 1})
			}
		}
	}

	return -1 // Path not found
}

func main() {
	g := NewGraph(6)
	g.AddEdge(0, 1)
	g.AddEdge(0, 2)
	g.AddEdge(1, 3)
	g.AddEdge(2, 4)
	g.AddEdge(3, 5)
	g.AddEdge(4, 5)

	dist := g.ShortestPathBFS(0, 5)
	fmt.Printf("Shortest path from 0 to 5 is: %d edges\n", dist)
}
```

## Architectural Considerations

Using a slice as a queue via `queue = queue[1:]` leaks memory over time because the underlying array keeps a reference to the dequeued elements — the backing array never shrinks, and the garbage collector cannot reclaim slots that a live slice header still points into. For a BFS that processes millions of nodes, this can cause an out-of-memory error even though the logical queue length stays small.

A robust fix involves overwriting the pointers at the dequeued index to the zero value before slicing (so the GC can reclaim any referenced heap objects), or implementing a ring buffer that reuses a fixed backing array instead of continuously re-slicing:

```go
// Zero out the dequeued slot before advancing the slice window
current := queue[0]
queue[0] = nodeDist{} // release any references the old head held
queue = queue[1:]
```

For high-throughput systems, Go channels can be used to fan out BFS searches concurrently, where each worker explores a partition of the neighbors. However, synchronization overhead (e.g., using `sync.Mutex` on the `visited` map) often outweighs the benefits unless node processing (e.g., fetching a web page per node) is computationally expensive enough to hide that overhead.

## Key Takeaways

* BFS guarantees the shortest path in an **unweighted** graph in O(V + E) time; for weighted graphs use Dijkstra's algorithm instead.
* Pre-allocating the queue slice with `make([]T, 0, capacity)` avoids repeated reallocation during traversal.
* `queue = queue[1:]` alone is a memory leak on long-running BFS over large graphs — zero the dequeued slot or use a ring buffer.
* Concurrent BFS via goroutines and channels only pays off when per-node work is expensive; otherwise mutex contention on `visited` dominates.
