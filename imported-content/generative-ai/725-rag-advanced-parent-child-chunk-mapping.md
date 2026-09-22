# Advanced RAG: Parent-Child Document Retrieval for Context Integrity

### The Problem: The Chunk Size Dilemma in Standard RAG

Standard Retrieval-Augmented Generation (RAG) pipelines split documents into uniform, fixed-size chunks (e.g., 256 or 512 tokens) before indexing them in a vector database. This introduces a fundamental engineering trade-off:

```
Standard RAG Conflict:
  Small Chunks (128 tokens) -> High vector search accuracy, but loses surrounding narrative context.
  Large Chunks (1024 tokens) -> Preserves context, but dilutes vector representation and degrades retrieval recall.
```

If we use **small chunks**, our vector embeddings are highly focused, leading to excellent retrieval similarity and high precision. However, these small snippets often lack the surrounding context (such as section headers, introductory definitions, or core arguments) needed for the LLM to generate a complete and accurate answer.

If we use **large chunks**, we preserve context, but the embedding vectors represent multiple concepts simultaneously. This dilutes the vector's semantic focus, reduces cosine similarity scores for specific queries, and increases the likelihood of retrieving irrelevant noise.

---

### Technical Architectures

```
+-------------------------------------------------------------------------------+
| Parent-Child Chunk Mapping Architecture                                       |
+-------------------------------------------------------------------------------+
|                                                                               |
|                               Raw Source Doc                                  |
|                                      |                                        |
|                          Split into Large Sections                            |
|                                      v                                        |
|                       +-------------------------------+                       |
|                       |   Parent Chunk (1024 tokens)  |                       |
|                       +-------------------------------+                       |
|                                  /       \                                    |
|              Generate Small Sub-Chunks   Map child-to-parent IDs              |
|                             /                 \                               |
|                            v                   v                              |
|               +------------------+       +------------------+                 |
|               | Child 1 (256 tok)|       | Child 2 (256 tok)|                 |
|               +------------------+       +------------------+                 |
|                        |                           |                          |
|                        \                           /                          |
|                         v                         v                           |
|                      [Index Child Chunks in Vector DB]                        |
|                                      |                                        |
|                                      | Query Matches Child 2                  |
|                                      v                                        |
|                     [Fetch Parent ID from Child Metadata]                     |
|                                      |                                        |
|                                      v                                        |
|                       +-------------------------------+                       |
|                       | Retrieve Parent (1024 tokens) |                       |
|                       +-------------------------------+                       |
|                                      |                                        |
|                                      v                                        |
|                      [Feed Parent Chunk to LLM Prompt]                        |
|                                                                               |
+-------------------------------------------------------------------------------+
```

The **Parent-Child Document Retrieval** pattern resolves this conflict by separating the data used for *retrieval* from the data used for *generation*.

1. **Hierarchy Generation:** Split incoming documents into large, contextually complete parent chunks (e.g., 1024 to 2048 tokens).
2. **Sub-chunking:** Split each parent chunk into multiple smaller child chunks (e.g., 128 to 256 tokens).
3. **Database Mapping:** Index the child chunks in the vector database to ensure high-precision similarity matches. Each child chunk's metadata stores a direct reference back to its parent chunk's identifier (`parent_id`).
4. **Context Retrieval:** During a query, the vector database finds the most relevant child chunks. Instead of feeding those child chunks directly to the LLM, the orchestrator retrieves their corresponding parent chunks from document storage and injects them into the prompt. This provides the LLM with complete, high-integrity context for generation.

---

### Comparison of Retrieval Chunk Strategies

| Strategy | Search Precision | Generation Context Integrity | VRAM / Context Token Usage |
| :--- | :--- | :--- | :--- |
| **Naive Chunking** | Moderate | Poor (chopped up sentences) | Very low |
| **Large-only Chunking**| Poor (diluted vectors)| Moderate | High (includes noisy text) |
| **Parent-Child Mapping**| **Excellent** | **Excellent** | Controlled (precise parent retrieval) |

---

### Implementation: Building a Parent-Child Document Store from Scratch

This Python script implements an in-memory parent-child document store. It simulates embedding and query matching to show how child-level similarity retrieves parent-level context.

