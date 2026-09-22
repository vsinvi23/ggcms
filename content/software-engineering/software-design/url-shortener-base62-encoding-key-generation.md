---
title: "Designing a URL Shortener: Base62 Encoding and Key Generation Services"
description: "Why hashing long URLs to build a short-link service fails at scale, and how Base62 encoding of sequential IDs combined with a pre-allocating Key Generation Service (KGS) solves collisions and throughput bottlenecks."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "url-shortener"
  - "base62-encoding"
  - "key-generation-service"
  - "distributed-systems"
  - "collision-avoidance"
---

# Designing a URL Shortener: Base62 Encoding and Key Generation Services

## The Problem: Collisions and the Cost of Hashing

URL shorteners like Bitly or TinyURL look like a trivial key-value mapping of a short string to a long URL. At the scale of billions of links and thousands of writes per second, the two naive approaches — hashing the URL, or generating a random string per request — both fail.

**Hashing the long URL.** MD5 produces a 128-bit (32 hex character) digest — far too long for a "short" URL, so implementations truncate it, typically to 7 characters. At scale, the **birthday paradox** guarantees that two different long URLs will eventually produce the same truncated hash. Worse, a pure hash of the URL means two different users shortening the exact same long URL get the exact same short code, which breaks per-user click analytics and ownership.

**Random string generation.** Generating a random 7-character string and checking the database for a collision before insert works at low volume, but the collision-check-then-insert round trip becomes a serialization point under concurrent writes, and collision probability climbs as the keyspace fills.

## The Solution: Base62 Encoding of a Sequential ID

Instead of hashing the URL's *content*, treat the short code as a positional encoding of a unique, sequentially assigned integer.

### The mental model: the deli ticket dispenser

Walking into a busy deli, you don't gamble on a random ticket number and hope nobody else picked it — you pull the next sequential ticket from a dispenser. A URL shortener can do the same: generate a guaranteed-unique, monotonically increasing integer ID for every new link, then convert that integer into a compact string using **Base62**.

Base62 uses the 62 characters `[0-9a-zA-Z]` (all case-sensitive alphanumerics). A 7-character Base62 string can represent `62^7 ≈ 3.5 trillion` distinct values — enough for a decade of internet-scale link creation without exhausting the keyspace.

### Base62 conversion algorithm

```python
def encode_base62(num: int) -> str:
    """Convert a non-negative integer ID into a Base62 string."""
    characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base = 62

    if num == 0:
        return characters[0]

    encoded_chars = []
    while num > 0:
        remainder = num % base
        encoded_chars.append(characters[remainder])
        num //= base

    # Digits were generated least-significant-first; reverse for final string.
    return "".join(reversed(encoded_chars))


def decode_base62(short_code: str) -> int:
    """Recover the original integer ID from a Base62 short code —
    needed to look up analytics or verify ownership without a reverse index."""
    characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base = 62
    num = 0
    for char in short_code:
        num = num * base + characters.index(char)
    return num


# Example: sequential ticket ID 125_000_000 becomes "8m0cW"
assert decode_base62(encode_base62(125_000_000)) == 125_000_000
```

Because the mapping is a pure positional encoding (not a hash), it is a perfect bijection: every integer maps to exactly one short code and back, with zero collision risk by construction.

## The Distributed Bottleneck: Scaling the Ticket Dispenser

Converting an integer to Base62 is cheap. The bottleneck is *generating the unique integer itself*. A single relational database's auto-increment column is a single point of failure and a write choke point once multiple application servers are issuing short-URL creation requests concurrently — every request has to round-trip to that one sequence.

### The Key Generation Service (KGS)

To remove that bottleneck, decouple ID generation from request handling with a standalone **Key Generation Service**. The KGS's only job is to hand out batches of pre-reserved, never-repeating integer ranges to application servers.

```
[App Server 1] --- "give me 1,000 keys" --> [KGS] --> reserves range [5,000,000-5,000,999] in Key DB
[App Server 2] --- "give me 1,000 keys" --> [KGS] --> reserves range [5,001,000-5,001,999] in Key DB
[App Server 3] --- "give me 1,000 keys" --> [KGS] --> reserves range [5,002,000-5,002,999] in Key DB
```

1. **Pre-allocation.** On boot, each application server requests a batch (e.g. 1,000) of unique integer IDs from the KGS. The KGS atomically advances a single counter in its own datastore by 1,000 and hands back the reserved range — one contended operation per *batch*, not per *request*.
2. **Local caching.** The app server holds its batch of pre-reserved IDs in local memory.
3. **Instant provisioning.** When a user submits a long URL, the app server pops the next ID off its local batch, Base62-encodes it, and returns the short code immediately — no network round trip on the request's hot path.
4. **Zero collisions by construction.** Because the KGS never hands the same range to two servers, and Base62 encoding is a bijection, collisions are structurally impossible — not merely improbable.

### Handling app server crashes

If an app server crashes with unused IDs still in its local batch, those IDs are simply lost — never assigned, never reused. Out of `62^7 ≈ 3.5 trillion` possible codes, losing a few hundred per crash is a negligible cost for eliminating a synchronous ID-generation bottleneck from every write request.

## Read-Path: Redirecting Short Codes

The read path (`GET /{shortCode}` → `302 Redirect` to the long URL) is a simple, highly cacheable key lookup — and reads vastly outnumber writes in a URL shortener (a link is created once, clicked thousands of times). A minimal Go handler:

```go
func RedirectHandler(cache Cache, db URLStore) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        shortCode := strings.TrimPrefix(r.URL.Path, "/")

        // Check cache first — the overwhelming majority of traffic
        // hits a small number of "hot" links.
        if longURL, ok := cache.Get(shortCode); ok {
            http.Redirect(w, r, longURL, http.StatusFound)
            return
        }

        longURL, err := db.Lookup(shortCode)
        if err != nil {
            http.NotFound(w, r)
            return
        }

        cache.Set(shortCode, longURL, 24*time.Hour)
        http.Redirect(w, r, longURL, http.StatusFound)
    }
}
```

## Key Takeaways

- Hashing the URL content to build a short code fails at scale — the birthday paradox forces collisions, and it can't distinguish two users shortening the same URL.
- Base62-encoding a sequential integer ID is a collision-free bijection: no hash comparison, no database uniqueness check required.
- A dedicated Key Generation Service that pre-allocates batches of IDs removes the single-database-sequence bottleneck from the write path entirely.
- The read path dominates traffic in a URL shortener and should be cache-first; the write path only needs to be collision-free and fast, not globally ordered.
