# GraphRAG: Fusing Vector Search with Cypher Knowledge Graphs

**The Problem:** Vector databases are excellent at finding semantically similar text, but they are terrible at complex relational logic. If you ask a vector DB, "Which employees report to the manager of the person who wrote document X?", it will fail completely. Vector distance does not represent structural ontology.

**The Solution:** GraphRAG. By extracting entities and relationships from text into a Knowledge Graph (like Neo4j), we can traverse structured relationships using graph query languages (Cypher), while retaining vector embeddings on the nodes for semantic entry points.

### Architecture

```text
[Unstructured Data]
       |
       v
+--------------------------+
| LLM Entity Extraction    | (Extracts Nodes: Person, Org, Doc)
| & Relationship Mapping   | (Extracts Edges: REPORTS_TO, AUTHORED)
+--------------------------+
       |
       v
+--------------------------+
| Neo4j Graph Database     | <--- Nodes contain Vector Embeddings
+--------------------------+
       |
       v
[Query Time: GraphRAG]
1. Vector Search finds the starting Node.
2. Cypher Query traverses the graph from that Node.
3. Subgraph Context passed to LLM.
```

### Data Modeling

In Neo4j, a node might look like this:
```cypher
(:Person {
  name: "Alice",
  department: "Engineering",
  embedding: [0.12, -0.44, ...] // Vector representation of Alice's bio
}) -[:AUTHORED]-> (:Document {title: "Architecture v2"})
```

### Robust Implementation (Python w/ Neo4j & Langchain)

We will use a hybrid approach: find the starting node semantically, then traverse the graph structurally.

```python
from neo4j import GraphDatabase
import openai
import os

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password"))
embedder = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

def hybrid_graph_search(user_query: str):
    # 1. Embed the user query
    query_vector = embedder.embeddings.create(
        input=user_query, 
        model="text-embedding-3-small"
    ).data[0].embedding
    
    # 2. Hybrid Cypher Query
    # This query finds the semantically closest Person node, 
    # then traverses the graph to find their manager and the documents the manager authored.
    cypher_query = """
    CALL db.index.vector.queryNodes('person_bio_index', 1, $query_vector) 
    YIELD node AS start_person, score
    
    // Traverse structural relationships
    MATCH (start_person)-[:REPORTS_TO]->(manager:Person)
    MATCH (manager)-[:AUTHORED]->(doc:Document)
    
    RETURN start_person.name AS Employee, 
           manager.name AS Manager, 
           collect(doc.title) AS ManagerDocs
    """
    
    with driver.session() as session:
        result = session.run(cypher_query, query_vector=query_vector)
        records = [record.data() for record in result]
        
    # 3. Format context for LLM
    context = f"Graph Context:\n{records}"
    
    response = embedder.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "Answer based on the graph context."},
            {"role": "user", "content": f"Context: {context}\n\nQuestion: {user_query}"}
        ]
    )
    
    return response.choices[0].message.content
```

### When to use GraphRAG
Use GraphRAG when your data has high interconnectivity: legal contracts referencing other contracts, supply chain dependencies, or organizational hierarchies. It eliminates the hallucination of relationships that plagues pure vector RAG. The trade-off is the high upfront cost of extracting the graph ontology via LLMs before query time.
