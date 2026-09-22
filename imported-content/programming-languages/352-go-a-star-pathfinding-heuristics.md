# A* Pathfinding in Go: Heuristics and Manhattan Distance for AI Navigation

## The Problem: Directed Search in Game Grids
Dijkstra's algorithm searches equally in all directions, wasting CPU cycles exploring irrelevant paths. In game development (like NPC navigation) or robotic pathing on a 2D grid, we know the spatial coordinates of our target. A* Pathfinding optimizes this by using a heuristic function to "pull" the search toward the destination, reducing the search space dramatically.

## Memory-Level Internals of A*
A* uses the function $f(n) = g(n) + h(n)$, where $g(n)$ is the exact cost from the start to node $n$, and $h(n)$ is the estimated heuristic cost from $n$ to the target.
In Go, we implement this using a Priority Queue leveraging the `container/heap` package. The heap must order nodes by their $f$-score.
Because NPCs operate on 2D grids restricting diagonal movement, the Manhattan Distance ($|x_1 - x_2| + |y_1 - y_2|$) provides an admissible (never overestimates) and consistent heuristic. Memory management in Go is highly tied to the heap; managing pointers to grid cells and avoiding massive struct allocations per cell drastically improves GC latency during high-tick-rate game loops.

## Robust Go Implementation

This implements A* on a 2D grid using a min-heap, resolving paths using a `cameFrom` map.

```go
package main

import (
	"container/heap"
	"fmt"
	"math"
)

// Point represents 2D coordinates
type Point struct{ X, Y int }

// node represents a grid cell in the Priority Queue
type node struct {
	pt       Point
	gScore   int // Cost from start
	fScore   int // gScore + heuristic
	index    int // Index in heap
}

// PriorityQueue implements heap.Interface
type PriorityQueue []*node

func (pq PriorityQueue) Len() int           { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].fScore < pq[j].fScore }
func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *PriorityQueue) Push(x interface{}) {
	n := x.(*node)
	n.index = len(*pq)
	*pq = append(*pq, n)
}
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

// Manhattan Distance heuristic
func heuristic(a, b Point) int {
	return int(math.Abs(float64(a.X-b.X)) + math.Abs(float64(a.Y-b.Y)))
}

// AStar computes the shortest path on a grid (0 = open, 1 = wall)
func AStar(grid [][]int, start, target Point) []Point {
	rows, cols := len(grid), len(grid[0])
	
	pq := make(PriorityQueue, 0)
	heap.Init(&pq)

	gScores := make(map[Point]int)
	gScores[start] = 0

	startNode := &node{pt: start, gScore: 0, fScore: heuristic(start, target)}
	heap.Push(&pq, startNode)

	cameFrom := make(map[Point]Point)
	dirs := []Point{{0, 1}, {1, 0}, {0, -1}, {-1, 0}}

	for pq.Len() > 0 {
		current := heap.Pop(&pq).(*node)

		if current.pt == target {
			// Reconstruct path
			path := []Point{current.pt}
			for p := current.pt; p != start; {
				p = cameFrom[p]
				path = append([]Point{p}, path...) // Prepend
			}
			return path
		}

		for _, d := range dirs {
			neighbor := Point{current.pt.X + d.X, current.pt.Y + d.Y}

			// Bounds check and obstacle check
			if neighbor.X >= 0 && neighbor.X < rows && neighbor.Y >= 0 && neighbor.Y < cols && grid[neighbor.X][neighbor.Y] == 0 {
				tentativeG := gScores[current.pt] + 1
				
				currG, exists := gScores[neighbor]
				if !exists || tentativeG < currG {
					cameFrom[neighbor] = current.pt
					gScores[neighbor] = tentativeG
					f := tentativeG + heuristic(neighbor, target)
					heap.Push(&pq, &node{pt: neighbor, gScore: tentativeG, fScore: f})
				}
			}
		}
	}
	return nil // No path
}

func main() {
	grid := [][]int{
		{0, 0, 0, 0, 0},
		{0, 1, 1, 1, 0},
		{0, 0, 0, 1, 0},
		{1, 1, 0, 0, 0},
		{0, 0, 0, 0, 0},
	}
	start, target := Point{0, 0}, Point{4, 4}
	path := AStar(grid, start, target)
	
	fmt.Println("Path found:", path)
}
```

## Architectural Considerations
Using a `map[Point]int` for tracking `gScores` and `cameFrom` is convenient but generates significant hashing overhead and pointer chasing. For a known bounded grid (e.g., $100 \times 100$), replacing the maps with flat 1D arrays `[]int` (indexed via `y * width + x`) eliminates hashing, improves spatial locality, and ensures zero runtime allocations post-initialization. This optimization is mandatory for game engines running paths for hundreds of entities per frame.
