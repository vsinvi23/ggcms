# Advanced RAG: Boosting Recall with Cross-Encoder Re-Ranking

### The Problem: The Precision Bottleneck of Vector Search (Bi-Encoders)

Standard Retrieval-Augmented Generation (RAG) pipelines rely on **Bi-Encoders** to search and retrieve relevant documents. 

In a Bi-Encoder architecture (e.g., using OpenAI `text-embedding-3-small` or Hugging Face `all-MiniLM-L6-v2`), the database embeds the user's query and candidate documents independently into a shared vector space. During a query, the system uses fast vector mathematics (such as Cosine Similarity or Dot Product) to retrieve the top-$N$ matching documents.

```
Bi-Encoder (Fast, Approximate):
  Query -------> [Embedding Model] -------> Vector \
                                                    +---> Cosine Similarity (No Cross-Attention)
  Document ----> [Embedding Model] -------> Vector /

Cross-Encoder (Slow, High-Precision):
  [Query + Document] ---> [Joint Transformer Model] ---> Dense Token Cross-Attention ---> Relevance Score [0 to 1]
```

While Bi-Encoders are fast and scale well to millions of documents, they have a major limitation: **they do not support cross-attention between the query and the document during embedding generation**. 

Because the query and document vectors are calculated independently, the model cannot capture fine-grained semantic connections, keyword overlaps, or contextual nuances. This often leads to "false positives" at the top of the retrieval list—documents that are superficially similar in vector space but fail to answer the user's specific query.

---

### Technical Architectures

```
+---------------------------------------------------------------------------------------+
| Two-Stage Retrieval Pipeline (Bi-Encoder + Cross-Encoder Re-Ranker)                  |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|                                     User Query                                        |
|                                         |                                             |
|                                         v                                             |
|                        +----------------------------------+                           |
|                        | Stage 1: Vector Search Retrieval |                           |
|                        | (Fast Cosine Match over DB)      |                           |
|                        +----------------------------------+                           |
|                                         |                                             |
|                                         | Retrieves Top-100 Candidate Chunks          |
|                                         v                                             |
|                        +----------------------------------+                           |
|                        | Stage 2: Cross-Encoder Re-Ranker |                           |
|                        | (Computes Joint Query-Doc Attn)  |                           |
|                        +----------------------------------+                           |
|                                         |                                             |
|                                         | Re-scores and filters top candidates        |
|                                         v                                             |
|                        +----------------------------------+                           |
|                        | Top-5 High-Precision Chunks      |                           |
|                        | (Delivered to the LLM Context)   |                           |
|                        +----------------------------------+                           |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

To address this precision bottleneck, modern production RAG pipelines implement a **Two-Stage Retrieval Architecture**:

1. **Stage 1 (Retrieval):** A fast Bi-Encoder queries the vector database to retrieve a broad set of candidate documents (e.g., top 50 or 100 chunks). This ensures high recall at low latency.
2. **Stage 2 (Re-ranking):** A computationally heavier **Cross-Encoder** processes the user's query alongside each retrieved candidate document *together* as a single input pair: `[CLS] Query [SEP] Candidate Document [SEP]`. 

Because the Cross-Encoder processes both texts simultaneously, the transformer's self-attention mechanism can perform full, token-to-token cross-attention. This produces a highly accurate relevancy score (usually between 0 and 1). The orchestrator then re-ranks the candidates based on these scores and passes only the top-$K$ highest-precision chunks (e.g., top 3 or 5) to the LLM.

---

### Algorithmic Comparison: Bi-Encoders vs Cross-Encoders

| Feature / Metric | Bi-Encoder (Stage 1) | Cross-Encoder (Stage 2) |
| :--- | :--- | :--- |
| **Input Structure** | Processes query and document separately | Processes query and document jointly as a single pair |
| **Attention Mechanism** | No token-level cross-attention | Full token-level cross-attention |
| **Inference Cost** | Very low (vectors can be pre-computed) | High (must run model on-the-fly for every candidate) |
| **Latency** | Sub-millisecond ($O(\log N)$ with index) | Milliseconds per pair ($O(M)$ where $M$ is candidate count) |
| **Primary Use Case** | Searching millions of candidate documents | Re-ranking the top $50-100$ retrieved candidates |

---

### Implementation: A Two-Stage RAG Pipeline with Cross-Encoder Re-ranking

This Python script implements a complete, self-contained two-stage retrieval pipeline using Hugging Face's `transformers` library. It uses a Bi-Encoder for initial search and a Cross-Encoder to re-rank the candidates.

```python
import torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification

