# Advanced RAG: Parent-Child Document Retrieval for Context Integrity

**The Problem:** Standard Retrieval-Augmented Generation (RAG) pipelines chunk documents into fixed-size segments (e.g., 500 tokens) and embed them into a Vector Database. During retrieval, the exact chunk that matches the semantic query is pulled. However, small chunks lack the surrounding context required by the LLM to generate a coherent answer, while large chunks dilute the embedding density, reducing retrieval accuracy. 

## The Parent-Child Architecture

The Parent-Child (or Small-to-Big) retrieval pattern resolves this dichotomy by decoupling the *retrieved* unit from the *injected* unit. 

You index small, highly dense "Child" chunks for precise semantic searching. When a Child chunk hits, the system fetches and injects its larger "Parent" document into the LLM context.

```text
[ Source Document ]
      |
      v
+-------------------+
| Parent Document   | ---> (Stored in Document Store/KV DB)
| (ID: Doc_A)       |
+-------------------+
      |
      v (Split)
+---------+ +---------+ +---------+
| Child 1 | | Child 2 | | Child 3 | ---> (Embedded & Stored in Vector DB)
| ref:Doc_A| | ref:Doc_A| | ref:Doc_A|
+---------+ +---------+ +---------+

[ Query ] --> Matches Child 2 --> Lookup ref:Doc_A --> Return Parent Document
```

## Architectural Components

Implementing this requires two distinct storage layers:
1. **Vector Store:** Houses the embeddings of the Child chunks. It requires a metadata payload pointing to the Parent ID.
2. **Document Store (KV Store):** Houses the raw text of the Parent documents, indexed by Parent ID (e.g., Redis, MongoDB, or an in-memory dict).

## Implementation in Python

Here is a robust implementation using a hypothetical vector DB and an in-memory Document Store.

```python
import uuid

class ParentChildRetriever:
    def __init__(self, vector_store, embedding_model):
        self.vector_store = vector_store
        self.doc_store = {}
        self.embedding_model = embedding_model

    def add_document(self, text, parent_chunk_size=2000, child_chunk_size=250):
        # 1. Create Parent Chunk
        parent_id = str(uuid.uuid4())
        # In practice, use a proper text splitter (e.g., RecursiveCharacterTextSplitter)
        parent_text = text[:parent_chunk_size] 
        self.doc_store[parent_id] = parent_text

        # 2. Create Child Chunks from the Parent
        child_chunks = [
            parent_text[i:i+child_chunk_size] 
            for i in range(0, len(parent_text), child_chunk_size)
        ]

        # 3. Embed and store Children with metadata
        embeddings = self.embedding_model.embed(child_chunks)
        metadata = [{"parent_id": parent_id} for _ in child_chunks]
        
        self.vector_store.upsert(
            vectors=embeddings, 
            metadata=metadata, 
            texts=child_chunks
        )

    def retrieve(self, query, top_k=3):
        # 1. Embed query
        query_vector = self.embedding_model.embed([query])[0]
        
        # 2. Retrieve top Child chunks
        results = self.vector_store.search(query_vector, top_k=top_k)
        
        # 3. Map to Parent Documents (Deduplicated)
        parent_ids = set([res.metadata['parent_id'] for res in results])
        
        # 4. Fetch full context
        return [self.doc_store[pid] for pid in parent_ids]
```

## Variations of the Pattern

### 1. Hierarchical Splitting
The standard approach where the Parent is a large text block (2000 tokens) and Children are smaller paragraphs (200 tokens).

### 2. Summary-to-Document
Instead of chunking the parent into strings, an LLM is used to generate a concise summary of the Parent document. The *summary* becomes the Child chunk embedded in the Vector DB. This is extremely effective for multi-document research, where queries align better with high-level summaries than random paragraphs.

### 3. Question-to-Document (Hypothetical Questions)
An LLM generates a list of questions that the Parent document answers. These hypothetical questions are embedded as the Child chunks. When a user asks a query, they are mathematically matching against *another question* in vector space, which drastically increases cosine similarity scores compared to query-to-document matching.

By utilizing the Parent-Child pattern, developers maximize search recall through dense micro-embeddings while providing the LLM with the macro-context necessary to prevent hallucinations.