```python
import numpy as np
from typing import Dict, List, Any

# Simple mock embedding generator for demonstration
def mock_embed(text: str) -> np.ndarray:
    """Generates a deterministic mock embedding vector based on character hashes."""
    np.random.seed(abs(hash(text)) % (2**31))
    vec = np.random.randn(8)
    return vec / np.linalg.norm(vec)

class ParentChildDocStore:
    def __init__(self):
        # Key: parent_id, Value: raw text
        self.parent_store: Dict[str, str] = {}
        # List of child chunk records
        self.child_store: List[Dict[str, Any]] = []

    def add_document(self, parent_text: str, child_texts: List[str], doc_idx: int):
        """Saves parent document and indexes its associated child sub-chunks."""
        parent_id = f"parent_{doc_idx}"
        self.parent_store[parent_id] = parent_text
        
        for sub_idx, child_text in enumerate(child_texts):
            child_vector = mock_embed(child_text)
            self.child_store.append({
                "child_id": f"child_{doc_idx}_{sub_idx}",
                "parent_id": parent_id,
                "text": child_text,
                "vector": child_vector
            })

    def retrieve(self, query: str, top_k: int = 1) -> List[Dict[str, Any]]:
        """Retrieves the full parent document corresponding to the matching child chunk."""
        query_vector = mock_embed(query)
        scored_children = []
        
        # Calculate cosine similarity manually for matching
        for child in self.child_store:
            similarity = np.dot(query_vector, child["vector"])
            scored_children.append((similarity, child))
            
        # Sort by similarity score descending
        scored_children.sort(key=lambda x: x[0], reverse=True)
        
        results = []
        retrieved_parents = set()
        
        for score, child in scored_children:
            parent_id = child["parent_id"]
            # Avoid duplicate parent retrievals
            if parent_id not in retrieved_parents:
                retrieved_parents.add(parent_id)
                results.append({
                    "score": score,
                    "matched_child_text": child["text"],
                    "parent_text": self.parent_store[parent_id],
                    "parent_id": parent_id
                })
                if len(results) >= top_k:
                    break
                    
        return results

# Verification Execution
if __name__ == "__main__":
    # Initialize our relational document store
    store = ParentChildDocStore()
    
    # Document 1: Advanced Kubernetes Scheduling Architecture
    parent_doc_1 = (
        "Kubernetes schedulers assign pods to nodes based on resource requests and limits. "
        "The scheduling pipeline consists of two primary phases: Filtering (predicates) and Scoring (priorities). "
        "During filtering, the scheduler identifies the set of nodes that satisfy the pod's constraints, "
        "such as nodeSelectors, taints and tolerations, and affinity rules. "
        "In the scoring phase, it ranks the surviving nodes to find the optimal fit."
    )
    # Focused sub-chunks (children) for Document 1
    children_doc_1 = [
        "Kubernetes schedulers assign pods to nodes based on resource requests.",
        "The scheduling pipeline consists of Filtering and Scoring phases.",
        "Filtering identifies nodes satisfying taints and tolerations constraints."
    ]
    
    store.add_document(parent_doc_1, children_doc_1, doc_idx=1)
    
    # Document 2: Docker Container Security Best Practices
    parent_doc_2 = (
        "Securing container runtimes is critical in multi-tenant cloud environments. "
        "Always run containers as a non-root user by declaring a securityContext in your configuration. "
        "Additionally, drop unneeded Linux capabilities (such as CAP_SYS_ADMIN) to prevent kernel exploits. "
        "Use read-only root filesystems and limit resources using cgroups to mitigate Denial of Service attacks."
    )
    # Focused sub-chunks (children) for Document 2
    children_doc_2 = [
        "Always run containers as a non-root user via securityContext.",
        "Drop unnecessary Linux capabilities like CAP_SYS_ADMIN to prevent exploits.",
        "Use read-only root filesystems and cgroups limit rules."
    ]
    
    store.add_document(parent_doc_2, children_doc_2, doc_idx=2)
    
    # Run a targeted query focusing on a specific concept
    query_text = "What linux capability flags should I drop for containers?"
    print(f"Querying: '{query_text}'")
    
    retrieval = store.retrieve(query_text, top_k=1)[0]
    
    print(f"\nMatched Child Chunk (Score: {retrieval['score']:.4f}):\n--> {retrieval['matched_child_text']}")
    print(f"\nRetrieved Parent Context for LLM Prompts:\n--> {retrieval['parent_text']}")
```

### Key Takeaway
By decoupling the unit of retrieval (focused child chunks) from the unit of generation (context-rich parent documents), parent-child chunk mapping bypasses the typical chunk-size trade-off. This advanced RAG architecture provides high search precision without sacrificing context integrity, helping to prevent hallucinations in production systems.
