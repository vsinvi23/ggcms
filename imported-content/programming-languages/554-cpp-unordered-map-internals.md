# std::unordered_map Explained Internally: Hash Buckets and Chaining

## Problem Statement
Standard search trees (`std::map`, backed by Red-Black trees) guarantee O(log N) lookup time. However, for massive datasets where key-value relationships don't need sorting, O(log N) is too slow. We require a data structure offering O(1) average lookup, insertion, and deletion complexity.

## Architectural Solution: Hash Tables with Chaining
`std::unordered_map` is implemented as a Hash Table. It consists of a dynamically resizing contiguous array of "buckets." Each bucket is a pointer to a linked list (chain) of key-value nodes. 

When you insert a key, the hash function generates a numeric digest. Modulo math maps this digest to a bucket index. If two keys hash to the same bucket (a collision), they are appended to the linked list in that bucket.

### Memory Layout

```text
    Array of Buckets
    +-----+
[0] | ptr | ---> [Key: A | Val] -> nullptr
    +-----+
[1] | ptr | ---> nullptr
    +-----+
[2] | ptr | ---> [Key: K | Val] -> [Key: Z | Val] -> nullptr  <-- Collision
    +-----+
[3] | ptr | ---> [Key: X | Val] -> nullptr
    +-----+
```

## Robust Code Example

Here is how the hashing logic fundamentally operates.

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <list>

template<typename K, typename V>
class SimpleUnorderedMap {
    struct Node { K key; V value; };
    std::vector<std::list<Node>> buckets;
    size_t num_elements = 0;

    size_t get_bucket_index(const K& key) const {
        return std::hash<K>{}(key) % buckets.size();
    }

public:
    SimpleUnorderedMap(size_t bucket_count = 8) {
        buckets.resize(bucket_count);
    }

    void insert(const K& key, const V& value) {
        size_t idx = get_bucket_index(key);
        // Check for existing key
        for (auto& node : buckets[idx]) {
            if (node.key == key) {
                node.value = value;
                return;
            }
        }
        // Chain the new element
        buckets[idx].push_back({key, value});
        ++num_elements;
    }

    V* find(const K& key) {
        size_t idx = get_bucket_index(key);
        for (auto& node : buckets[idx]) {
            if (node.key == key) return &node.value;
        }
        return nullptr;
    }
};

int main() {
    SimpleUnorderedMap<std::string, int> map;
    map.insert("CPU", 100);
    map.insert("RAM", 200);

    if (int* val = map.find("CPU")) {
        std::cout << "CPU Val: " << *val << "\n";
    }
    return 0;
}
```

## Under the Hood: Mechanics

### Hash Functions and Modulo
The `std::hash` template provides the digest. The table computes `hash % bucket_count` to find the physical array index. To prevent massive collisions (where everyone lands in bucket 0), the hash function must distribute bits uniformly.

### Load Factor and Rehashing
The **Load Factor** is `size / bucket_count`. In C++, the `max_load_factor` defaults to `1.0`. Once the map holds more elements than buckets, collisions are mathematically guaranteed. The map triggers a **Rehash**: it allocates a larger array of buckets (often prime sizes or powers of two) and completely recalculates the indices for all existing elements. This is an O(N) operation.

### Performance Pitfalls: Cache Misses
Despite being O(1), `std::unordered_map` is notoriously slow for small datasets compared to flat arrays. Because it is a bucket array of pointers to linked-list nodes scattered randomly in the heap, retrieving an element triggers **cache misses**. Traversing memory that isn't physically contiguous starves the CPU. Modern high-performance code often prefers "flat hash maps" (Open Addressing) over chained hashing to preserve cache locality.