---
title: "Enterprise RAG Architecture: Vector Search & Prompt Engineering"
description: "A comprehensive technical guide to building enterprise-grade Retrieval-Augmented Generation (RAG) platforms using recursive chunking, pgvector similarity search, hybrid BM25 search, prompt synthesis, and RAGAS evaluation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "large-language-models"
  - "retrieval-augmented-generation"
  - "prompt-engineering"
---

# Enterprise RAG Architecture: Vector Search & Prompt Engineering

Large Language Models (LLMs) such as Gemini 3.6 Flash or GPT-4 deliver incredible reasoning capabilities out of the box. However, when deployed in enterprise environments, standard LLMs encounter three severe architectural challenges:

1. **Knowledge Cutoff & Static Training Data**: Models cannot answer questions about internal company knowledge, live database records, or recent documentation.
2. **Hallucination Risk**: When asked about proprietary APIs or private business logic, LLMs frequently fabricate plausible-sounding but incorrect information.
3. **Context Window Costs & Access Control**: Feeding an entire enterprise wiki into every prompt is computationally prohibitive, insecure, and breaks data privacy rules.

**Retrieval-Augmented Generation (RAG)** solves these problems by dynamically retrieving relevant, contextually appropriate passages from internal knowledge stores and injecting them into the LLM's prompt at query time.

---

## 1. End-to-End RAG Architecture & Data Pipeline

An enterprise RAG system consists of two distinct data pipelines: **Ingestion (Offline)** and **Retrieval & Synthesis (Online)**.

```text
========================================================================================================
                                      OFFLINE INGESTION PIPELINE
========================================================================================================
 ┌──────────────┐      ┌───────────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
 │ Raw Docs     │ ───► │ Semantic Text         │ ───► │ Vector Embedding     │ ───► │ Vector Database  │
 │ (PDF, MD,    │      │ Chunking Strategy     │      │ Model (Gemini/BGE)   │      │ (pgvector /      │
 │ Webpages)    │      │ (500 tokens, 10% ovlp)│      │ 1536/768 Dimensions  │      │ Qdrant / HNSW)   │
 └──────────────┘      └───────────────────────┘      └──────────────────────┘      └──────────────────┘

========================================================================================================
                                      ONLINE RETRIEVAL PIPELINE
========================================================================================================
 ┌──────────────┐      ┌───────────────────────┐      ┌──────────────────────┐
 │ User Query   │ ───► │ Dense Vector Search   │ ───► │ Sparse Keyword       │
 │              │      │ (Cosine Similarity)   │      │ Search (BM25)        │
 └──────────────┘      └───────────┬───────────┘      └──────────┬───────────┘
                                   │                             │
                                   └──────────────┬──────────────┘
                                                  ▼
                                       ┌─────────────────────┐
                                       │ Reciprocal Rank     │ ──► Top-K Relevant Chunks
                                       │ Fusion (RRF)        │
                                       └──────────┬──────────┘
                                                  ▼
                                       ┌─────────────────────┐
                                       │ Cross-Encoder       │ ──► Top-N Re-Ranked Chunks
                                       │ Re-Ranker (Cohere)  │
                                       └──────────┬──────────┘
                                                  ▼
 ┌──────────────┐                      ┌─────────────────────┐
 │ Grounded     │ ◄─────────────────── │ LLM Prompt          │
 │ Answer       │                      │ Synthesizer         │
 └──────────────┘                      └─────────────────────┘
```

---

## 2. Document Ingestion & Advanced Chunking Strategies

The quality of a RAG system depends directly on how document source text is partitioned into smaller, searchable **chunks**.

### Chunking Strategies Matrix

| Strategy | Description | Best Used For | Trade-offs |
| :--- | :--- | :--- | :--- |
| **Fixed-Size Chunking** | Splits text every $N$ characters/tokens regardless of structure. | Simple text documents, quick prototypes. | May split sentences mid-thought, breaking semantic meaning. |
| **Recursive Character Chunking** | Splits hierarchically by paragraph (`\n\n`), sentence (`\n`), word (` `), and character (`""`). | Technical manuals, Markdown files, API specs. | **Recommended standard.** Preserves document layout structure. |
| **Semantic Chunking** | Computes sliding-window sentence embeddings and splits where distance spikes. | Narrative prose, long unstructured transcripts. | Computationally expensive ingestion step. |
| **Parent-Child Chunking** | Searches small sub-chunks (200 tokens) but passes parent section (1000 tokens) to LLM. | Dense technical manuals, code docs. | Requires complex relational metadata tracking. |

