---
title: "Building an Autocomplete Engine with a Trie (Prefix Tree) in Java"
description: "Implement a Trie in Java to power sub-millisecond autocomplete, understand the O(L) versus O(N) trade-off it solves, compare array-indexed children against a HashMap-backed Trie, and see how to extend it to ranked suggestions."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "trie"
  - "prefix-tree"
  - "autocomplete"
  - "data-structures"
  - "algorithms"
---

# Building an Autocomplete Engine with a Trie (Prefix Tree) in Java

## The Problem: The Prefix Penalty

Searching for words starting with a specific prefix — autocomplete for "algo" as the user types, for example — in an array or a `HashMap` requires scanning every string to check if it starts with the prefix. In an ordered Binary Search Tree, range queries are possible, but string comparisons (O(L), where L is string length) multiplied by O(log N) tree depth becomes computationally heavy at scale.

What we actually want is a lookup bound strictly by O(L) — the length of the typed prefix — completely independent of the dataset size N. That's exactly what a **Trie** (prefix tree) gives you.

## Memory-Level Internals: The Space/Time Tradeoff

A Trie stores characters in nodes. A path from the root to a node represents a prefix. Because each node can have multiple children (one for each possible next character), Tries are inherently memory-heavy in exchange for their speed.

```text
Trie after inserting "cat", "car", "dog":

           (root)
           /    \
          c      d
          |      |
          a      o
         / \     |
        t   r    g*
        *   *

* marks isEndOfWord
```

In Java, representing children as an array of 26 pointers (for a-z) yields O(1) child lookups at the cost of sparse memory allocation — most of those 26 slots are `null` for any given node. Alternatively, a `HashMap<Character, TrieNode>` saves space but introduces autoboxing and hashing overhead per lookup. For raw speed in search engines and typeahead systems, the array approach wins.

```java
class TrieNode {
    // 26 letters in English alphabet
    TrieNode[] children = new TrieNode[26];
    boolean isEndOfWord;

    // Optional payload
    int frequencyScore;
}
```

An empty node consumes around 26 × 8 = 208 bytes just for the array of references on a 64-bit JVM (with compressed oops) — before accounting for object header overhead. That cost is the price of guaranteed O(1) child access at every level.

## Implementation: Insertion and Prefix Matching

Inserting involves stepping through the characters, mapping them to indices `[0-25]`, and instantiating nodes where they don't yet exist.

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

Both `insert` and `searchPrefix` are strictly O(L) — the loop runs exactly once per character of the input, regardless of how many other words are already stored in the Trie.

## Scaling for Autocomplete

To build a true autocomplete engine, you need to retrieve *all* words branching from the matched prefix node, not just confirm the prefix exists. Augment `searchPrefix` to return the terminal `TrieNode` instead of a boolean. From there, a Depth-First Search (DFS) collects every path ending in `isEndOfWord = true`.

```java
import java.util.ArrayList;
import java.util.List;

public class AutocompleteTrie {
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

    public List<String> suggest(String prefix) {
        TrieNode node = root;
        for (char c : prefix.toCharArray()) {
            int index = c - 'a';
            if (node.children[index] == null) {
                return List.of(); // No words share this prefix
            }
            node = node.children[index];
        }

        List<String> results = new ArrayList<>();
        collectWords(node, new StringBuilder(prefix), results);
        return results;
    }

    private void collectWords(TrieNode node, StringBuilder path, List<String> results) {
        if (node.isEndOfWord) {
            results.add(path.toString());
        }
        for (int i = 0; i < 26; i++) {
            if (node.children[i] != null) {
                path.append((char) ('a' + i));
                collectWords(node.children[i], path, results);
                path.deleteCharAt(path.length() - 1);
            }
        }
    }
}
```

For high-traffic typeahead systems (search-engine query suggestions, IDE symbol completion), the naive DFS collection above can return thousands of matches for a short prefix. Production systems instead cache the top-*k* results (ranked by `frequencyScore`) directly on the prefix node at insertion time, turning what would be an O(matching words) collection into an O(L) constant-time lookup of a pre-computed list.

## Key Takeaways

- A Trie guarantees O(L) insertion and prefix lookup, independent of how many words are stored — a property arrays and hash maps can't offer for prefix queries.
- Array-indexed children (`TrieNode[26]`) trade memory for O(1) child access; `HashMap`-backed children trade memory efficiency for lookup speed.
- Real autocomplete engines pre-rank and cache top-k suggestions per node rather than DFS-collecting on every keystroke.
