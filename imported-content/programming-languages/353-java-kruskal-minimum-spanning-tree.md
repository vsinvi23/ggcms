# Kruskal's MST in Java: Disjoint Set Union (Union-Find) for Network Cabling

## The Problem: Minimum Spanning Tree
When laying out fiber optic cables to connect a series of data centers, the goal is to ensure all data centers are connected to each other while minimizing the total miles of cable laid. This is mathematically defined as finding the Minimum Spanning Tree (MST) of an undirected, weighted graph. Kruskal's algorithm achieves this in $O(E \log E)$ time by greedily picking the smallest edges that do not form a cycle.

## Memory-Level Internals of Kruskal's and DSU
The core engine of Kruskal's algorithm is the Disjoint Set Union (DSU) or Union-Find data structure. DSU tracks which components are currently connected.
Internally, DSU uses two parallel arrays: `parent` and `rank`. 
- **Path Compression**: During a `find` operation, the structure flattens the tree by pointing every traversed node directly to the root, effectively ensuring $O(1)$ amortized lookup time. 
- **Union by Rank**: Ensures the shorter tree is always attached beneath the taller tree, keeping the in-memory pointer chains extremely shallow.
Because DSU relies on pure array indexing, it operates entirely within the CPU's L1 cache, making cycle detection blazingly fast compared to DFS-based checks.

## Robust Java Implementation

The implementation below sorts edges utilizing Java's `Comparable` interface and seamlessly integrates DSU to build the MST.

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
        edges.add(new Edge(1, 0, 4));
        edges.add(new Edge(2, 0, 4));
        edges.add(new Edge(2, 3, 3));
        edges.add(new Edge(2, 5, 2));
        edges.add(new Edge(2, 4, 4));
        edges.add(new Edge(3, 2, 3));
        edges.add(new Edge(3, 4, 3));
        edges.add(new Edge(4, 2, 4));
        edges.add(new Edge(4, 3, 3));
        edges.add(new Edge(5, 2, 2));
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

## Architectural Considerations
In Java, utilizing `Collections.sort` on a `List<Edge>` invokes TimSort, which guarantees $O(E \log E)$ and provides stability. However, object overhead is significant; sorting an array of 10 million objects causes massive GC pauses. High-performance enterprise code frequently packs all edge data into a single primitive array (`long[] edges` where the upper 32 bits store weight and lower 32 bits store packed src/dest IDs) and uses `Arrays.sort()` on the primitive array. This mitigates object allocation limits and keeps execution tight.
