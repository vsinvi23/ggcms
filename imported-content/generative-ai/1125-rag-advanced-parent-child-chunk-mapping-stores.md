# Advanced RAG: Parent-Child Document Retrieval for Context Integrity

**The Problem:** Traditional Retrieval-Augmented Generation (RAG) pipelines chunk large documents into fixed-size texts (e.g., 500 tokens). This creates a fundamental trade-off: 
- **Small chunks** yield highly precise vector embeddings (better search match), but strip away the surrounding context the LLM needs to generate a coherent answer.
- **Large chunks** provide great context for the LLM but dilute the vector embedding, making them harder to find during the semantic search phase.

## The Parent-Child Retrieval Architecture
The solution is decoupling the chunk used for *search* from the chunk used for *synthesis*. This is achieved through the Parent-Child (or Small-to-Big) retrieval pattern.

```text
+-------------------+       +-----------------------+
|  Parent Document  | ----> | LLM Context Synthesis |
|  (e.g., 2000 tok) |       | (Rich context)        |
+-------------------+       +-----------------------+
         |                              ^
     Splits into                        | Returns Parent
         v                              | ID
+--------+--------+                     |
| Child1 | Child2 | ----> [ Vector DB ] +
| (250t) | (250t) |       (High Precision)
+--------+--------+
```

### How It Works
1. **Ingestion:** 
   - Parse the source file into large "Parent" documents (e.g., an entire section or a 2000-token block). Store these in a fast Document Store (like a NoSQL DB or in-memory key-value store) keyed by a unique `doc_id`.
   - Sub-divide each Parent into smaller "Child" chunks (e.g., 200-300 tokens).
   - Embed the Child chunks and store them in the Vector DB. Crucially, attach the `doc_id` of the Parent to the metadata of each Child.
2. **Retrieval:** 
   - Vector search the user query against the precise Child chunks.
   - Retrieve the top-K Child chunks.
   - Extract their `doc_id` metadata.
   - Fetch the full Parent documents from the Document Store using those IDs.
   - Feed the full Parent documents to the LLM.

## Implementation Details

We require two data stores: A Vector Store and a Document/KV Store. 

```python
import uuid
from typing import List

class ParentChildRetriever:
    def __init__(self, vector_store, doc_store, embedding_model):
        self.vector_store = vector_store
        self.doc_store = doc_store
        self.embedding_model = embedding_model

    def ingest(self, parent_text: str, child_chunks: List[str]):
        parent_id = str(uuid.uuid4())
        
        # 1. Store full context in KV Store
        self.doc_store.set(parent_id, parent_text)
        
        # 2. Store granular chunks in Vector DB with Parent ID
        metadata = [{"parent_id": parent_id} for _ in child_chunks]
        embeddings = self.embedding_model.embed(child_chunks)
        self.vector_store.upsert(
            texts=child_chunks, 
            embeddings=embeddings, 
            metadata=metadata
        )

    def retrieve(self, query: str, k=3) -> List[str]:
        query_vec = self.embedding_model.embed([query])[0]
        
        # Search against highly specific child chunks
        child_results = self.vector_store.search(query_vec, top_k=k)
        
        # De-duplicate parent IDs to avoid redundant context
        parent_ids = set([res.metadata['parent_id'] for res in child_results])
        
        # Fetch rich context
        return [self.doc_store.get(pid) for pid in parent_ids]
```

## Benefits and Edge Cases
- **Contextual Integrity:** The LLM gets the surrounding paragraphs, preventing misinterpretation of out-of-context quotes.
- **Handling Overlap:** When multiple child chunks point to the same parent, you deduplicate the parent IDs. This automatically handles cases where the answer spans the boundary of two child chunks.
- **Trade-off:** Passing large parent documents consumes more token bandwidth in the LLM prompt. You must balance the parent chunk size against your context window limit and cost constraints.