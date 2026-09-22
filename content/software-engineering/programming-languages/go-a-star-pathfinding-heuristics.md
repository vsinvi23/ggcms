---
title: "A* Pathfinding in Go: Heuristics and Priority Queues"
description: "Implementing A* pathfinding on a 2D grid in Go using container/heap and the Manhattan distance heuristic, plus the array-vs-map optimization that matters for high-tick-rate game loops."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "go"
  - "algorithms"
  - "pathfinding"
  - "a-star"
  - "priority-queue"
  - "container-heap"
---

# A* Pathfinding in Go: Heuristics and Priority Queues

## The Problem: Directed Search in Game Grids

Dijkstra's algorithm searches equally in every direction, wasting CPU cycles exploring irrelevant paths. In game development (NPC navigation) or robotic pathing on a 2D grid, we already know the target's coordinates. A* pathfinding uses a heuristic function to "pull" the search toward the destination, dramatically shrinking the search space compared to Dijkstra.

## The Cost Function and the Heuristic

A* orders its search using $f(n) = g(n) + h(n)$, where $g(n)$ is the exact cost from the start to node $n$, and $h(n)$ is the *estimated* cost from $n$ to the target. In Go, this ordering is implemented with a priority queue built on the `container/heap` package, keyed on each node's $f$-score.

For NPCs restricted to 2D grids without diagonal movement, the **Manhattan distance** ($|x_1 - x_2| + |y_1 - y_2|$) is an admissible heuristic (it never overestimates the true cost) and consistent (it never decreases along a path), both properties A* requires to guarantee an optimal path. Memory management is tightly coupled to this: managing pointers to grid cells and avoiding large per-cell struct allocations materially affects GC latency during high-tick-rate game loops.

---

## Robust Go Implementation

This implements A* on a 2D grid using a min-heap, reconstructing the path via a `cameFrom` map.

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
	pt     Point
	gScore int // Cost from start
	fScore int // gScore + heuristic
	index  int // Index in heap
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

The algorithm never explores every cell in the grid — the heuristic biases `heap.Pop` toward nodes closer to `target`, so cells in the opposite direction of the goal are rarely, if ever, popped.

---

## Architectural Considerations: Maps vs. Flat Arrays

Using `map[Point]int` for `gScores` and `cameFrom` is convenient but generates real hashing overhead and pointer-chasing on every access. For a known bounded grid (say $100 \times 100$), replacing the maps with flat `[]int` slices indexed via `y*width + x` eliminates hashing entirely, improves spatial locality (the whole score array can live in a few cache lines), and — critically — produces zero runtime allocations after initialization. That last property is what makes this optimization mandatory for game engines computing paths for hundreds of entities per frame: allocation-per-lookup at 60 ticks/second across hundreds of NPCs is enough sustained GC pressure to cause visible frame-time spikes.