### Production Python Implementation: Metadata-Aware Recursive Chunking

```python
from typing import List, Dict, Any
import tiktoken

class DocumentChunker:
    def __init__(self, max_tokens: int = 500, overlap_tokens: int = 50):
        self.max_tokens = max_tokens
        self.overlap_tokens = overlap_tokens
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer.encode(text))

    def chunk_document(self, text: str, document_id: str, title: str) -> List[Dict[str, Any]]:
        paragraphs = text.split("\n\n")
        chunks = []
        current_chunk = []
        current_token_count = 0
        chunk_index = 0

        for para in paragraphs:
            para_tokens = self.count_tokens(para)
            
            if current_token_count + para_tokens > self.max_tokens:
                chunk_text = "\n\n".join(current_chunk)
                chunks.append({
                    "chunk_id": f"{document_id}#c{chunk_index}",
                    "document_id": document_id,
                    "title": title,
                    "chunk_index": chunk_index,
                    "token_count": current_token_count,
                    "text": chunk_text
                })
                chunk_index += 1
                
                # Keep last paragraph for context overlap
                current_chunk = [current_chunk[-1]] if current_chunk else []
                current_token_count = self.count_tokens("\n\n".join(current_chunk))

            current_chunk.append(para)
            current_token_count += para_tokens

        if current_chunk:
            chunks.append({
                "chunk_id": f"{document_id}#c{chunk_index}",
                "document_id": document_id,
                "title": title,
                "chunk_index": chunk_index,
                "token_count": current_token_count,
                "text": "\n\n".join(current_chunk)
            })

        return chunks
```

---

## 3. Vector Database Indexing with PostgreSQL `pgvector`

PostgreSQL equipped with the `pgvector` extension provides a powerful relational + vector database engine, eliminating the need to manage external standalone vector clusters for medium-to-large workloads.

### PostgreSQL `pgvector` Table Schema & HNSW Indexing

```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document chunks table with 1536-dimensional embeddings (e.g. OpenAI text-embedding-3-small)
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category_slug VARCHAR(64) NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create HNSW (Hierarchical Navigable Small World) index for fast Cosine similarity search
CREATE INDEX idx_document_chunks_hnsw_cosine 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create GIN index on content for sparse full-text keyword search
CREATE INDEX idx_document_chunks_fts 
ON document_chunks 
USING gin (to_tsvector('english', content));
```

### PostgreSQL Vector Similarity Search Query

```sql
-- Fast Top-K Cosine Similarity Search using <=> operator
SELECT 
    id,
    title,
    content,
    1 - (embedding <=> $1::vector) AS cosine_similarity
FROM document_chunks
WHERE category_slug = $2 -- Pre-retrieval metadata filtering
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

---

## 4. Hybrid Search (BM25 + Dense Vectors) & Reciprocal Rank Fusion

Dense vector embeddings excel at capturing semantic similarity (e.g., matching "laptop" with "notebook"). However, they struggle with exact technical terms, error codes (`ERR-9012`), and specific function names (`SanitizeLLMOutput`).

**Hybrid Search** combines sparse keyword search (BM25) and dense vector similarity search using **Reciprocal Rank Fusion (RRF)**:

$$\text{RRF\_Score}(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$

where $k = 60$ (smoothing constant) and $r_m(d)$ is document $d$'s rank position in retrieval method $m$.

### Python Hybrid RRF Implementation

```python
def reciprocal_rank_fusion(
    dense_results: List[Dict[str, Any]], 
    sparse_results: List[Dict[str, Any]], 
    top_k: int = 5, 
    k: int = 60
) -> List[Dict[str, Any]]:
    scores: Dict[str, float] = {}
    doc_map: Dict[str, Dict[str, Any]] = {}

    # Process Dense Vector Ranks
    for rank, doc in enumerate(dense_results, start=1):
        doc_id = doc["id"]
        doc_map[doc_id] = doc
        scores[doc_id] = scores.get(doc_id, 0.0) + (1.0 / (k + rank))

    # Process Sparse BM25 Ranks
    for rank, doc in enumerate(sparse_results, start=1):
        doc_id = doc["id"]
        doc_map[doc_id] = doc
        scores[doc_id] = scores.get(doc_id, 0.0) + (1.0 / (k + rank))

    # Sort documents by accumulated RRF score descending
    sorted_doc_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    
    reranked = []
    for doc_id in sorted_doc_ids[:top_k]:
        item = doc_map[doc_id].copy()
        item["rrf_score"] = scores[doc_id]
        reranked.append(item)

    return reranked
