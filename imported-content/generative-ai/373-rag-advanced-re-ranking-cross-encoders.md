# Advanced RAG: Boosting Recall with Cross-Encoder Re-Ranking

**The Problem:** Standard vector embeddings (Bi-Encoders) are fast because they pre-compute document vectors and compare them via simple cosine similarity. However, they lack deep semantic understanding of how a specific query interacts with a specific document. This results in the "lost in the middle" problem, where the most relevant chunks are retrieved at position 15 instead of position 1.

**The Solution:** Two-Stage Retrieval using a Cross-Encoder Re-Ranker. You retrieve a broad set of candidates (e.g., top 50) using a fast Vector DB, then pass those candidates through an attention-heavy Cross-Encoder that scores the Query + Document *together*.

### Architecture

```text
[User Query]
      |
      v
+-----------------------+
| Stage 1: Vector Search| (Bi-Encoder, ANN Index)
| Returns: Top 50 hits  | Fast, low computational cost.
+-----------------------+
      |
      v
+-----------------------+
| Stage 2: Re-Ranker    | (Cross-Encoder Model)
| Scores (Query + Doc)  | Slow, high computational cost.
+-----------------------+
      |
      v
[Top 5 Re-Ranked Hits Passed to LLM]
```

### Bi-Encoders vs Cross-Encoders

- **Bi-Encoder (Standard RAG):** `cosine_sim( Model(Query), Model(Doc) )`. Models run independently. Misses nuanced word interactions.
- **Cross-Encoder:** `Model(Query + Doc) -> Score`. Query and document are fed simultaneously into the Transformer. The self-attention layers evaluate the direct relationship between query words and document words. Highly accurate, but you cannot pre-compute the vectors.

### Robust Implementation (Python w/ Cohere)

In this implementation, we simulate the first stage vector search and implement the Cohere API for the re-ranking stage. Open-source models like `bge-reranker-v2-m3` can be swapped in for local execution.

```python
import cohere
import os

co = cohere.Client(os.getenv("COHERE_API_KEY"))

def retrieve_and_rerank(query: str, vector_store) -> list[str]:
    # ---------------------------------------------------------
    # STAGE 1: Broad, high-recall vector search (Top 50)
    # ---------------------------------------------------------
    # Bi-encoder search returns a large candidate pool
    stage_1_candidates = vector_store.search(query, top_k=50) 
    
    # Extract the raw text from the Vector DB results
    docs_to_rerank = [doc.page_content for doc in stage_1_candidates]
    
    # ---------------------------------------------------------
    # STAGE 2: Precise, high-accuracy re-ranking (Top 5)
    # ---------------------------------------------------------
    rerank_response = co.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=docs_to_rerank,
        top_n=5,
        return_documents=True
    )
    
    # Extract the re-ordered, highest relevance texts
    final_context = []
    for hit in rerank_response.results:
        # hit.relevance_score contains the cross-encoder confidence
        print(f"Doc Index: {hit.index}, Score: {hit.relevance_score:.4f}")
        final_context.append(hit.document.text)
        
    return final_context
```

### Performance Characteristics
Applying a Re-Ranker typically yields a 15-30% bump in MRR (Mean Reciprocal Rank) and NDCG metrics. Because Cross-Encoders are computationally heavy, limiting Stage 1 retrieval to ~50-100 documents is strictly necessary to prevent high latency (seconds of delay) during query execution.
