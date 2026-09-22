---
title: "Vector Databases Explained Through a Real RAG Pipeline"
description: "What a vector database mechanically stores, indexes, and serves, walked through one concrete support-engineering RAG pipeline end-to-end, contrasted against relational and keyword indexes, with a pgvector implementation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "DEEP_DIVE"
tags:
  - "vector-database"
  - "embeddings"
  - "approximate-nearest-neighbor"
  - "pgvector"
  - "similarity-search"
  - "retrieval-augmented-generation"
---

# Vector Databases Explained Through a Real RAG Pipeline

> By the end of this article you'll be able to explain, mechanically, what a vector database actually does when a RAG pipeline calls it — what it stores, how it searches, and why that search looks nothing like a relational query — by walking through one concrete pipeline end-to-end.

## The Problem

Picture a support-engineering team at a mid-sized SaaS company. They've built an internal assistant — call it DevDocs — that's supposed to answer engineer questions like "why would a webhook delivery retry silently stop after three attempts?" by searching 40,000 chunks of product documentation, runbooks, and closed support tickets.

The first prototype uses the database the team already trusts: Postgres. Someone writes the obvious query:

```sql
SELECT id, content
FROM doc_chunks
WHERE content ILIKE '%webhook retry%'
LIMIT 5;
```

It half-works. It finds chunks that literally contain the words "webhook" and "retry" near each other. It completely misses the runbook paragraph that explains the answer using the phrase "delivery attempts are capped and further callbacks are suppressed" — which is exactly the right answer, worded differently. No amount of `ILIKE` cleverness fixes this, because `ILIKE` (and its more capable cousin, Postgres full-text search via `tsvector`/`tsquery`, ranked with `ts_rank`) matches *tokens*, not *meaning*. The words "retry" and "attempts" are, to a keyword index, as unrelated as "retry" and "banana."

This is the exact gap a **vector database** is built to close: given a query, find the passages that are *semantically* close to it, even when they don't share a single word. This article makes mechanical what a vector database stores, how it turns "closeness in meaning" into "closeness in a coordinate space," and what happens, step by step, when DevDocs asks it a question.

## Why This Problem Is Hard

Three things make this a genuinely different engineering problem from "add another index to Postgres":

1. **The data being searched isn't rows with a small number of columns — it's high-dimensional vectors.** An embedding model turns each chunk of text into a list of a few hundred to a few thousand floating-point numbers — a point in a space with that many dimensions. A B-tree index is built around the idea that values in one column can be sorted along one axis. There is no single sensible sort order across 1,536 axes at once.
2. **"Nearest" is a geometric question, not an equality question.** A relational index answers "which rows have `customer_id = 42`?" — an exact or range match on ordered scalars. A vector search asks "which of these million points is closest, by some distance metric, to this other point?" — a fundamentally different computation, one that gets more expensive as dimensionality grows.
3. **Computing the exact answer doesn't scale.** Comparing a query vector against every stored vector (brute-force, exact nearest neighbor) is simple and always correct, but it's a linear scan of the whole dataset on every query. At production scale — hundreds of thousands to billions of vectors, sub-100ms latency budgets — that scan is the bottleneck. Vector databases exist specifically to trade a small, controllable amount of accuracy for a large, necessary amount of speed. That trade-off — **Approximate Nearest Neighbor (ANN)** search — is the mechanical core of everything a vector database does.

## A Simple Mental Model

Think about the difference between a **phone book** and a **map**.

A phone book (a keyword or relational index) is organized around exact, sortable keys: names in alphabetical order. You can find "Smith, J." instantly, because the book is sorted by exactly that key. But if you only know "someone who lives near the old train station," the phone book is useless.

A map (a vector index) is organized around *position*. If you know your current coordinates, you can find the nearest coffee shop without knowing its name — you're searching by proximity in space, not by matching a label. Embeddings turn "meaning" into coordinates, and a vector database organizes those coordinates so you can ask "what's nearby?" without measuring the distance to every point on Earth.

The mental model has a limit worth naming up front: a map's distances are objective physical facts. An embedding's "distance" is only as meaningful as the embedding model that produced it — two chunks can sit close together in vector space because they're genuinely about the same topic, or because they share superficial statistical patterns the model latched onto.

## The Core Idea: Three Jobs, One Component

Strip away vendor branding and a vector database does exactly three mechanical jobs:

