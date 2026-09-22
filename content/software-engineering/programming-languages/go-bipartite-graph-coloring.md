---
title: "Bipartite Graph Coloring in Go: BFS-Based 2-Coloring for Conflict Resolution"
description: "Detecting whether a graph is bipartite and computing its 2-coloring with BFS in Go, applied to radio-frequency assignment - handling disconnected components and the queue-based memory tradeoffs for long-running services."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "graph-algorithms"
  - "bipartite-graph"
  - "bfs"
  - "algorithms"
---

# Bipartite Graph Coloring in Go: BFS-Based 2-Coloring for Conflict Resolution

## The Problem: Conflict Resolution and 2-Coloring

In telecommunications, if two adjacent radio towers use the same frequency, they interfere. If a network of towers can be assigned exactly two frequencies such that no two adjacent towers share one, the underlying conflict graph is mathematically **bipartite**. Determining whether a graph is bipartite — and computing the actual 2-coloring — can be done in $O(V + E)$ time with breadth-first search (BFS).

## Memory-Level Internals of Bipartite Coloring

A bipartite graph is characterized by having no odd-length cycles. The algorithm maps colors (0/1, or "red"/"blue") into an array `colors[]`. During a standard BFS traversal, every time we step from a node to a neighbor, we assign that neighbor the *opposite* color. If we ever reach an already-visited neighbor that shares the *same* color as the current node, an odd cycle exists and the graph is not bipartite.

In Go, initializing `colors[]` to `-1` lets one contiguous `[]int` slice track both "visited" state and the assigned frequency simultaneously — no separate boolean array needed.

---

## Robust Go Implementation

This handles disconnected components gracefully — essential for independent radio-tower clusters that never interact with each other.

```go
package main

import (
	"fmt"
)

// Graph models an undirected network of radio towers
type Graph struct {
	Vertices int
	Edges    map[int][]int
}

func NewGraph(v int) *Graph {
	return &Graph{
		Vertices: v,
		Edges:    make(map[int][]int),
	}
}

func (g *Graph) AddEdge(u, v int) {
	g.Edges[u] = append(g.Edges[u], v)
	g.Edges[v] = append(g.Edges[v], u) // Undirected
}

// IsBipartite attempts to 2-color the graph.
// Returns true and the color array if successful, else false.
func (g *Graph) IsBipartite() (bool, []int) {
	// colors: -1 means uncolored, 0 and 1 are the two frequencies
	colors := make([]int, g.Vertices)
	for i := range colors {
		colors[i] = -1
	}

	// Queue for BFS
	queue := make([]int, 0, g.Vertices)

	// Loop over all vertices to handle disconnected graph components
	for i := 0; i < g.Vertices; i++ {
		if colors[i] == -1 {
			// Start BFS for this component
			colors[i] = 0
			queue = append(queue, i)

			for len(queue) > 0 {
				curr := queue[0]
				queue = queue[1:] // Dequeue

				for _, neighbor := range g.Edges[curr] {
					if colors[neighbor] == -1 {
						// Assign opposite color
						colors[neighbor] = 1 - colors[curr]
						queue = append(queue, neighbor)
					} else if colors[neighbor] == colors[curr] {
						// Conflict detected!
						return false, nil
					}
				}
			}
		}
	}

	return true, colors
}

func main() {
	network := NewGraph(4)
	network.AddEdge(0, 1)
	network.AddEdge(1, 2)
	network.AddEdge(2, 3)
	network.AddEdge(3, 0)
	// Currently a square (even cycle): Bipartite.
	// If we add (0, 2), it forms a triangle (odd cycle) and fails.

	isBipartite, colors := network.IsBipartite()

	if isBipartite {
		fmt.Println("Network is Bipartite. Frequency assignments:")
		for tower, freq := range colors {
			fmt.Printf("Tower %d -> Freq %d\n", tower, freq)
		}
	} else {
		fmt.Println("Network is NOT Bipartite. More frequencies required.")
	}
}
```

The outer `for i := 0; i < g.Vertices; i++` loop is what makes this correct for disconnected graphs: a single BFS from vertex 0 would never visit an isolated cluster of towers with no path back to it, so we restart BFS from any still-uncolored vertex until every vertex has been reached.

---

## Architectural Considerations

The slice-based queue idiom `queue = queue[1:]` used for BFS dequeuing can leak memory in long-running services: the underlying backing array still holds references to every popped element, so the array only shrinks from the "front" logically, not physically, and the garbage collector can't reclaim those slots until the whole backing array is dropped. For one-off scripts this is harmless. For a daemon continuously re-evaluating network topology, replace it with a ring-buffer queue (a fixed-size array plus head/tail indices) to guarantee a zero-allocation, bounded-memory steady state. Similarly, `map[int][]int` for the adjacency list is convenient but forces the garbage collector to scan every individual slice pointer in the map; for graphs whose vertex count and edges are known upfront, a flat adjacency structure (e.g. a CSR-style `[]int` offset array plus a single `[]int` edge array) avoids that scanning cost entirely.
