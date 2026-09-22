# Advanced RAG: Boosting Recall with Cross-Encoder Re-Ranking

## The Problem: The Precision Limit of Bi-Encoders
Standard Retrieval-Augmented Generation (RAG) relies on **Bi-Encoders** to compute embeddings. A Bi-Encoder processes the user's query and the document chunks *independently* to generate two separate vectors. It then calculates the cosine similarity between them. 

Because the query and the document are never processed together, the model cannot capture deep semantic interactions (e.g., how the word "bank" in the query relates specifically to "river" vs "finance" in the document context). Bi-Encoders are incredibly fast and scalable (allowing offline indexing of millions of chunks) but suffer from a hard ceiling on precision, often returning irrelevant results for complex queries.

## Architecture: The Two-Stage Retrieve and Re-Rank Pipeline
To maximize both speed and precision, production RAG systems use a two-stage pipeline.

1. **Stage 1 (Retrieval):** A fast Bi-Encoder retrieves a large pool of candidate documents (e.g., Top 100) from the Vector Database using approximate nearest neighbor search.
2. **Stage 2 (Re-Ranking):** A **Cross-Encoder** processes the user query and the retrieved documents *simultaneously*. It concatenates them (e.g., `[CLS] Query [SEP] Document [SEP]`) and passes the unified string through a Transformer. 

By analyzing the query and document together through every self-attention layer, the Cross-Encoder perfectly captures lexical and semantic interplay, outputting a highly accurate relevance score. We then take the Top 5 from the re-ranked list to pass to the LLM.

```text
[ Two-Stage Re-Ranking Architecture ]

User Query: "How to reverse a linked list in Rust?"

+-------------------------+
| Stage 1: Bi-Encoder     | (Fast, Independent vectors)
| Vector DB Search        | 
+-------------------------+
           | Returns Top 100 Candidates
           v
+-------------------------+
| Stage 2: Cross-Encoder  | (Slow, Simultaneous Attention)
| Re-Ranker Model         | Attention(Query <--> Document)
+-------------------------+
           | Returns Top 5 Highly-Relevant Documents
           v
+-------------------------+
| Prompt Injection (LLM)  |
+-------------------------+
```

## Robust Implementation
Here is a Python implementation demonstrating the two-stage pipeline using the `sentence-transformers` library.

```python
from sentence_transformers import SentenceTransformer, CrossEncoder
from typing import List
import numpy as np

class ReRankingRAG:
    def __init__(self):
        # 1. Fast Bi-Encoder for Stage 1
        self.bi_encoder = SentenceTransformer('all-MiniLM-L6-v2')
        # 2. Highly precise Cross-Encoder for Stage 2
        self.cross_encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        self.corpus = []
        self.corpus_embeddings = None

    def ingest(self, documents: List[str]):
        self.corpus = documents
        self.corpus_embeddings = self.bi_encoder.encode(documents, convert_to_tensor=True)

    def retrieve_and_rerank(self, query: str, top_k_retrieve: int = 100, top_k_rerank: int = 5):
        # --- STAGE 1: Bi-Encoder Retrieval ---
        query_embedding = self.bi_encoder.encode(query, convert_to_tensor=True)
        
        # Calculate cosine similarity
        cos_scores = np.dot(query_embedding.numpy(), self.corpus_embeddings.numpy().T)
        
        # Get top 100 candidate indices
        top_100_idx = np.argsort(cos_scores)[-top_k_retrieve:][::-1]
        candidates = [self.corpus[i] for i in top_100_idx]
        
        # --- STAGE 2: Cross-Encoder Re-Ranking ---
        # Create pairs of [Query, Candidate]
        cross_inp = [[query, doc] for doc in candidates]
        
        # Cross-Encoder scores the pairs together
        cross_scores = self.cross_encoder.predict(cross_inp)
        
        # Sort candidates by their new Cross-Encoder score
        reranked_indices = np.argsort(cross_scores)[-top_k_rerank:][::-1]
        
        return [candidates[i] for i in reranked_indices]

# Usage
rag = ReRankingRAG()
# rag.ingest([...thousands of documents...])
# final_docs = rag.retrieve_and_rerank("What is cross-attention?")
```

## Strategic Takeaways
A pure Bi-Encoder vector search will eventually plateau in retrieval accuracy, regardless of the embedding model size. Implementing a Cross-Encoder re-ranking stage is the highest ROI architectural upgrade for a RAG pipeline. It leverages the speed of vector search to filter the noise, and the deep attention mechanics of cross-encoding to pinpoint the exact context required by the LLM.