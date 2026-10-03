---
title: "Advanced RAG: Boosting Precision with Cross-Encoder Re-Ranking"
description: "Why Bi-Encoder vector search alone produces confident-but-wrong retrievals, how a two-stage Cross-Encoder re-ranking pipeline fixes it, with a full Hugging Face implementation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "cross-encoder"
  - "reranking"
  - "bi-encoder"
  - "retrieval-augmented-generation"
  - "semantic-search"
  - "transformers"
---

# Advanced RAG: Boosting Precision with Cross-Encoder Re-Ranking

A support-ticket assistant retrieves documentation for "how do I cancel my subscription?" and confidently surfaces the "How to upgrade your subscription" article instead of the cancellation one. Both live in the same semantic neighborhood — accounts, billing, subscriptions — so a plain vector search scores them nearly identically. The user gets the wrong answer, and the retrieval log shows nothing obviously broken: the cosine similarity score for the wrong doc was 0.89, only a hair below the right one's 0.90.

This is the precision ceiling of standard vector search, and it's what Cross-Encoder re-ranking exists to fix.

## The Problem: The Precision Bottleneck of Bi-Encoders

Standard RAG retrieval uses **Bi-Encoders** (`text-embedding-3-small`, `all-MiniLM-L6-v2`, `BGE-M3`): the query and every candidate document are embedded *independently* into the same vector space, and similarity is computed with cosine distance or dot product.

```
Bi-Encoder (fast, approximate):
  Query -------> [Embedding Model] -------> Vector \
                                                     +---> Cosine similarity (no cross-attention)
  Document ----> [Embedding Model] -------> Vector /

Cross-Encoder (slow, high-precision):
  [Query + Document] ---> [Joint Transformer] ---> Full token cross-attention ---> Relevance score [0,1]
```

Because the query vector and document vector are each computed with zero knowledge of the other, the model never gets to directly compare "cancel" against "upgrade" token-for-token. It only ever compares two pre-baked, general-purpose summaries of meaning. That's fast and scales to millions of documents — but it produces exactly the kind of false positive above: documents that occupy the same broad semantic region as the query, without actually answering it.

## The Solution: A Two-Stage Retrieval Pipeline

```
+---------------------------------------------------------------------------------------+
| Two-Stage Retrieval Pipeline (Bi-Encoder + Cross-Encoder Re-Ranker)                    |
+---------------------------------------------------------------------------------------+
|                                                                                         |
|                                     User Query                                         |
|                                         |                                               |
|                                         v                                               |
|                        +----------------------------------+                             |
|                        | Stage 1: Vector Search Retrieval |                             |
|                        | (fast, coarse: cosine over DB)   |                             |
|                        +----------------------------------+                             |
|                                         |                                               |
|                                         | Retrieves top-50/100 candidates               |
|                                         v                                               |
|                        +----------------------------------+                             |
|                        | Stage 2: Cross-Encoder Re-Ranker |                             |
|                        | (joint query-doc self-attention)  |                             |
|                        +----------------------------------+                             |
|                                         |                                               |
|                                         | Re-scores, keeps top-3/5                      |
|                                         v                                               |
|                        +----------------------------------+                             |
|                        | High-precision chunks -> LLM     |                             |
|                        +----------------------------------+                             |
|                                                                                         |
+---------------------------------------------------------------------------------------+
```

1. **Stage 1 (coarse retrieval, fast).** A Bi-Encoder queries the vector database for a broad candidate set — top 50 or 100 chunks — optimizing for recall, not precision.
2. **Stage 2 (fine re-ranking, accurate).** A **Cross-Encoder** takes the query and *each* candidate concatenated as a single input pair — `[CLS] query [SEP] candidate [SEP]` — and runs them jointly through a transformer. Because both texts are present simultaneously, full token-to-token self-attention can directly compare "cancel" against every word in each candidate, producing a genuinely accurate relevance score.
3. **Stage 3 (synthesis).** Sort candidates by Cross-Encoder score and pass only the top-3 to top-5 to the LLM.

```
+-------------------------------------------------------------+
|             Two-Stage RAG With Re-Ranking                    |
+-------------------------------------------------------------+
| 1. Query: "Cancel my plan"                                   |
|                                                                |
| 2. Vector DB (Bi-Encoder) -> Top 50 docs (fast)              |
|    - Doc A: "Upgrade plan" (cosine 0.89)                     |
|    - Doc B: "Cancel plan"  (cosine 0.88)                     |
|    - Doc C: "Plan pricing" (cosine 0.85)                     |
|                                                                |
| 3. Re-Ranker (Cross-Encoder) -> scores query+doc jointly      |
|    - score(Query, Doc B) -> 0.99   <-- correct intent         |
|    - score(Query, Doc A) -> 0.12   <-- rejected               |
|    - score(Query, Doc C) -> 0.05                              |
|                                                                |
| 4. LLM synthesis -> receives only Doc B                      |
+-------------------------------------------------------------+
```

## Bi-Encoder vs. Cross-Encoder