class TwoStageRetriever:
    def __init__(self, bi_encoder_name: str, cross_encoder_name: str):
        # Initialize Stage 1 Bi-Encoder (Embedding extraction)
        self.bi_tokenizer = AutoTokenizer.from_pretrained(bi_encoder_name)
        self.bi_model = AutoModel.from_pretrained(bi_encoder_name)
        
        # Initialize Stage 2 Cross-Encoder (Sequence Classification Re-ranker)
        self.cross_tokenizer = AutoTokenizer.from_pretrained(cross_encoder_name)
        self.cross_model = AutoModelForSequenceClassification.from_pretrained(cross_encoder_name)
        self.cross_model.eval()

    def _get_bi_embedding(self, text: str) -> torch.Tensor:
        inputs = self.bi_tokenizer(text, padding=True, truncation=True, return_tensors="pt")
        with torch.no_grad():
            outputs = self.bi_model(**inputs)
        # Perform mean pooling to get a single vector representation
        embeddings = outputs.last_hidden_state.mean(dim=1)
        return embeddings / torch.norm(embeddings, p=2, dim=-1, keepdim=True)

    def retrieve_candidates(self, query: str, documents: list[str], top_n: int = 5) -> list[dict]:
        """Stage 1: Uses fast vector similarity to retrieve candidate documents."""
        query_vector = self._get_bi_embedding(query)
        candidates = []
        
        for idx, doc in enumerate(documents):
            doc_vector = self._get_bi_embedding(doc)
            similarity = torch.mm(query_vector, doc_vector.t()).item()
            candidates.append({"doc_id": idx, "text": doc, "bi_score": similarity})
            
        # Sort by similarity descending
        candidates.sort(key=lambda x: x["bi_score"], reverse=True)
        return candidates[:top_n]

    def rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Stage 2: Applies Cross-Encoder token cross-attention to re-score candidates."""
        pairs = [[query, cand["text"]] for cand in candidates]
        
        # Tokenize joint pairs
        inputs = self.cross_tokenizer(pairs, padding=True, truncation=True, return_tensors="pt")
        
        with torch.no_grad():
            logits = self.cross_model(**inputs).logits
            # Apply sigmoid if the model outputs single-logit similarity scores
            scores = torch.sigmoid(logits).squeeze(-1).tolist()
            
        # If the model returns multi-class classification scores, extract index 1 (positive match)
        if isinstance(scores, list) and isinstance(scores[0], list):
            scores = [s[1] for s in scores]
            
        # Update scores in candidates list
        for idx, score in enumerate(scores):
            candidates[idx]["cross_score"] = score
            
        # Re-sort candidates based on the new Cross-Encoder score
        candidates.sort(key=lambda x: x["cross_score"], reverse=True)
        return candidates

# Verification Execution
if __name__ == "__main__":
    # Standard light weights for demonstration
    BI_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    CROSS_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    
    print("Loading models into memory...")
    retriever = TwoStageRetriever(BI_MODEL, CROSS_MODEL)
    
    # Mock Corpus containing documents with varying degrees of similarity
    corpus = [
        "Python decorators wrap existing functions to modify their behavior without editing their code.",
        "The black python is a highly venomous snake native to sub-Saharan Africa.",
        "To write clean code in Python, follow the official PEP 8 style guide conventions.",
        "Pythons are non-venomous constrictor snakes that kill prey by squeezing them.",
        "Type hints in Python allow static type checkers like mypy to validate your code structure."
    ]
    
    query = "How to write clean python code?"
    print(f"\nUser Query: '{query}'")
    
    # Stage 1: Fast Retrieval (Bi-Encoder)
    initial_candidates = retriever.retrieve_candidates(query, corpus, top_n=3)
    print("\n--- Stage 1: Top-3 Bi-Encoder Candidates ---")
    for step, cand in enumerate(initial_candidates, 1):
        print(f"Rank {step} | Doc ID: {cand['doc_id']} | Cosine Score: {cand['bi_score']:.4f} | Text: {cand['text']}")
        
    # Stage 2: High-Precision Re-ranking (Cross-Encoder)
    reranked_results = retriever.rerank(query, initial_candidates)
    print("\n--- Stage 2: Cross-Encoder Re-ranked Results ---")
    for step, cand in enumerate(reranked_results, 1):
        print(f"Rank {step} | Doc ID: {cand['doc_id']} | Rerank Score: {cand['cross_score']:.4f} | Text: {cand['text']}")
```

### Key Takeaway
Bi-Encoder vector search is excellent for fast, approximate retrieval over large datasets, but it lacks the token-level cross-attention needed for high-precision matching. Introducing a second-stage Cross-Encoder re-ranker allows production RAG pipelines to evaluate candidates with high semantic accuracy, maximizing retrieval quality while keeping processing latencies low.
