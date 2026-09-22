# Tries (Prefix Trees) in Java: Building a Sub-Millisecond Autocomplete Engine

## The Problem: The Prefix Penalty
Searching for words starting with a specific prefix (e.g., autocomplete for "algo") in an array or a Hash Map requires scanning every string. In an ordered Binary Search Tree, range queries are possible, but string comparisons ($O(L)$ where $L$ is string length) multiplied by $O(\log N)$ tree depth becomes computationally heavy. We need lookups bound strictly by $O(L)$, completely independent of the dataset size $N$.

## Memory-Level Internals: The Space/Time Tradeoff
The Trie (Prefix Tree) stores characters in nodes. A path from the root to a node represents a prefix. Because each node can have multiple children (one for each possible character), Tries are inherently memory-heavy.

In Java, representing children as an array of 26 pointers (for a-z) yields blindingly fast $O(1)$ child lookups at the cost of sparse memory allocation. Alternatively, a `HashMap<Character, TrieNode>` saves space but introduces autoboxing and hashing overhead. For raw speed in search engines, the array approach wins.

```java
class TrieNode {
    // 26 letters in English alphabet
    TrieNode[] children = new TrieNode[26];
    boolean isEndOfWord;
    
    // Optional payload
    int frequencyScore; 
}
```
An empty node consumes around $26 \times 8 = 208$ bytes just for the array of references on a 64-bit JVM.

## Implementation: Insertion and Prefix Matching
Inserting involves stepping through the characters, mapping them to indices `[0-25]`, and instantiating nodes where they don't exist.

```java
public class Trie {
    private final TrieNode root = new TrieNode();

    public void insert(String word) {
        TrieNode current = root;
        for (char c : word.toCharArray()) {
            int index = c - 'a';
            if (current.children[index] == null) {
                current.children[index] = new TrieNode();
            }
            current = current.children[index];
        }
        current.isEndOfWord = true;
    }

    public boolean searchPrefix(String prefix) {
        TrieNode current = root;
        for (char c : prefix.toCharArray()) {
            int index = c - 'a';
            if (current.children[index] == null) {
                return false;
            }
            current = current.children[index];
        }
        return true;
    }
}
```

## Scaling for Autocomplete
To build a true autocomplete engine, we must retrieve *all* words branching from the matched prefix node. We augment the `searchPrefix` method to return the terminal `TrieNode`. From there, a Depth-First Search (DFS) collects all paths ending in `isEndOfWord = true`. For high-traffic typeahead systems, we cache the top $k$ results (highest `frequencyScore`) directly in the prefix nodes during insertion, turning sub-millisecond autocomplete retrieval into an $O(L)$ constant-time extraction.
