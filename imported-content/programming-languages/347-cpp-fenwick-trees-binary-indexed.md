# Fenwick Trees (BIT) in C++: Bitwise Magic for Fast Cumulative Frequencies

## The Problem: The Segment Tree Overhead
While Segment Trees process range queries in $O(\log N)$, they require $4N$ memory and recursively branch down the tree, polluting the call stack. If the problem is strictly about cumulative frequencies (prefix sums) and point updates, Segment Trees are computationally heavy overkill. 

## Memory-Level Internals: 2's Complement
The Fenwick Tree, or Binary Indexed Tree (BIT), solves this using pure bitwise arithmetic. It operates directly on a 1-indexed array of size exactly $N+1$, halving the memory footprint compared to a Segment Tree and eliminating all recursion.

The underlying principle leverages two's complement binary representation. In C++, `x & -x` perfectly isolates the least significant set bit (LSB) of `x`. For example, `12` (binary `1100`) has an LSB of `4` (`0100`).

A node at index `i` in the BIT stores the sum of a specific range of elements. Specifically, it stores the sum of `i & -i` elements ending at index `i`.

```cpp
#include <vector>

class FenwickTree {
    std::vector<int> bit;
    int n;

public:
    FenwickTree(int size) {
        n = size;
        bit.assign(n + 1, 0); // 1-indexed
    }
    // ...
};
```

## The Update Operation ($O(\log N)$)
When an element at index `i` changes, we must update all BIT nodes that "cover" this index. We find the next covering node by repeatedly *adding* the LSB to `i`.

```cpp
void add(int i, int delta) {
    // Traverse up the implicit tree
    for (; i <= n; i += (i & -i)) {
        bit[i] += delta;
    }
}
```
A tight `for` loop with one array fetch and one bitwise operation easily outperforms the recursive branching of a Segment Tree.

## The Query Operation ($O(\log N)$)
To find the prefix sum up to index `i`, we repeatedly *subtract* the LSB, jumping backwards through the disjoint ranges that make up the prefix.

```cpp
int query(int i) {
    int sum = 0;
    // Traverse down the implicit tree
    for (; i > 0; i -= (i & -i)) {
        sum += bit[i];
    }
    return sum;
}

// Range sum [L, R] is simply query(R) - query(L - 1)
int queryRange(int l, int r) {
    return query(r) - query(l - 1);
}
```
Fenwick Trees represent the pinnacle of algorithmic elegance: substituting structural graph overhead with the raw, intrinsic bitwise logic of the ALUs.
