---
title: "Graph DFS in Java: Cycle Detection and Topological Sort for Build Systems"
description: "How build tools like Maven and Gradle detect circular dependencies and compute a valid execution order using three-state depth-first search, plus why deep recursive DFS can overflow the JVM call stack."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "depth-first-search"
  - "topological-sort"
  - "cycle-detection"
  - "graph-algorithms"
  - "data-structures"
---

# Graph DFS in Java: Cycle Detection and Topological Sort for Build Systems

## The Problem: Dependency Resolution and Cycle Detection

Build systems like Maven and Gradle model modules and their dependencies as a directed graph. Before running a build, the tool needs two guarantees: there are no circular dependencies (module A depends on B, which depends on A — an impossible build order), and there exists a valid linear execution order that respects every dependency edge.

Both problems are solved by the same traversal: **Depth-First Search (DFS)**, run in O(V + E) time.

## Memory-Level Internals of DFS

DFS explores as deep as possible along one branch before backtracking. In Java this is naturally implemented with recursion: every recursive call pushes a new frame onto the JVM's call stack, holding local variables and a return address.

That recursion is also DFS's main memory hazard. A graph with a continuous dependency chain of 10,000 modules produces a call stack 10,000 frames deep — deep enough to trigger a `StackOverflowError` on the JVM's default thread stack size (commonly 512KB–1MB). For graphs that can get that deep, an explicit `Deque`-backed stack on the heap replaces the recursive call stack.

Cycle detection needs three states per node, not just visited/unvisited, to correctly distinguish "already fully processed" from "currently on the active recursion path":

- `UNVISITED` (0) — never seen.
- `VISITING` (1) — currently on the active recursion stack; seeing this again means we found a cycle (a back edge).
- `VISITED` (2) — fully processed, along with every descendant.

```text
DFS recursion stack while processing node 5 -> 2 -> 3 -> 1:

  call stack (top to bottom):
  ┌───────────────┐
  │ visit(1)      │  state[1] = VISITING
  ├───────────────┤
  │ visit(3)      │  state[3] = VISITING
  ├───────────────┤
  │ visit(2)      │  state[2] = VISITING
  ├───────────────┤
  │ visit(5)      │  state[5] = VISITING
  └───────────────┘
  If visit(1) sees an edge back to node 5 (state == VISITING), that's a cycle.
```

---

## Robust Java Implementation

This implementation detects cycles and, if the graph is acyclic, computes a topological sort using a `Deque` for O(1) head insertion.

```java
import java.util.*;

public class DependencyGraph {
    private final int vertices;
    private final List<List<Integer>> adjList;

    // States for cycle detection
    private static final int UNVISITED = 0;
    private static final int VISITING = 1;
    private static final int VISITED = 2;

    public DependencyGraph(int vertices) {
        this.vertices = vertices;
        adjList = new ArrayList<>(vertices);
        for (int i = 0; i < vertices; i++) {
            adjList.add(new ArrayList<>());
        }
    }

    public void addDependency(int from, int to) {
        adjList.get(from).add(to);
    }

    /**
     * Returns a valid topological sort, or an empty list if a cycle is detected.
     */
    public List<Integer> topologicalSort() {
        int[] state = new int[vertices];
        Deque<Integer> order = new ArrayDeque<>();

        for (int i = 0; i < vertices; i++) {
            if (state[i] == UNVISITED) {
                if (hasCycleAndSort(i, state, order)) {
                    return Collections.emptyList(); // Cycle detected
                }
            }
        }

        return new ArrayList<>(order);
    }

    private boolean hasCycleAndSort(int node, int[] state, Deque<Integer> order) {
        state[node] = VISITING; // Mark as part of the current recursion stack

        for (int neighbor : adjList.get(node)) {
            if (state[neighbor] == VISITING) {
                return true; // Cycle found (back edge)
            }
            if (state[neighbor] == UNVISITED) {
                if (hasCycleAndSort(neighbor, state, order)) {
                    return true;
                }
            }
        }

        state[node] = VISITED; // Mark fully processed
        order.addFirst(node);  // Add to the front of the topological order
        return false;
    }

    public static void main(String[] args) {
        DependencyGraph buildSystem = new DependencyGraph(6);
        buildSystem.addDependency(5, 2);
        buildSystem.addDependency(5, 0);
        buildSystem.addDependency(4, 0);
        buildSystem.addDependency(4, 1);
        buildSystem.addDependency(2, 3);
        buildSystem.addDependency(3, 1);

        List<Integer> buildOrder = buildSystem.topologicalSort();
        if (buildOrder.isEmpty()) {
            System.out.println("Circular dependency detected!");
        } else {
            System.out.println("Valid Build Order: " + buildOrder);
        }
    }
}
```

`order.addFirst(node)` is the key trick: a node is only pushed to the front of the result *after* every one of its dependencies has already been fully processed (`VISITED`), so the final deque naturally comes out in dependency-respecting order without a separate reversal step.

---

## Architectural Considerations

Java's object overhead adds up in graph-heavy workloads: `List<List<Integer>>` pays for an object header, an array pointer, and a boxed `Integer` wrapper per stored edge. For very large graphs, mapping nodes to contiguous integer IDs and using flat primitive arrays — a compressed-sparse-row-style `head[]`/`next[]`/`to[]` adjacency representation — drastically reduces L1/L2 cache misses and eliminates autoboxing overhead entirely. Systems processing large dependency graphs at scale (large monorepo build graphs, dependency resolvers) typically move to this primitive representation once graph size becomes a bottleneck.

---

## Key Takeaways

- **Three-state marking (unvisited/visiting/visited) is what makes cycle detection correct** — a simple boolean visited flag cannot distinguish "on the current path" from "already fully explored".
- **A back edge to a `VISITING` node is exactly what a cycle looks like** in a DFS traversal.
- **Deep recursive DFS risks `StackOverflowError`** on very long dependency chains; an explicit heap-backed stack removes that limit.
- **Topological order falls out of DFS post-order**, added to the front of the result as each node finishes.
