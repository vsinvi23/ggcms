# Eulerian Paths in C++: Hierholzer's Algorithm for DNA Sequencing and Circuits

## The Problem: Visiting Every Edge Exactly Once
While the Hamiltonian Path problem (visiting every *node* exactly once) is NP-Complete, the Eulerian Path problem (visiting every *edge* exactly once) is beautifully solvable in $O(E)$ time. Eulerian paths are the mathematical foundation behind DNA genome assembly (De Bruijn graphs) and CMOS VLSI circuit design layout. Hierholzer's Algorithm elegantly reconstructs these paths using a stack-based traversal.

## Memory-Level Internals of Hierholzer's Algorithm
Hierholzer's relies on the property that if you continuously follow unvisited edges, you will eventually get stuck. In a valid Eulerian graph, getting stuck means you have completed a cycle.
The algorithm maintains two structures:
1. `curr_path` stack: Tracks the active exploration.
2. `circuit` vector: Stores the finalized path.

Whenever a node has no remaining outgoing edges, it is popped from the `curr_path` and prepended to the `circuit`. In C++, `std::vector` naturally models both the stack (`push_back`, `pop_back`) and the finalized path. The graph itself must dynamically track remaining edges, usually by popping from a `std::vector` of neighbors, which is highly efficient.

## Robust C++ Implementation

This implementation focuses on Directed Eulerian Paths. It assumes the graph has already been validated (i.e., exactly one start node with `out == in + 1`, and one end node with `in == out + 1`).

```cpp
#include <iostream>
#include <vector>
#include <unordered_map>
#include <algorithm>

using namespace std;

class EulerianGraph {
private:
    unordered_map<int, vector<int>> adjList;

public:
    void addEdge(int u, int v) {
        adjList[u].push_back(v);
    }

    vector<int> findEulerianPath(int startNode) {
        vector<int> path;
        vector<int> stack;
        
        stack.push_back(startNode);

        while (!stack.empty()) {
            int curr = stack.back();

            // If current node has remaining outgoing edges
            if (adjList.count(curr) && !adjList[curr].empty()) {
                // Get the next destination and remove the edge
                int next = adjList[curr].back();
                adjList[curr].pop_back(); 
                
                stack.push_back(next);
            } else {
                // Backtrack: no more edges leaving this node
                path.push_back(curr);
                stack.pop_back();
            }
        }

        // The path is generated in reverse order
        reverse(path.begin(), path.end());
        return path;
    }
};

int main() {
    EulerianGraph graph;
    
    // Eulerian Path mapping (e.g. De Bruijn graph fragments)
    graph.addEdge(0, 1);
    graph.addEdge(1, 2);
    graph.addEdge(2, 1);
    graph.addEdge(1, 3);

    // Node 0 has Out=1, In=0 (Start)
    // Node 3 has In=1, Out=0 (End)
    vector<int> path = graph.findEulerianPath(0);

    cout << "Eulerian Path: ";
    for (int i = 0; i < path.size(); i++) {
        cout << path[i] << (i == path.size() - 1 ? "" : " -> ");
    }
    cout << endl;

    return 0;
}
```

## Architectural Considerations
In C++, utilizing `adjList[curr].pop_back()` is an $O(1)$ operation that avoids the cost of shifting elements (which would happen if we erased from the front). However, if the graph must be reused, destructively popping edges requires cloning the adjacency list first, doubling memory consumption. 
For DNA sequencing involving billions of K-mers, `unordered_map` generates massive heap fragmentation due to linked-list bucket chaining. Replacing the map with a flat vector-based index and using a contiguous array to store the "next available edge index" per node guarantees sequential memory access and cuts execution time by orders of magnitude.
