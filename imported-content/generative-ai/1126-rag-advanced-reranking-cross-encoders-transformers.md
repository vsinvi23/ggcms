# Advanced RAG: Boosting Recall with Cross-Encoder Re-Ranking

**The Problem:** In standard RAG pipelines, dense vector retrieval uses Bi-Encoders. The query and the document are embedded separately into a single vector space, and similarity is calculated using Cosine Distance. This is incredibly fast (scaling to billions of documents) but suffers from poor deep semantic matching because the query and document never interact during the embedding process.

If a Bi-Encoder retrieves 10 documents, the #1 result might not actually be the most relevant. How do we fix the ordering?

## The Re-Ranking Architecture
The solution is a two-stage retrieval pipeline:
1. **Stage 1 (Bi-Encoder / Dense Retrieval):** Fast, coarse retrieval. Casts a wide net to retrieve the Top-100 candidates from millions of documents.
2. **Stage 2 (Cross-Encoder / Re-Ranker):** Slow, highly accurate scoring. Evaluates the Top-100 candidates and re-sorts them to find the true Top-5 to send to the LLM.

```text
User Query 
    |
    v
[ Bi-Encoder (e.g., text-embedding-3-small) ] ---> Vector DB
    |
    v (Returns Top 100 Candidates)
[ Cross-Encoder (e.g., Cohere ReRank / BGE) ] <--- Query + Candidates
    |
    v (Scores and Sorts)
Top 5 Highly Relevant Documents
    |
    v
[ LLM Context Window ]
```

## Bi-Encoders vs Cross-Encoders

### Bi-Encoders (Stage 1)
- Computes `Embed(Query)` and `Embed(Doc)`.
- The attention mechanism applies only within the query itself, and the document itself.
- **Complexity:** $O(N)$ at search time using Approximate Nearest Neighbors (ANN).

### Cross-Encoders (Stage 2)
- Concatenates the text: `Transformer([CLS] Query [SEP] Document)`.
- The attention mechanism operates **across** the query and the document simultaneously. Every word in the query attends to every word in the document.
- It outputs a raw relevancy score (0 to 1), not a vector.
- **Complexity:** Too computationally expensive to run on an entire database. Feasible only for a small candidate set (e.g., $N=100$).

## Implementation Example
Using the `sentence-transformers` library to implement the second stage.

```python
from sentence_transformers import CrossEncoder

# Load a pre-trained cross-encoder model
reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

def two_stage_retrieval(query: str, vector_db):
    # Stage 1: Fast Bi-Encoder retrieval (Top 100)
    stage_1_docs = vector_db.search(query, top_k=100)
    
    # Format inputs for Cross-Encoder: list of [query, doc] pairs
    rerank_inputs = [[query, doc.text] for doc in stage_1_docs]
    
    # Stage 2: Cross-Encoder scoring
    scores = reranker.predict(rerank_inputs)
    
    # Attach scores to documents and sort
    for doc, score in zip(stage_1_docs, scores):
        doc.rerank_score = score
        
    stage_1_docs.sort(key=lambda x: x.rerank_score, reverse=True)
    
    # Return the true Top-5
    return stage_1_docs[:5]
```

## Why This Matters
Vector search often struggles with negation (e.g., "how to NOT configure a proxy") or highly specific technical nuances because the vectors compress text into a fixed-length spatial representation. Cross-Encoders evaluate the full lexical overlap and semantic interaction in real-time, drastically reducing hallucinations caused by feeding the LLM poorly matched context.