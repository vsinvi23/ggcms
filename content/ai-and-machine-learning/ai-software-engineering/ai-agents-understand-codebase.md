---
title: "How AI Coding Agents Understand an Entire Codebase"
description: "How agents combine tree-sitter-based semantic chunking, vector embeddings, and AST-derived call graphs to build a surgical context window over repositories too large to fit in any prompt."
categorySlug: "ai-software-engineering"
articleType: "GUIDE"
tags:
  - "codebase-indexing"
  - "vector-databases"
  - "abstract-syntax-tree"
  - "code-search"
  - "ai-coding-agents"
---

# How AI Coding Agents Understand an Entire Codebase

Modern codebases often span hundreds of thousands of lines across thousands of directories. This scale presents a fundamental challenge for AI systems: a language model's context window is finite, expensive, and subject to attention degradation when overloaded. If an agent attempts to ingest a repository raw, it runs out of memory. If it relies solely on basic keyword search, it misses critical code dependencies. To solve this, advanced agents use a hybrid approach that combines semantic vector databases with structural syntax tree graph traversals.

## The Problem: The Pitfalls of Naive Search

When asked to resolve a bug or implement a feature, an agent must locate relevant code segments. Traditional search techniques fall short:

- **Keyword Search**: Fails to match conceptually similar terms (e.g., searching "charge_card" will miss "process_billing").
- **Naive Vector Search (RAG)**: Chunks code by raw line count, splitting class declarations in half and losing local variable scopes. Furthermore, vector distance (like cosine similarity) only measures semantic proximity; it cannot follow call-graphs or identify type definitions across files.

## The Mental Model: Hybrid Codebase Representation

To understand a workspace comprehensively, an agent builds a multi-dimensional index. It combines spatial semantics with relational structures:

```text
                       Raw Source Code
                              │
             ┌────────────────┴────────────────┐
             ▼ (AST Parsing)                    ▼ (Semantic Chunking)
   ┌────────────────────────────┐     ┌────────────────────────────┐
   │  Syntax Tree Graph          │     │  Vector Database & Embeds  │
   │  Traverser                  │     │                             │
   │  - Traces callers/callees   │     │  - Stores high-level intent │
   │  - Resolves class hierarchies│     │  - Searches conceptually    │
   │  - Finds imports/type specs │     │  - Uses cosine similarity   │
   └──────────────┬──────────────┘     └──────────────┬──────────────┘
                  │                                    │
                  └─────────────────┬──────────────────┘
                                    ▼
                       ┌─────────────────────────┐
                       │   Unified Query Engine   │
                       │  Combines semantics &    │
                       │  topology                │
                       └────────────┬────────────┘
                                    ▼
                       ┌─────────────────────────┐
                       │  Surgical LLM Prompt     │
                       │  Context                 │
                       └─────────────────────────┘
```

## Deep Technical Architecture

### 1. Vector Indexes and Semantic Code Chunking

Instead of splitting code at arbitrary character lengths, agents use syntax-aware chunkers. They parse files using tools like tree-sitter, slicing code along class or function boundaries. Each chunk is accompanied by its fully qualified path and structural signature. These blocks are converted into vectors using specialized code embedding models (such as `text-embedding-3-large`) and stored in a vector database:

$$\text{Cosine Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$

Semantic search answers: *"Where do we process credit card webhooks?"*

### 2. Relational AST Indexing and Graph Traversals

To answer *"Who uses this webhook database model?"*, vector search is insufficient. The agent parses the workspace into an Abstract Syntax Tree to build a workspace-wide dependency graph. In this graph:

- **Nodes** represent structural components: Functions, Classes, and Modules.
- **Edges** represent semantic relations: `CALLS`, `INHERITS_FROM`, `DEFINES_TYPE`, and `IMPORTS`.

By traversing this graph, an agent starting from a webhook function can trace its callers, identify the parent class, and retrieve dependent configuration files.

### 3. Unified Context Synthesis

When executing a task, the query engine runs a semantic search to identify entry-point files. It then performs multi-hop graph traversals from those entry points to pull in class interfaces, function signatures, and types. It constructs a surgical prompt context that contains exactly what the LLM needs to know, minimizing token bloat.

## Concrete Implementation: Building a Code Symbol Graph

The following Python program parses a file using `ast` to build a lightweight symbol call-and-definition graph, allowing you to query dependencies programmatically.

```python
import ast
from collections import defaultdict
from typing import List, Set, Dict

class SymbolGraphBuilder(ast.NodeVisitor):
    def __init__(self):
        self.defined_functions: Set[str] = set()
        self.call_graph: Dict[str, List[str]] = defaultdict(list)
        self.current_function: str = "global"

    def visit_FunctionDef(self, node: ast.FunctionDef):
        previous_function = self.current_function
        self.current_function = node.name
        self.defined_functions.add(node.name)

        # Traverse the body of the function
        self.generic_visit(node)

        self.current_function = previous_function

    def visit_Call(self, node: ast.Call):
        # Identify the function name being called
        if isinstance(node.func, ast.Name):
            caller = self.current_function
            callee = node.func.id
            self.call_graph[caller].append(callee)
        self.generic_visit(node)

# Example original codebase parsing
source_code = """
def initialize_database():
    connect_to_db()

def fetch_user_data(user_id):
    initialize_database()
    return db_query(user_id)

def get_profile(user_id):
    data = fetch_user_data(user_id)
    return format_profile(data)
"""

# Parse and build graph
tree = ast.parse(source_code)
builder = SymbolGraphBuilder()
builder.visit(tree)

print("Symbols Defined:")
print(builder.defined_functions)

print("\nCall Graph Adjacency List:")
for caller, callees in builder.call_graph.items():
    print(f"  {caller} -> {callees}")
```

Running this against the sample source prints:

```text
Symbols Defined:
{'initialize_database', 'fetch_user_data', 'get_profile'}

Call Graph Adjacency List:
  initialize_database -> ['connect_to_db']
  fetch_user_data -> ['initialize_database', 'db_query']
  get_profile -> ['fetch_user_data', 'format_profile']
```

That adjacency list is exactly the structural signal a vector search alone cannot produce: it tells the agent that touching `initialize_database` has a blast radius reaching `fetch_user_data` and, transitively, `get_profile` — information only a graph traversal over the AST can supply.

## Key Takeaways

- Raw ingestion of a whole repository into a context window fails on scale; keyword search fails on semantics; naive line-based vector chunking fails on structure — each solves a different, partial problem.
- Semantic chunking (tree-sitter-aware, split at function/class boundaries) plus embedding search answers "where is the code that does X conceptually."
- AST-derived call graphs (`CALLS`, `INHERITS_FROM`, `IMPORTS` edges) answer "who depends on this," which vector similarity structurally cannot.
- A unified query engine that combines both — semantic search for entry points, graph traversal for dependencies — builds the surgical, token-efficient context an LLM prompt actually needs.
