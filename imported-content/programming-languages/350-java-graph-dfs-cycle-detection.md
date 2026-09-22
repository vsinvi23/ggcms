# Graph DFS in Java: Recursion, Call Stacks, and Topological Sorting

## The Problem: Dependency Resolution and Cycle Detection
In build systems (like Maven or Gradle) and task schedulers, tasks are modeled as directed acyclic graphs (DAGs). Before execution, we must ensure there are no circular dependencies and generate a valid execution order. Depth-First Search (DFS) provides an elegant $O(V + E)$ solution for cycle detection and Topological Sorting.

## Memory-Level Internals of DFS
DFS explores as deeply as possible along a branch before backtracking. In Java, this is naturally implemented using recursion. Every recursive call pushes a new frame onto the JVM's call stack, storing local variables and return addresses. 

The primary memory constraint of recursive DFS is the `StackOverflowError`. If a graph has a continuous path of 10,000 nodes, the call stack will grow to 10,000 frames. For deep graphs, an explicit `Stack<Integer>` mapped on the heap is necessary. 
Cycle detection requires three distinct states for each node to track the recursion stack accurately:
- `UNVISITED` (0): Never seen.
- `VISITING` (1): Currently on the active recursion stack (if we see this again, we have a cycle).
- `VISITED` (2): Fully processed and all descendants explored.

## Robust Java Implementation

This implementation strictly detects cycles and computes a topological sort using a `Deque` to achieve $O(1)$ head insertions.

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

## Architectural Considerations
Java's object overhead means `List<List<Integer>>` requires an object header, array pointer, and integer wrapper (`Integer`) overhead per edge. For massive graphs, mapping nodes to contiguous integer IDs and using flat primitive arrays (e.g., `head`, `next`, `to` arrays in a compressed sparse row format) drastically reduces L1/L2 cache misses and eliminates boxing overhead. Top-tier enterprise systems processing dependency graphs utilize this primitive approach for order-of-magnitude speedups.
