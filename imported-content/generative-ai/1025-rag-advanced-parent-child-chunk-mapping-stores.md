# Advanced RAG: Parent-Child Document Retrieval for Context Integrity

## The Problem: The Chunk Size Dilemma
Retrieval-Augmented Generation (RAG) relies on slicing large documents into smaller chunks, embedding them, and searching a vector database to find context relevant to a user's query. This introduces a fundamental contradiction:

1. **Small chunks** (e.g., 128 tokens) yield highly precise vector embeddings. A search for "interest rates" will perfectly match a 1-sentence chunk about interest rates. However, passing a 1-sentence chunk to an LLM removes all surrounding context, rendering the LLM unable to synthesize a complete answer.
2. **Large chunks** (e.g., 2048 tokens) provide excellent context to the LLM but dilute the embedding vector. A specific fact about "interest rates" gets averaged out by the other 2000 tokens of unrelated text, making it nearly impossible to retrieve accurately.

## Architecture: Parent-Child Chunk Mapping
Parent-Child Retrieval (often called Auto-Merging Retrieval) solves this by decoupling the *retrieved unit* from the *synthesis unit*.

We split the document twice:
1. **Parent Chunks**: Large, context-rich blocks (e.g., 1024 tokens).
2. **Child Chunks**: Small, highly-specific sub-blocks (e.g., 128 tokens) that hold a strict reference to their parent.

Only the *Child Chunks* are embedded and stored in the Vector Database. When a user queries the system, we perform a similarity search against the highly-precise child chunks. However, instead of passing the retrieved child chunks to the LLM, we look up their associated *Parent Chunks* in a Document Store and pass the parents to the LLM.

```text
[ Parent-Child Retrieval Architecture ]

Document (10,000 tokens)
   |
   +--> Parent Chunk A (1000 tokens)  <---+ (Passed to LLM)
   |      |                               |
   |      +-- Child A1 (128 tk) ---> [ Vector DB ]
   |      +-- Child A2 (128 tk) ---> [ Vector DB ]  <-- Match!
   |      +-- Child A3 (128 tk) ---> [ Vector DB ]
   |
   +--> Parent Chunk B (1000 tokens)
          |
          +-- Child B1 (128 tk) ---> [ Vector DB ]
```

## Robust Implementation
Here is a conceptual implementation using a Python dictionary as a simple Document Store to hold the parents, and a mock Vector DB for the children.

```python
import uuid
from typing import List, Dict

class ParentChildRetriever:
    def __init__(self, vector_db, embedding_model):
        self.vector_db = vector_db
        self.embedding_model = embedding_model
        self.doc_store: Dict[str, str] = {}  # Maps parent_id -> Parent Text

    def ingest_document(self, text: str):
        # 1. Split into large Parent Chunks
        parent_chunks = self._split_text(text, chunk_size=1024)
        
        for parent_text in parent_chunks:
            parent_id = str(uuid.uuid4())
            self.doc_store[parent_id] = parent_text
            
            # 2. Split Parent into small Child Chunks
            child_chunks = self._split_text(parent_text, chunk_size=128)
            
            # 3. Embed and store Children with a reference to the Parent
            for child_text in child_chunks:
                vector = self.embedding_model.embed(child_text)
                self.vector_db.insert(
                    vector=vector, 
                    metadata={"parent_id": parent_id, "text": child_text}
                )

    def retrieve(self, query: str, top_k=3) -> List[str]:
        query_vector = self.embedding_model.embed(query)
        
        # 1. Retrieve highly precise Child Chunks
        retrieved_children = self.vector_db.search(query_vector, top_k=top_k)
        
        # 2. Map back to Parent Chunks and deduplicate
        unique_parent_ids = set()
        for child in retrieved_children:
            unique_parent_ids.add(child.metadata["parent_id"])
            
        # 3. Return full context Parent Chunks
        return [self.doc_store[pid] for pid in unique_parent_ids]

    def _split_text(self, text: str, chunk_size: int) -> List[str]:
        # Mock splitting logic
        return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
```

## Strategic Takeaways
The Parent-Child architecture provides the best of both worlds: the high-resolution recall of small embeddings and the deep contextual synthesis of large context windows. By adding a simple key-value document store alongside the vector database, engineering teams can dramatically reduce RAG hallucination caused by context fragmentation.