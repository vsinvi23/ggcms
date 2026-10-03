---
title: "Kruskal's Minimum Spanning Tree in Java: Union-Find for Network Cabling"
description: "Build Kruskal's MST algorithm in Java using a Disjoint Set Union (Union-Find) structure with path compression and union by rank, and learn the primitive-array trick used in production to avoid GC pauses at scale."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "java"
  - "algorithms"
  - "minimum-spanning-tree"
  - "union-find"
  - "disjoint-set-union"
  - "graph-theory"
---

# Kruskal's Minimum Spanning Tree in Java: Union-Find for Network Cabling

## The Problem: Minimum Spanning Tree

When laying out fiber optic cables to connect a series of data centers, the goal is to ensure all data centers are connected to each other while minimizing the total miles of cable laid. This is mathematically defined as finding the **Minimum Spanning Tree (MST)** of an undirected, weighted graph. Kruskal's algorithm achieves this in O(E log E) time by greedily picking the smallest edges that do not form a cycle.

The greedy insight is simple: sort every candidate edge by weight, then walk the sorted list adding an edge to the tree only if it connects two components that aren't already connected. The hard part is answering "are these two nodes already connected?" fast, thousands of times, without re-running a traversal from scratch each time.

## Memory-Level Internals of Kruskal's and DSU

The core engine of Kruskal's algorithm is the **Disjoint Set Union (DSU)**, also known as Union-Find. DSU tracks which components are currently connected.

Internally, DSU uses two parallel arrays: `parent` and `rank`.

- **Path Compression**: During a `find` operation, the structure flattens the tree by pointing every traversed node directly to the root, effectively ensuring O(1) amortized lookup time.
- **Union by Rank**: Ensures the shorter tree is always attached beneath the taller tree, keeping the in-memory pointer chains extremely shallow.

Because DSU relies on pure array indexing, it operates entirely within the CPU's L1 cache, making cycle detection blazingly fast compared to DFS-based checks.

```text
Before union(1, 5):                After union(1, 5) [union by rank]:

parent: [0,1,2,3,4,5]              parent: [0,1,2,3,4,1]
rank:   [0,0,0,0,0,0]              rank:   [0,1,0,0,0,0]

  0  1  2  3  4  5                   0  1  2  3  4
                                          |
                                          5   <- attached under 1
```

## Robust Java Implementation

The implementation below sorts edges using Java's `Comparable` interface and integrates DSU to build the MST.

```java
import java.util.*;

// Represents an edge in the graph
class Edge implements Comparable<Edge> {
    int src, dest, weight;

    public Edge(int src, int dest, int weight) {
        this.src = src;
        this.dest = dest;
        this.weight = weight;
    }

    @Override
    public int compareTo(Edge other) {
        return Integer.compare(this.weight, other.weight);
    }
}

// Disjoint Set Union (Union-Find) class
class DSU {
    private int[] parent;
    private int[] rank;

    public DSU(int n) {
        parent = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) {
            parent[i] = i; // Every node is its own parent initially
            rank[i] = 0;
        }
    }

    // Find with Path Compression
    public int find(int i) {
        if (parent[i] == i) {
            return i;
        }
        // Compress path up to the root
        return parent[i] = find(parent[i]);
    }

    // Union by Rank
    public boolean union(int i, int j) {
        int rootI = find(i);
        int rootJ = find(j);

        if (rootI != rootJ) {
            if (rank[rootI] < rank[rootJ]) {
                parent[rootI] = rootJ;
            } else if (rank[rootI] > rank[rootJ]) {
                parent[rootJ] = rootI;
            } else {
                parent[rootJ] = rootI;
                rank[rootI]++;
            }
            return true;
        }
        return false; // They are already in the same set (cycle)
    }
}

public class KruskalAlgorithm {
    public static void main(String[] args) {
        int vertices = 6;
        List<Edge> edges = new ArrayList<>();

        edges.add(new Edge(0, 1, 4));
        edges.add(new Edge(0, 2, 4));
        edges.add(new Edge(1, 2, 2));
        edges.add(new Edge(2, 3, 3));
        edges.add(new Edge(2, 5, 2));
        edges.add(new Edge(2, 4, 4));
        edges.add(new Edge(3, 4, 3));
        edges.add(new Edge(5, 4, 3));

        // Step 1: Sort all edges in non-decreasing order of weight
        Collections.sort(edges);

        DSU dsu = new DSU(vertices);
        List<Edge> mst = new ArrayList<>();
        int minCost = 0;

        // Step 2: Iterate through sorted edges
        for (Edge edge : edges) {
            // Step 3: If union is successful, no cycle is formed
            if (dsu.union(edge.src, edge.dest)) {
                mst.add(edge);
                minCost += edge.weight;

                // Stop early if MST is complete
                if (mst.size() == vertices - 1) break;
            }
        }

        System.out.println("Edges in Minimum Spanning Tree:");
        for (Edge e : mst) {
            System.out.println(e.src + " -- " + e.dest + " == " + e.weight);
        }
        System.out.println("Total Cost: " + minCost);
    }
}
```

Walking through the loop: once `mst.size() == vertices - 1`, every vertex is connected by exactly the minimum number of edges required for a spanning tree, so the loop breaks early rather than scanning the remaining (higher-weight) edges.

## Architectural Considerations

In Java, calling `Collections.sort` on a `List<Edge>` invokes TimSort, which guarantees O(E log E) and provides stability. However, object overhead is significant; sorting an array of 10 million `Edge` objects causes noticeable GC pauses because every edge is a separate heap-allocated object with pointer indirection.

High-performance production code frequently packs all edge data into a single primitive `long[]` array, where the upper 32 bits store the weight and the lower 32 bits store the packed source/destination IDs, then calls `Arrays.sort()` directly on the primitive array. This avoids per-edge object allocation entirely and lets the JVM sort a contiguous block of primitives, which is dramatically more cache-friendly than sorting an array of object references.

## Key Takeaways

- Kruskal's algorithm is a greedy MST algorithm: sort edges, then add each edge that doesn't create a cycle.
- Union-Find (DSU) with **path compression** and **union by rank** gives near-O(1) amortized cycle checks.
- For large graphs, prefer packing edges into primitive arrays over object lists to avoid GC pressure during sorting.
