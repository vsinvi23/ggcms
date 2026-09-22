# Tarjan's SCC in Java: Identifying Clusters in Social Network Graphs

## The Problem: Strongly Connected Components
In a directed graph like Twitter (where A follows B, but B might not follow A), a Strongly Connected Component (SCC) is a maximal subset of vertices where every vertex is reachable from every other vertex in the subset. SCCs represent tight-knit communities or cyclic dependencies. Tarjan's algorithm finds all SCCs in a single DFS pass, achieving $O(V + E)$ time complexity.

## Memory-Level Internals of Tarjan's Algorithm
Tarjan's algorithm uses a DFS recursion stack along with an explicit `Stack` data structure to track the current path of connected nodes. 
It assigns two integer properties to each node:
1. `discoveryTime`: An auto-incrementing integer assigned when the node is first visited.
2. `lowLink`: The lowest `discoveryTime` reachable from the node (including via back-edges).

When a node completes its DFS and its `discoveryTime == lowLink`, it indicates that the node is the "root" of an SCC. At this point, the algorithm pops nodes off the explicit stack until the root is removed, forming the isolated component.
In Java, maintaining these parallel arrays (`discoveryTime`, `lowLink`, `onStack`) drastically outperforms mapping these properties to a Node object, avoiding massive heap pollution.

## Robust Java Implementation

This Java implementation leverages parallel arrays to keep the heap clean and the garbage collector unburdened.

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

## Architectural Considerations
Recursive DFS is clean but risks `StackOverflowError` for massive social networks. Production-grade Tarjan implementations must simulate the call stack manually using an explicit `Deque` for traversal state. Furthermore, using `boolean[] onStack` yields a cache-friendly state check. In ultra-large graphs (billions of nodes), parallel algorithms based on Forward-Backward BFS (like the Multi-Step algorithm) often replace Tarjan's because standard DFS is notoriously difficult to parallelize across multi-core CPUs.