```

---

## 5. RAG Prompt Synthesis & Grounded Output Template

Injecting retrieved context into system prompts requires clear boundaries to prevent the LLM from ignoring system guidelines.

```markdown
System Prompt:
You are an expert AI Technical Assistant for GeekGully.
Your role is to answer user technical inquiries strictly based on the retrieved context chunks below.

Rules:
1. Base your answer ONLY on the provided context passages. Do NOT rely on outside training knowledge.
2. If the answer cannot be determined from the context, state: "I cannot find the answer in the provided knowledge base."
3. Include code examples where appropriate.
4. Cite the source document title when asserting key technical facts.

# CONTEXT PASSAGES:
{% for chunk in context_chunks %}
---
Passage ID: [{{ chunk.title }} - Chunk #{{ chunk.chunk_index }}]
Content:
{{ chunk.content }}
{% endfor %}

# USER QUESTION:
{{ user_query }}

# RESPONSE:
```

---

## 6. Complete End-to-End RAG System Implementation in Python

```python
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import google.generativeai as genai

class ProductionRAGPipeline:
    def __init__(self, db_uri: str, gemini_api_key: str):
        self.conn = psycopg2.connect(db_uri)
        genai.configure(api_key=gemini_api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def generate_query_embedding(self, query: str) -> list:
        res = genai.embed_content(
            model="models/text-embedding-004",
            content=query
        )
        return res['embedding']

    def retrieve_context(self, query: str, top_k: int = 3) -> list:
        query_vector = self.generate_query_embedding(query)
        
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Execute Hybrid Vector + Keyword query via pgvector and FTS
            cur.execute("""
                WITH vector_matches AS (
                    SELECT id, title, content, 1 - (embedding <=> %s::vector) AS sim,
                           ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) AS rank
                    FROM document_chunks
                    LIMIT 20
                ),
                fts_matches AS (
                    SELECT id, title, content, ts_rank(to_tsvector('english', content), plainto_tsquery('english', %s)) AS rank_score,
                           ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', %s)) DESC) AS rank
                    FROM document_chunks
                    WHERE to_tsvector('english', content) @@ plainto_tsquery('english', %s)
                    LIMIT 20
                )
                SELECT COALESCE(v.id, f.id) AS id,
                       COALESCE(v.title, f.title) AS title,
                       COALESCE(v.content, f.content) AS content,
                       (COALESCE(1.0 / (60 + v.rank), 0.0) + COALESCE(1.0 / (60 + f.rank), 0.0)) AS rrf_score
                FROM vector_matches v
                FULL OUTER JOIN fts_matches f ON v.id = f.id
                ORDER BY rrf_score DESC
                LIMIT %s;
            """, (query_vector, query_vector, query, query, query, top_k))
            
            return cur.fetchall()

    def answer_question(self, user_query: str) -> str:
        chunks = self.retrieve_context(user_query, top_k=3)
        
        context_str = "\n\n".join([
            f"--- Document: {c['title']} ---\n{c['content']}" for c in chunks
        ])

        prompt = f"""You are an enterprise AI assistant. Answer the user question based strictly on the context below.

Context:
{context_str}

User Question:
{user_query}
"""
        response = self.model.generate_content(prompt)
        return response.text
```

---

## 7. Quality Evaluation with RAGAS Framework

Evaluating RAG performance requires automated metrics beyond manual spot-checking. The **RAGAS** framework evaluates three key component metrics:

```text
               ┌────────────────────────────────────────────────────────┐
               │                     RAGAS Triad                        │
               ├───────────────────┬────────────────────────────────────┤
               │ Faithfulness      │ Is the LLM answer grounded strictly│
               │                   │ in retrieved context?              │
               │ Answer Relevance  │ Does the LLM answer address the    │
               │                   │ user's explicit request?           │
               │ Context Precision │ Are retrieved chunks relevant to   │
               │                   │ the query without noisy fluff?     │
               └───────────────────┴────────────────────────────────────┘
```

---

## 8. Key Takeaways

1. **Always Use Hybrid Search**: Combining BM25 keyword matching with dense vectors prevents retrieval failures on exact technical IDs and symbols.
2. **Metadata Pre-filtering is Essential**: Filter by `categorySlug` or permissions before vector similarity computation to improve search accuracy and performance.
3. **Keep Chunk Sizes Between 400-800 Tokens**: Large chunks dilute semantic focus, while tiny chunks lose paragraph-level context.