| Feature | Bi-Encoder (Stage 1) | Cross-Encoder (Stage 2) |
| :--- | :--- | :--- |
| Input structure | Query and document embedded separately | Query and document processed jointly, as one pair |
| Attention mechanism | No token-level cross-attention | Full token-level cross-attention |
| Inference cost | Very low (vectors precomputed, cached) | High (run on the fly for every candidate) |
| Latency | Sub-millisecond with an ANN index | Milliseconds per pair, $O(M)$ candidates |
| Use case | Searching millions of documents | Re-ranking the top 50–100 retrieved candidates |

Cross-Encoders scale $O(N)$ in the number of candidates they score, which is exactly why they are only ever applied to the small candidate pool Stage 1 already narrowed down — running a Cross-Encoder over an entire corpus would defeat the purpose of having a fast index at all.

## Implementation: A Complete Two-Stage Pipeline with Hugging Face `transformers`

```python
import torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification


class TwoStageRetriever:
    def __init__(self, bi_encoder_name: str, cross_encoder_name: str):
        # Stage 1: Bi-Encoder for embedding extraction
        self.bi_tokenizer = AutoTokenizer.from_pretrained(bi_encoder_name)
        self.bi_model = AutoModel.from_pretrained(bi_encoder_name)

        # Stage 2: Cross-Encoder for sequence-pair classification (re-ranking)
        self.cross_tokenizer = AutoTokenizer.from_pretrained(cross_encoder_name)
        self.cross_model = AutoModelForSequenceClassification.from_pretrained(cross_encoder_name)
        self.cross_model.eval()

    def _get_bi_embedding(self, text: str) -> torch.Tensor:
        inputs = self.bi_tokenizer(text, padding=True, truncation=True, return_tensors="pt")
        with torch.no_grad():
            outputs = self.bi_model(**inputs)
        embeddings = outputs.last_hidden_state.mean(dim=1)  # mean pooling
        return embeddings / torch.norm(embeddings, p=2, dim=-1, keepdim=True)

    def retrieve_candidates(self, query: str, documents: list[str], top_n: int = 5) -> list[dict]:
        """Stage 1: fast Bi-Encoder vector similarity."""
        query_vector = self._get_bi_embedding(query)
        candidates = []
        for idx, doc in enumerate(documents):
            doc_vector = self._get_bi_embedding(doc)
            similarity = torch.mm(query_vector, doc_vector.t()).item()
            candidates.append({"doc_id": idx, "text": doc, "bi_score": similarity})
        candidates.sort(key=lambda x: x["bi_score"], reverse=True)
        return candidates[:top_n]

    def rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Stage 2: Cross-Encoder joint scoring."""
        pairs = [[query, cand["text"]] for cand in candidates]
        inputs = self.cross_tokenizer(pairs, padding=True, truncation=True, return_tensors="pt")

        with torch.no_grad():
            logits = self.cross_model(**inputs).logits
            scores = torch.sigmoid(logits).squeeze(-1).tolist()

        if isinstance(scores, list) and isinstance(scores[0], list):
            scores = [s[1] for s in scores]  # multi-class model: take positive-match index

        for idx, score in enumerate(scores):
            candidates[idx]["cross_score"] = score

        candidates.sort(key=lambda x: x["cross_score"], reverse=True)
        return candidates


if __name__ == "__main__":
    BI_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    CROSS_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    retriever = TwoStageRetriever(BI_MODEL, CROSS_MODEL)

    corpus = [
        "Python decorators wrap existing functions to modify their behavior without editing their code.",
        "The black python is a highly venomous snake native to sub-Saharan Africa.",
        "To write clean code in Python, follow the official PEP 8 style guide conventions.",
        "Pythons are non-venomous constrictor snakes that kill prey by squeezing them.",
        "Type hints in Python allow static type checkers like mypy to validate your code structure.",
    ]

    query = "How to write clean python code?"

    initial_candidates = retriever.retrieve_candidates(query, corpus, top_n=3)
    print("--- Stage 1: Bi-Encoder candidates ---")
    for rank, cand in enumerate(initial_candidates, 1):
        print(f"Rank {rank} | Cosine {cand['bi_score']:.4f} | {cand['text']}")

    reranked = retriever.rerank(query, initial_candidates)
    print("\n--- Stage 2: Cross-Encoder re-ranked ---")
    for rank, cand in enumerate(reranked, 1):
        print(f"Rank {rank} | Rerank {cand['cross_score']:.4f} | {cand['text']}")
```

Popular Cross-Encoder options: `cross-encoder/ms-marco-MiniLM-L-6-v2` (open-source, self-hosted), or commercial reranking APIs like Cohere Rerank and Jina Reranker, both of which take a query and a candidate list and return scores without you hosting a model.

## Key Takeaways

- Bi-Encoders are fast because query and document embeddings are computed independently and compared with simple vector math — but that independence is exactly why they miss fine-grained intent differences (upgrade vs. cancel).
- Cross-Encoders process the query and document jointly through a transformer's self-attention, capturing token-level relevance the Bi-Encoder architecturally cannot.
- Cross-Encoders are too slow to run over an entire corpus — the standard pattern is Bi-Encoder retrieval for recall (top-50/100), Cross-Encoder re-ranking for precision (top-3/5).
- The added re-ranking latency is a worthwhile trade against the reduction in retrieval-caused hallucinations for most production RAG systems.
