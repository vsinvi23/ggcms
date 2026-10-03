---
title: "Elasticsearch Internals: How the Inverted Index Powers Full-Text Search"
description: "How Elasticsearch and Lucene use inverted indexes, analyzers, finite state transducers, and delta-compressed posting lists to make full-text search fast at scale."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "elasticsearch"
  - "lucene"
  - "inverted-index"
  - "full-text-search"
  - "search-engines"
---

# Elasticsearch Internals: How the Inverted Index Powers Full-Text Search

## The Problem: The B-Tree Bottleneck in Text Search

Traditional relational databases like PostgreSQL and MySQL are highly optimized for exact matches and range queries, using B-Tree indexes. A query like `WHERE author = 'Tolkien'` traverses the B-Tree in logarithmic time to find the exact rows.

But full-text search — finding all documents containing the word "hobbit" anywhere in a 5,000-word article — breaks B-Trees. A B-Tree index on a text column can only optimize prefix searches (`WHERE text LIKE 'hob%'`). For a wildcard search (`LIKE '%hobbit%'`), the database is forced into a full table scan, evaluating every row sequentially. At millions of documents, this produces catastrophic latency.

Elasticsearch solves this fundamentally different query requirement by discarding B-Trees in favor of a specialized data structure: the **inverted index**.

## The Mental Model: Flipping the Data

Consider how a book is structured: pages (documents) contain words.

- A **forward index** maps a document to its content: `Page 1 -> [The, hobbit, lived, in, a, hole]`
- An **inverted index** is like the glossary at the back of the book — it flips the relationship, mapping words to the pages where they appear: `hobbit -> [Page 1, Page 42, Page 105]`

```text
[ Analysis Phase ]                [ The Inverted Index ]
Doc 1: "The quick brown fox" ──┐
Doc 2: "Quick foxes jump"    ──┼──> Term   | Document IDs (Posting List)
                               │    brown  | [1]
                               │    fox    | [1, 2]
                               │    jump   | [2]
                               │    quick  | [1, 2]
```

When you search for "quick fox," Elasticsearch looks up "quick" (Docs 1, 2) and "fox" (Docs 1, 2), calculates the intersection, and returns Documents 1 and 2 instantly, without scanning any text.

## The Analysis Pipeline

Before text is inserted into an inverted index, it undergoes an **analysis** phase — this is what gives Elasticsearch its linguistic intelligence. An analyzer consists of three parts:

1. **Character filters** — strip HTML tags or convert symbols (e.g., `&` to `and`).
2. **Tokenizer** — splits the raw string into individual tokens, typically on whitespace or punctuation.
3. **Token filters** — lowercase everything, remove stop words ("the", "is", "a"), and perform stemming (converting "jumping"/"jumps" to the root "jump").

The sentence *"The Foxes are Jumping!"* is analyzed down to the tokens `[fox, jump]`. These normalized tokens are what actually get stored as "terms" in the index.

## Storage and Compression Internals

An inverted index sounds simple, but storing it efficiently across billions of documents requires serious computer science. Apache Lucene (which powers Elasticsearch) splits the index into three structures.

### 1. The Term Dictionary

The sorted list of all unique terms present in the dataset. Because the dictionary can grow massive, storing it efficiently on disk is crucial.

### 2. The Term Index (FST)

To avoid scanning the term dictionary on disk, Lucene keeps a specialized in-memory structure called a **Finite State Transducer (FST)** — an ultra-compressed prefix tree (trie) that maps prefixes to disk block offsets. Searching for "fox" lets the FST instantly return the exact byte offset in the on-disk term dictionary, drastically reducing disk seeks.

### 3. The Posting List and Frame-of-Reference Compression

The posting list is the array of document IDs associated with a term. For a common word, this list could contain millions of integers — storing them raw would consume terabytes of RAM.

Lucene compresses these lists using delta-encoding and **Frame of Reference (FOR)** compression. Instead of storing `[100, 105, 112]`, it stores the deltas: `[100, 5, 7]`. Because deltas are small numbers, they need far fewer than 32 bits each. FOR compression packs these tiny integers into tight bit-blocks, letting Elasticsearch perform bitwise intersection (AND/OR) at high speed using Roaring Bitmaps.

```text
Raw posting list:      [100, 105, 112, 130, 131]
Delta-encoded:          100,   5,   7,  18,   1
FOR-compressed bits:    packed into minimal-width blocks
                        -> bitwise AND/OR across terms
                           via Roaring Bitmaps
```

## Conclusion

Relational databases fail at full-text search because they index the container (the row) rather than the content. Elasticsearch dominates the search ecosystem by aggressively analyzing text down to linguistic roots and mapping those roots back to documents via the inverted index. Combining in-memory finite state transducers for instant term lookups with heavily compressed, delta-encoded posting lists lets Elasticsearch execute complex, multi-term relevancy queries across petabytes of text in milliseconds.
