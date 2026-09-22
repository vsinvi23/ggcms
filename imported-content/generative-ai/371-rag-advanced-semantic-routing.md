# Advanced RAG: Semantic Routing and Intent Classification

**The Problem:** Standard RAG pipelines treat every query as a nail and vector search as a hammer. If a user asks, "Summarize the document," doing a chunk-level top-K vector search returns isolated fragments, resulting in a fractured, incoherent summary.

**The Solution:** Semantic Routing. Before hitting the vector database, we classify the user's intent. Based on that intent, we dynamically route the request to the optimal retrieval strategy (e.g., standard RAG, SQL database query, full document summary, or a web search).

### Architecture

```text
                      +-------------------+
                      |   User Query      |
                      +-------------------+
                               |
                               v
                      +-------------------+
                      | Semantic Router   | (LLM or Embedding + Threshold)
                      +-------------------+
                        /       |        \
            [SQL Intent]     [RAG]      [Summarization]
                /               |              \
        +-----------+    +-------------+   +------------------+
        | Text2SQL  |    | Vector DB   |   | Map-Reduce Chain |
        +-----------+    +-------------+   +------------------+
```

### Implementing the Router

Semantic routing can be achieved in two ways:
1. **Embedding similarity (Fast/Cheap):** Compare the user's query against pre-defined utterance embeddings ("What's my balance?", "Search the docs").
2. **LLM Classification (Accurate/Flexible):** Use an LLM with structured outputs to categorize the query based on descriptions. 

We will implement the LLM Classification approach, as it scales better with complex, nuanced queries.

### Robust Implementation (Python)

Using Pydantic and an LLM client, we force the model to output a specific route enum.

```python
from pydantic import BaseModel, Field
from enum import Enum
import openai
import os

client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

# 1. Define strict routes
class Route(str, Enum):
    ANALYTICS = "analytics"     # Route to Text-to-SQL
    DOCUMENT_QA = "document_qa" # Route to Vector Database
    CHITCHAT = "chitchat"       # Route to generic LLM response
    SUMMARY = "summary"         # Route to document Map-Reduce

class IntentRouter(BaseModel):
    reasoning: str = Field(description="Step-by-step logic for picking the route.")
    route: Route = Field(description="The chosen execution route.")

def route_query(query: str) -> Route:
    system_prompt = """
    You are an intent classification router for an enterprise RAG system.
    Analyze the user query and select the most appropriate route.
    
    Routes:
    - analytics: Queries involving numbers, counts, tabular data, or SQL.
    - document_qa: Specific questions about facts inside company PDFs.
    - summary: Requests for high-level overviews of entire documents.
    - chitchat: Greetings, jokes, or queries not requiring internal data.
    """
    
    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ],
        response_format=IntentRouter,
        temperature=0.0
    )
    
    decision = response.choices[0].message.parsed
    print(f"Router reasoning: {decision.reasoning}")
    return decision.route

# Example Execution Engine
def execute_pipeline(query: str):
    target_route = route_query(query)
    
    if target_route == Route.DOCUMENT_QA:
        return run_vector_search_pipeline(query)
    elif target_route == Route.ANALYTICS:
        return run_text_to_sql_pipeline(query)
    elif target_route == Route.SUMMARY:
        return run_document_summarizer(query)
    else:
        return run_generic_llm(query)
```

### Why This Matters
If a user asks "How many users joined last week?", a vector database will return text chunks that happen to contain the words "users" and "last week"—which is entirely useless for answering the question. Semantic routing detects the quantitative intent, routes to the `ANALYTICS` path, generating `SELECT COUNT(*) FROM users...` instead. This is the foundational layer of building an advanced, multi-modal RAG system capable of handling real-world entropy.
