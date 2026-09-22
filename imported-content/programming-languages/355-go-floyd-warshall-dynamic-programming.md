# Floyd-Warshall in Go: $O(V^3)$ All-Pairs Shortest Path using Dynamic Programming

## The Problem: All-Pairs Shortest Path
When building routing tables for transit networks or solving complex network topology problems, we often need the shortest path between *all possible pairs* of nodes simultaneously, not just from a single source. The Floyd-Warshall algorithm tackles this using Dynamic Programming. While its $O(V^3)$ time complexity restricts it to smaller graphs ($V \le 1000$), its elegance, brevity, and ability to handle negative weights make it an essential tool.

## Memory-Level Internals of Floyd-Warshall
Floyd-Warshall operates directly on an Adjacency Matrix instead of an adjacency list. A 2D slice `dist[V][V]` tracks the shortest known distance between any two nodes. 
The algorithm uses three nested loops:
- `k`: The intermediate (transit) node.
- `i`: The source node.
- `j`: The destination node.

In Go, a 2D slice `[][]int` is implemented as a slice of slice headers, meaning rows can be scattered across the heap, leading to cache fragmentation. For tight nested loops, performance degrades due to repeated pointer dereferencing and poor spatial locality compared to languages with true 2D contiguous arrays (like C or Fortran).

## Robust Go Implementation

To mitigate Go's scattered 2D slices, we implement the graph using a 1D slice `[]int` indexed via `i*V + j`. This guarantees contiguous memory layout, heavily optimizing the innermost loop through CPU caching.

```go
package main

import (
	"fmt"
	"math"
)

const INF = math.MaxInt32 / 2 // Divide by 2 to prevent integer overflow during addition

// DenseGraph uses a flat 1D slice for 2D matrix operations
type DenseGraph struct {
	vertices int
	dist     []int
}

func NewDenseGraph(v int) *DenseGraph {
	g := &DenseGraph{
		vertices: v,
		dist:     make([]int, v*v),
	}
	// Initialize distances to infinity, except self-loops to 0
	for i := 0; i < v; i++ {
		for j := 0; j < v; j++ {
			if i == j {
				g.dist[i*v+j] = 0
			} else {
				g.dist[i*v+j] = INF
			}
		}
	}
	return g
}

func (g *DenseGraph) AddEdge(u, v, weight int) {
	g.dist[u*g.vertices+v] = weight
}

// FloydWarshall computes all-pairs shortest paths in-place
func (g *DenseGraph) FloydWarshall() {
	v := g.vertices
	// k: Intermediate node
	for k := 0; k < v; k++ {
		// i: Source node
		for i := 0; i < v; i++ {
			// Pre-compute the distance from i to k to avoid doing it inside the j-loop
			distIK := g.dist[i*v+k]
			if distIK == INF {
				continue // Optimization: if i -> k is unreachable, skip inner loop
			}
			
			// j: Destination node
			for j := 0; j < v; j++ {
				distKJ := g.dist[k*v+j]
				if distKJ != INF {
					newDist := distIK + distKJ
					if newDist < g.dist[i*v+j] {
						g.dist[i*v+j] = newDist
					}
				}
			}
		}
	}
}

func (g *DenseGraph) GetDistance(u, v int) int {
	return g.dist[u*g.vertices+v]
}

func main() {
	graph := NewDenseGraph(4)
	graph.AddEdge(0, 1, 5)
	graph.AddEdge(0, 3, 10)
	graph.AddEdge(1, 2, 3)
	graph.AddEdge(2, 3, 1)

	// Run algorithm
	graph.FloydWarshall()

	fmt.Println("Shortest path from 0 to 3:", graph.GetDistance(0, 3)) // Should be 5 + 3 + 1 = 9
	fmt.Println("Shortest path from 1 to 3:", graph.GetDistance(1, 3)) // Should be 3 + 1 = 4
}
```

## Architectural Considerations
The transition from `[][]int` to a flat `[]int` provides a measurable $20\%-40\%$ speedup in Go for large $V$. Because Floyd-Warshall iterates predictably over memory, modern CPUs easily engage hardware prefetchers to load the `k*v+j` row into the L1 cache before the loop requests it. To push performance further, loop unrolling or breaking the matrix into smaller cache-sized blocks (Cache Blocking/Tiling) allows the $O(V^3)$ operations to fit entirely inside L1/L2 cache, maximizing throughput.
