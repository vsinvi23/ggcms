---
title: "Tarjan's Algorithm in Java: Finding Strongly Connected Components in One DFS Pass"
description: "Implement Tarjan's algorithm in Java to find strongly connected components in a directed graph — like tight-knit follower clusters in a social network — using discovery time, low-link values, and an explicit stack, all in a single O(V+E) traversal."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "java"
  - "algorithms"
  - "tarjan"
  - "strongly-connected-components"
  - "graph-theory"
  - "depth-first-search"
---

# Tarjan's Algorithm in Java: Finding Strongly Connected Components in One DFS Pass

## The Problem: Strongly Connected Components

In a directed graph like Twitter's follow graph (where A follows B, but B might not follow A), a **Strongly Connected Component (SCC)** is a maximal subset of vertices where every vertex is reachable from every other vertex in the subset. SCCs represent tight-knit communities or cyclic dependencies — a group of accounts that all mutually follow each other, forming a closed loop of reachability.

Tarjan's algorithm finds all SCCs in a single Depth-First Search (DFS) pass, achieving O(V + E) time complexity — no need for a second traversal like the alternative Kosaraju's algorithm requires.

## Memory-Level Internals of Tarjan's Algorithm

Tarjan's algorithm uses the DFS recursion stack along with an explicit `Stack` data structure to track the current path of connected nodes.

It assigns two integer properties to each node:

1. **`discoveryTime`** — an auto-incrementing integer assigned when the node is first visited.
2. **`lowLink`** — the lowest `discoveryTime` reachable from the node (including via back-edges to an ancestor already on the stack).

When a node completes its DFS and its `discoveryTime == lowLink`, that indicates the node is the "root" of an SCC — nothing deeper in the search could reach further back than this node itself. At this point, the algorithm pops nodes off the explicit stack until the root is removed, forming the isolated component.

In Java, maintaining these as parallel arrays (`discoveryTime`, `lowLink`, `onStack`) drastically outperforms mapping these properties onto a `Node` object, avoiding heap pollution from millions of small wrapper objects.

```text
Graph: 1 -> 0 -> 2 -> 1 (cycle), 0 -> 3 -> 4

DFS visits 1 -> 0 -> 2 -> back-edge to 1 (on stack!) -> lowLink[2] = discoveryTime[1]
                     -> 3 -> 4 (no back-edge, own SCC root)
                -> 3 (already visited via 0)

Result SCCs: {1, 0, 2}  and  {4}  and  {3}
```

## Robust Java Implementation

This implementation leverages parallel arrays to keep the heap clean and the garbage collector unburdened.

```java
import java.util.*;

public class TarjanSCC {
    private final int vertices;
    private final List<List<Integer>> adjList;

    // Parallel arrays for Tarjan's state
    private int[] discoveryTime;
    private int[] lowLink;
    private boolean[] onStack;
    private Deque<Integer> stack;
    private int timer;

    private List<List<Integer>> sccComponents;

    public TarjanSCC(int vertices) {
        this.vertices = vertices;
        adjList = new ArrayList<>(vertices);
        for (int i = 0; i < vertices; i++) {
            adjList.add(new ArrayList<>());
        }
    }

    public void addEdge(int from, int to) {
        adjList.get(from).add(to);
    }

    public List<List<Integer>> findSCCs() {
        discoveryTime = new int[vertices];
        lowLink = new int[vertices];
        onStack = new boolean[vertices];
        stack = new ArrayDeque<>();
        timer = 0;
        sccComponents = new ArrayList<>();

        Arrays.fill(discoveryTime, -1); // -1 indicates unvisited

        for (int i = 0; i < vertices; i++) {
            if (discoveryTime[i] == -1) {
                dfs(i);
            }
        }
        return sccComponents;
    }

    private void dfs(int u) {
        discoveryTime[u] = timer;
        lowLink[u] = timer;
        timer++;

        stack.push(u);
        onStack[u] = true;

        for (int v : adjList.get(u)) {
            if (discoveryTime[v] == -1) {
                // Node v is not visited yet
                dfs(v);
                lowLink[u] = Math.min(lowLink[u], lowLink[v]);
            } else if (onStack[v]) {
                // Node v is visited and on the stack (Back-Edge)
                lowLink[u] = Math.min(lowLink[u], discoveryTime[v]);
            }
        }

        // If u is a root node, pop the stack and form an SCC
        if (lowLink[u] == discoveryTime[u]) {
            List<Integer> component = new ArrayList<>();
            while (true) {
                int v = stack.pop();
                onStack[v] = false;
                component.add(v);
                if (v == u) break;
            }
            sccComponents.add(component);
        }
    }

    public static void main(String[] args) {
        TarjanSCC graph = new TarjanSCC(5);
        graph.addEdge(1, 0);
        graph.addEdge(0, 2);
        graph.addEdge(2, 1);
        graph.addEdge(0, 3);
        graph.addEdge(3, 4);

        List<List<Integer>> sccs = graph.findSCCs();

        System.out.println("Strongly Connected Components:");
        for (List<Integer> scc : sccs) {
            System.out.println(scc);
        }
    }
}
```

The `onStack` check in the `else if` branch is what distinguishes Tarjan's algorithm from a plain DFS: a visited node that is *not* currently on the stack belongs to an already-completed, different SCC, and must not lower `lowLink[u]` — only back-edges to ancestors still on the current path count.

## Architectural Considerations

Recursive DFS is clean but risks `StackOverflowError` for massive social networks with long follow-chains — each recursive call frame consumes stack space, and a graph with a million-node deep path will exhaust the default JVM stack. Production-grade Tarjan implementations must simulate the call stack manually using an explicit `Deque` for traversal state instead of relying on the JVM's own call stack.

Using `boolean[] onStack` (rather than a `HashSet<Integer>`) also yields a cache-friendly, branch-predictable state check — a real consideration when this check runs once per edge across billions of edges.

In ultra-large graphs (billions of nodes), parallel algorithms based on Forward-Backward BFS (like the Multi-Step algorithm) often replace Tarjan's, because standard DFS is notoriously difficult to parallelize across multi-core CPUs — the recursive, path-dependent nature of `lowLink` propagation resists decomposition into independent parallel units of work.

## Key Takeaways

- Tarjan's algorithm finds all SCCs in a single O(V+E) DFS pass using `discoveryTime` and `lowLink` values.
- A node is an SCC root exactly when `lowLink[node] == discoveryTime[node]`.
- The `onStack` check is essential — it distinguishes a genuine back-edge (still-open SCC) from a cross-edge into an already-finished SCC.
- For very deep or very large graphs, replace recursion with an explicit stack, and consider parallel BFS-based SCC algorithms instead of DFS-based Tarjan.