1. **Store** each vector alongside a reference to what it represents — an ID, the original text (or a pointer to it), and structured metadata (source document, section, product version, access tier, timestamp).
2. **Index** those vectors into a data structure built for fast approximate similarity search, so finding the nearest neighbors doesn't require comparing against every stored vector.
3. **Serve** a similarity query: given a query vector (and optionally a metadata filter), return the top-*k* closest stored vectors, ranked by a distance metric, along with their IDs, metadata, and scores.

Every vendor product — Pinecone, Qdrant, Weaviate, Milvus — and every "vector search bolted onto an existing database" — pgvector on Postgres — is a different implementation of exactly those three jobs.

## How It Actually Works: The DevDocs Pipeline, End to End

### Ingestion: Building the Index Before Anyone Asks a Question

This phase runs offline, in batch, whenever documentation changes — not per query.

```
+-------------------------------------------------------------------------------------+
| Ingestion — batch, offline                                                          |
|                                                                                       |
|  Docs, runbooks,     Chunk               Embedding model      Upsert:               |
|  closed tickets  --> (~300-token     --> (text -> vector)  --> vector+id+metadata --> |
|                       windows)                                  +text                |
|                                                                          |            |
|                                                                          v            |
|                                                              +---------------------+ |
|                                                              | Vector index (ANN)  | |
|                                                              +---------------------+ |
+-------------------------------------------------------------------------------------+
```

For every chunk, three things get written into the vector database in one call, usually called an **upsert** (insert-or-update, keyed by ID):

```python
vector_db.upsert(
    id="runbook-42-chunk-7",
    vector=[0.0142, -0.0891, 0.0367, ...],   # e.g. 1536 floats from the embedding model
    metadata={
        "source": "webhook-retry-runbook.md",
        "section": "Delivery Suppression",
        "product_tier": "all",
        "last_updated": "2026-08-03",
    },
    text="Delivery attempts are capped at three retries. After the third failed "
         "attempt, further callbacks for that event are suppressed and the event "
         "is marked dead-lettered.",
)
```

Three things are worth noticing, because each is a real design decision, not an implementation detail:

- **The vector is opaque.** The database has no idea what "webhook" or "retry" means. It only ever sees an array of floats. All "understanding" happened upstream, in the embedding model. This is the single most important fact to internalize: *a vector database does not understand text — it only ever compares numbers.*
- **Metadata travels with the vector, not separately.** Filtering by `product_tier` or `last_updated` has to happen *together* with the similarity search, not as a separate step afterward — see the filtering failure mode below.
- **The original text usually rides along too**, either stored directly in the payload or referenced by ID into a separate document store. Either way, *something* has to map "the nearest vector we found" back to "the actual text to hand the LLM."

As each vector is written, the database also updates its **index** — the structure that lets a future query find this vector quickly without comparing against all 40,000 others. Building that structure is genuinely expensive work, which is why it happens once, ahead of time.

### Query: What Happens the Moment an Engineer Asks a Question

This phase is synchronous, runs inside the request path, and has a real latency budget.

```
Engineer -> DevDocs App -> Embedding Model -> Vector Database -> LLM -> Engineer

1. "Why do webhook retries stop after 3 tries?"     (Engineer -> App)
2. embed(question)                                  (App -> Embedding Model)
3. query_vector [0.031, -0.082, ...]                 (Embedding Model -> App)
4. search(query_vector, top_k=5,
          filter={product_tier: "all"})              (App -> Vector DB)
5. ANN search over index + metadata filter           (Vector DB, internal)
6. [(id, score, metadata, text), ...]                (Vector DB -> App)
7. prompt with retrieved text as <context>            (App -> LLM)
8. grounded answer                                    (LLM -> Engineer)
```

The query call is the mirror image of the upsert:

```python
results = vector_db.search(
    vector=embed("Why do webhook retries stop after 3 tries?"),
    top_k=5,
    filter={"product_tier": {"$in": ["all", "enterprise"]}},
)

for r in results:
    print(r.id, r.score, r.metadata["source"])
```

Every vector database's search call answers one specific geometric question: **of everything stored, which vectors are closest to this query vector, by whichever distance metric the index was built for** — commonly cosine similarity, Euclidean (L2) distance, or dot product? Everything else — filters, hybrid re-ranking, metadata joins — is scaffolding around that one operation.

### Contrast: The Same Question, Asked of a Relational Index

