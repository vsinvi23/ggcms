# Advanced RAG: Parent-Child Document Retrieval for Context Integrity

**The Problem:** Vector search forces a cruel compromise. If you use large chunks (e.g., 1000 tokens), the embeddings become diluted, and precision drops. If you use small chunks (e.g., 100 tokens), search precision skyrockets, but the LLM loses the surrounding context needed to synthesize a coherent answer.

**The Solution:** Parent-Child Retrieval (also known as Auto-Merging Retrieval or Small-to-Big Retrieval). We decouple the *search unit* from the *synthesis unit*. We embed and search against small, highly granular "child" chunks, but when a match is found, we pass the larger "parent" chunk (or the entire document section) to the LLM.

### Architecture

```text
[Document Ingestion]
      |
      v
+-------------+
| Parent Node | (e.g., Entire Section: 1500 tokens) -> Stored in Document Store
+-------------+
      |
      v
+-------------+ +-------------+ +-------------+
| Child 1     | | Child 2     | | Child 3     | (e.g., 200 tokens each)
+-------------+ +-------------+ +-------------+
       \               |               /
        \              |              /
         +--------------------------+
         | Embedded in Vector DB    |
         +--------------------------+

[Query Time]
User Query -> Matches [Child 2]
Router -> Retrieves [Parent Node] based on Child 2's metadata link
LLM Synthesis <- Provided [Parent Node] as context
```

### Data Modeling

The key to this pattern is relational metadata. Every child chunk in the vector database must carry a reference to its parent's UUID. 

```json
// Example Vector DB Payload for a Child Chunk
{
  "id": "child-8f3a-991b",
  "embedding": [0.01, -0.04, ...],
  "text": "The API rate limit is 100 requests per minute.",
  "metadata": {
    "parent_id": "parent-11a2-44cd",
    "chunk_index": 2
  }
}
```

### Robust Implementation (Python)

This implementation demonstrates the decoupling of the vector store (for search) and a key-value store (for retrieval).

```python
import uuid
from typing import List, Dict

class ParentChildRetriever:
    def __init__(self, embedding_model, vector_store, document_store):
        self.embedder = embedding_model
        self.vdb = vector_store       # Search indexes (Child chunks)
        self.doc_store = document_store # Key-Value store (Parent chunks)
        
    def index_document(self, text: str, parent_chunk_size=1000, child_chunk_size=200):
        # 1. Create Parent Chunk
        parent_id = str(uuid.uuid4())
        
        # In reality, use a recursive character splitter here
        parent_text = text[:parent_chunk_size] 
        self.doc_store.set(parent_id, parent_text)
        
        # 2. Create Child Chunks
        child_chunks = []
        for i in range(0, len(parent_text), child_chunk_size):
            child_text = parent_text[i:i+child_chunk_size]
            child_chunks.append({
                "id": str(uuid.uuid4()),
                "text": child_text,
                "metadata": {"parent_id": parent_id}
            })
            
        # 3. Embed and store children
        embeddings = self.embedder.embed([c["text"] for c in child_chunks])
        for c, emb in zip(child_chunks, embeddings):
            self.vdb.upsert(
                id=c["id"], 
                vector=emb, 
                metadata=c["metadata"]
            )

    def retrieve(self, query: str, top_k=3) -> List[str]:
        # 1. Embed query
        query_emb = self.embedder.embed(query)
        
        # 2. Search against HIGH PRECISION child chunks
        results = self.vdb.search(query_emb, top_k=top_k)
        
        # 3. Extract unique parent IDs
        parent_ids = list(set([res.metadata["parent_id"] for res in results]))
        
        # 4. Fetch HIGH CONTEXT parent chunks
        contexts = [self.doc_store.get(pid) for pid in parent_ids]
        
        return contexts
```

### Context Window Optimization

If multiple child chunks from the *same* parent match the query, the deduplication step (`set()`) prevents you from feeding redundant context to the LLM. The LLM receives the broad context once, drastically improving answer fidelity while minimizing token bloat.
