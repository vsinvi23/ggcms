---
title: "Probabilistic Data Structures: Bloom Filters and Count-Min Sketch"
description: "How Bloom Filters and Count-Min Sketch trade absolute precision for massive memory savings, with a runnable Python implementation and a web-crawler scenario for avoiding cache penetration."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "bloom-filter"
  - "count-min-sketch"
  - "probabilistic-data-structures"
  - "system-design"
  - "caching"
  - "python"
---

# Probabilistic Data Structures: Bloom Filters and Count-Min Sketch

## The Problem

At a certain scale, deterministic data structures (HashMaps, Trees, Sets) run out of memory.

Imagine you are building a web crawler, and you need to keep track of 10 billion URLs you've already visited so you don't crawl them again. Storing 10 billion URLs in a standard Hash Set would require hundreds of gigabytes of RAM — each URL string alone can be 50-100 bytes, plus hash table overhead. If instead you check a database on disk every time, your crawler grinds to a halt under disk I/O latency, and a single Redis instance holding all 10 billion keys costs a fortune. How do we solve memory constraints when exact precision isn't strictly necessary?

The same problem shows up whenever a service sits in front of an expensive or slow backend: "has this user already redeemed this coupon code?", "has this cache key ever been written?", "has this API key ever existed?" In every one of these, a false "maybe, go check" is cheap — but a false "definitely not" that turns out to be wrong is a correctness bug.

## The Mental Model

Think of a bouncer at a massive club. Memorizing the face of every single person who has ever been banned (deterministic) is impossible. Instead, the bouncer uses a quick rule-of-thumb checklist (probabilistic). If you hit a red flag, he says "You *might* be banned, let me check the slow main computer." If you hit zero flags, he says "You are *definitely not* banned, go right in."

Probabilistic data structures trade absolute precision for massive memory compression, usually guaranteeing that they will never give a **false negative**, even if they occasionally give a **false positive**.

## The Bloom Filter

A Bloom Filter is used to answer one question: **"Is this item in the set?"**

### How It Works

It consists of a large array of bits (all initially set to 0) and a few different hash functions.

1. **Adding an item:** When you add "google.com", you run it through 3 different hash functions. They output 3 array indices (e.g., 4, 12, 88). You flip those bits in the array to 1.
2. **Checking an item:** To check if "yahoo.com" has been visited, you run it through the same 3 hash functions. Suppose it outputs (4, 15, 88). You check the array. Bits 4 and 88 are 1, but bit 15 is 0.

Because at least one bit is 0, you know with **100% certainty** that "yahoo.com" has never been added.
If all three bits were 1, it *probably* was added, but it might be a collision from other URLs.

**Trade-off:** You can never remove an item from a standard Bloom Filter, because setting a bit back to 0 might accidentally remove data from a different, overlapping item.

```text
                +---+---+---+---+---+---+---+---+---+
Bit array:      | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
                +---+---+---+---+---+---+---+---+---+
                  0   1   2   3   4   5   6   7   8

add("google.com")           check("yahoo.com")
  hash1 -> index 2             hash1 -> index 4  -> bit is 1
  hash2 -> index 5             hash2 -> index 5  -> bit is 1
  hash3 -> index 7             hash3 -> index 3  -> bit is 0  <-- STOP

  set bits 2, 5, 7 to 1        Result: "yahoo.com" was DEFINITELY NOT added.
                               (one zero bit is enough to prove absence)
```

### Production Python Implementation

```python
import hashlib
from typing import List


class BloomFilter:
    """A simple Bloom Filter using double hashing to simulate k independent hash functions."""

    def __init__(self, size_bits: int = 1_000_000, num_hashes: int = 5):
        self.size_bits = size_bits
        self.num_hashes = num_hashes
        # In production, back this with a real bit array (bitarray package) or Redis BITFIELD.
        self.bits = bytearray(size_bits // 8 + 1)

    def _hashes(self, item: str) -> List[int]:
        h1 = int(hashlib.md5(item.encode()).hexdigest(), 16)
        h2 = int(hashlib.sha1(item.encode()).hexdigest(), 16)
        # Kirsch-Mitzenmacher: derive k hashes from just two real hash functions.
        return [(h1 + i * h2) % self.size_bits for i in range(self.num_hashes)]

    def _set_bit(self, index: int) -> None:
        self.bits[index // 8] |= (1 << (index % 8))

    def _get_bit(self, index: int) -> bool:
        return bool(self.bits[index // 8] & (1 << (index % 8)))

    def add(self, item: str) -> None:
        for index in self._hashes(item):
            self._set_bit(index)

    def might_contain(self, item: str) -> bool:
        """False -> definitely not in the set. True -> probably in the set."""
        return all(self._get_bit(index) for index in self._hashes(item))


# --- Usage: front a crawl-queue check with the filter ---
visited = BloomFilter(size_bits=10_000_000, num_hashes=5)
visited.add("https://example.com/a")
visited.add("https://example.com/b")

def should_crawl(url: str) -> bool:
    if not visited.might_contain(url):
        return True  # Definitely new — skip the expensive DB check entirely.
    # Possible false positive — fall through to the authoritative store.
    return not database_has_url(url)

def database_has_url(url: str) -> bool:
    # Slow path: real lookup against Postgres/Redis/S3 manifest, etc.
    return url in {"https://example.com/a", "https://example.com/b"}
```

With `size_bits=10_000_000` and `num_hashes=5`, this filter costs about 1.25 MB of RAM and yields a false-positive rate under 1% for roughly 1 million inserted URLs — versus hundreds of megabytes for an equivalent hash set, and zero disk round-trips for the 99%+ of checks that come back "definitely not seen."

## Count-Min Sketch

While Bloom Filters track *existence*, a Count-Min Sketch tracks *frequency*.

Imagine calculating the top trending hashtags on Twitter in real time. Storing an exact counter for millions of unique hashtags takes too much memory, and most of them are seen only once or twice.

A Count-Min Sketch uses a 2D matrix of counters and multiple hash functions. When `#sysdesign` occurs, it is hashed by 3 functions, resulting in 3 indices across 3 rows. The counters at those indices are incremented.
To query the frequency of `#sysdesign`, you hash it, look at the 3 corresponding counters, and take the **minimum** value of the three. Like Bloom Filters, it overestimates (due to collisions) but never underestimates.

```python
class CountMinSketch:
    def __init__(self, width: int = 2000, depth: int = 5):
        self.width = width
        self.depth = depth
        self.table = [[0] * width for _ in range(depth)]

    def _index(self, row: int, item: str) -> int:
        return hash((row, item)) % self.width

    def increment(self, item: str) -> None:
        for row in range(self.depth):
            self.table[row][self._index(row, item)] += 1

    def estimate(self, item: str) -> int:
        return min(self.table[row][self._index(row, item)] for row in range(self.depth))


trending = CountMinSketch()
for tag in ["#sysdesign", "#sysdesign", "#golang", "#sysdesign"]:
    trending.increment(tag)

print(trending.estimate("#sysdesign"))  # 3 (exact here; may overestimate under heavy collision)
print(trending.estimate("#neverseen"))  # 0 — never underestimates
```

## Architectural Takeaway

Whenever a system design problem involves extreme scale ("billions of events," "preventing expensive DB lookups," "real-time heavy hitters"), reach for probabilistic structures.

- Use **Bloom Filters** in front of a database or cache to instantly bypass queries for non-existent data (avoiding cache penetration).
- Use **Count-Min Sketches** for real-time analytics, rate-limiting, and trending topics where a slight margin of error is acceptable for a massive reduction in RAM.