| | Relational / keyword index (B-tree, hash, BM25) | Vector index (ANN: HNSW, IVF, ...) |
|---|---|---|
| **What it's built over** | Scalars with a total order, or discrete tokens | Points in a high-dimensional continuous space |
| **What a query asks** | "Rows where `x = 42`" — exact/range match | "Points closest to this point" — proximity match |
| **Answer guarantee** | Exact, always | Approximate — a tunable probability of finding the true nearest neighbors |
| **Cost driver** | `O(log n)` for a balanced tree, `O(1)` for hash | Sub-linear and tunable — roughly `O(log n)` graph hops for HNSW |
| **What "relevance" means** | Equality or ordering on a defined key | Geometric closeness — meaningless without an embedding model |

This is why a production RAG system frequently needs both an exact filter (product tier, date range, document ID) *and* an approximate similarity search — which is exactly why **hybrid search** (combining vector similarity with BM25 keyword ranking via Reciprocal Rank Fusion) exists at all: neither index alone answers every question a real system needs answered.

## Under the Hood: What "Filter + Search" Actually Does

Combining a metadata filter with an ANN search hides a genuinely important mechanical decision: **when** does the filter get applied?

- **Pre-filtering** — restrict the candidate set to only vectors matching the metadata filter, *then* run ANN search over that restricted set. This guarantees the filter is respected, but if the ANN index wasn't built with filtering in mind, this can degrade into a near-brute-force scan over the filtered subset.
- **Post-filtering** — run ANN search first to get the top-*k* nearest neighbors globally, *then* discard any that don't match the filter. This is fast, but has a sharp failure mode: if the filter is selective (say 2% of chunks are `product_tier: enterprise`) and none of the globally-nearest *k* vectors satisfy it, you get back fewer results than asked for — or none — even though matching vectors exist elsewhere.

Different vector databases handle this trade-off differently; some implement filter-aware ANN search that pushes filter predicates into the graph or cluster traversal itself.

> **Verification Note**
> How a specific vector database implements filtered search — pre-filter, post-filter, or a filter-aware hybrid — is product-specific and actively evolving. Confirm current behavior against your vendor's documentation before assuming filtered queries always return complete results, especially with highly selective filters.

Two more mechanical details distinguish "a vector database" from "a library that computes cosine similarity":

- **Durability.** Vectors and metadata are as much production data as any row in Postgres — most vector databases achieve durability the same way relational databases do, via write-ahead logging or append-only segment files with periodic compaction.
- **Index maintenance under updates.** Deleting or updating a vector isn't always an immediate in-place graph edit — many ANN structures are far more efficient to *build* than to *mutate*, so vector databases commonly handle deletes with a tombstone-and-compact pattern rather than a synchronous structural edit on every delete.

## Implementation: The Same Pipeline, on Postgres with `pgvector`

To make the relational-vs-vector contrast completely concrete, here's the DevDocs schema using `pgvector`, a real Postgres extension that adds a vector column type and ANN index types directly into the relational engine.

```sql
-- Enable the extension once per database
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE doc_chunks (
    id           bigserial PRIMARY KEY,
    source       text NOT NULL,
    product_tier text NOT NULL,
    last_updated date NOT NULL,
    content      text NOT NULL,
    embedding    vector(1536)          -- fixed-length vector column
);

-- An ANN index over the vector column, using cosine distance
CREATE INDEX doc_chunks_embedding_hnsw
    ON doc_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

The query — note the metadata filter is an ordinary `WHERE` clause, while similarity ranking uses pgvector's cosine-distance operator (`<=>`) instead of `=` or `<`:

```sql
SELECT id, source, content,
       1 - (embedding <=> :query_vector) AS similarity
FROM doc_chunks
WHERE product_tier IN ('all', 'enterprise')
ORDER BY embedding <=> :query_vector
LIMIT 5;
```

This is the same "combine an exact filter with an approximate similarity search" operation described above, expressed in SQL instead of a vendor SDK: pgvector doesn't invent a new database, it adds a new column type and index type onto a relational engine that already knows how to do everything else (transactions, joins, exact filters, durability).

> **Verification Note**
> pgvector's exact operators (`<->` for L2, `<=>` for cosine, `<#>` for negative inner product), supported index types (`ivfflat`, `hnsw`), and their tuning parameters (`m`, `ef_construction`, `lists`, `probes`) have changed across releases. Confirm syntax and parameter names against the pgvector version you're actually running.

## What Can Go Wrong?

- **Embedding-model version mismatch.** If the index was built with embeddings from model version A, and a later query embeds the question with model version B, the two vectors live in geometrically different spaces. The search doesn't error out — it silently returns nonsense-close results. Re-embedding the entire corpus is mandatory whenever the embedding model changes.
- **Filtered search returning too few (or zero) results**, as described above.
- **A stale index.** A vector database's usefulness depends entirely on ingestion actually running when source documents change.
- **Mistaking "approximate" for "wrong."** ANN indexes are tuned for a recall target (say 95%) rather than 100% — a single query occasionally missing the single best chunk is expected behavior, not a sign the system is broken.
- **Treating the vector database as the whole retrieval quality story.** A perfectly-tuned ANN index returning irrelevant vectors *fast* is not progress if the embedding model itself doesn't place semantically related chunks near each other.

## Security Considerations

A vector database inherits every ordinary data-governance obligation of any datastore holding sensitive content, and adds a couple of its own:

- **The stored text and metadata are still sensitive data.** If DevDocs indexes closed support tickets containing customer names, that's exactly as sensitive sitting in a `metadata` JSON blob inside a vector database as it would be in a Postgres column — access control, encryption at rest, and audit logging obligations don't relax.
- **Embeddings are not automatically anonymous.** A vector is a lossy, compressed representation of the text that produced it — but "lossy" is not the same as "irreversible." Published research on embedding inversion has shown meaningful fragments of original text can sometimes be reconstructed from an embedding vector alone.

  > **Verification Note**
  > The practicality and scope of embedding-inversion attacks are an active research area and vary significantly by embedding model and attacker access. Treat this as a reason to apply the same data classification and access controls to embeddings as to source text, not as a specific quantified threat level.

- **Retrieved content is still untrusted input the moment it reaches the LLM** — the same indirect-prompt-injection defenses that apply regardless of which vector database returned the chunk.

## Common Misconceptions

**"A vector database replaces the need for a relational database."**
Reality: vector databases are optimized for one operation — approximate similarity search — and are often poor at multi-row ACID transactions, complex joins, or exact-match lookups at high write throughput. Production RAG systems almost always run both.

**"ANN search finds 'the most relevant' result."**
Reality: ANN search finds the vectors geometrically closest to the query vector, according to whatever distance metric and embedding model produced both. "Closest in embedding space" and "most relevant to what the user actually meant" are correlated by design, not identical by guarantee.

**"A vector database 'understands' the text it stores."**
Reality: the database never sees text — only the floating-point vectors an upstream embedding model produced.

## Expert Insight

**Recall isn't something you set once and trust forever.** ANN indexes expose tuning knobs — `ef_search` in HNSW, `nprobe` in IVF-style indexes — that trade query latency for recall. The right way to validate them is periodically running a sample of production queries through both the ANN index and an exact brute-force search, and measuring how often they agree.

**Embedding-model changes are a migration, not a config flag.** Every vector already stored was produced by the old model, and mixing old and new embeddings in the same index silently corrupts every distance comparison between them — nothing errors, the numbers are just wrong relative to each other. The only correct path is: re-embed the entire corpus, build a new index, and cut over.

## Pause and Think

> **Critical Question:** Your ANN index is tuned for 95% recall, and a user reports that DevDocs failed to find an obviously-relevant runbook for their exact question. Is this evidence the vector database is broken?

**Answer:** Not necessarily. There are at least three independent places this could have failed: (1) the embedding model may have placed the query and the relevant chunk further apart in vector space than intuition suggests, meaning even an exact search wouldn't have surfaced it; (2) a metadata filter may have excluded the correct chunk before similarity ranking ever ran; (3) the chunk may genuinely be one of the ~5% the tuned recall target allows to be missed. Debugging requires isolating which layer failed — rerun with filters removed, then with exact brute-force search instead of the ANN index.

## Key Takeaways

- A vector database mechanically does three things: **store** vectors with metadata, **index** them for fast approximate similarity search, and **serve** top-*k* nearest-neighbor queries, optionally combined with exact metadata filters.
- **ANN search trades a small, tunable amount of accuracy for the speed a linear scan can't provide at scale** — approximate is the deliberate design, not a limitation.
- A vector index and a relational or keyword index answer fundamentally different questions — geometric proximity versus exact/range match — which is why hybrid search exists.
- **Combining a metadata filter with a similarity search is a real mechanical decision** (pre-filter vs. post-filter) with a genuine failure mode.
- The vector database never understands text — embedding-model version mismatches silently corrupt search quality rather than throwing an error.
- Stored embeddings carry the same data-governance obligations as any sensitive datastore, and embedding-inversion research means "just the vector, not the text" isn't automatically safe.
