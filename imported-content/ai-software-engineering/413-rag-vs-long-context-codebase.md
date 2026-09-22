# RAG vs Long Context: How Should AI Understand Your Codebase?

## The Problem: The Cognitive Overload of Code repositories
When building AI assistants to help navigate, refactor, or debug enterprise codebases, engineers face a core design decision: How should the LLM access the codebase? A modern software repository consists of thousands of files, deeply nested directory structures, complex dependency graphs, and multi-layered type definitions. 

Simply dropping the entire codebase (e.g., 500,000 lines of code, roughly 2 million tokens) into a massive context window of a modern LLM (like Gemini 1.5 Pro or Claude 3.5 Sonnet) is tempting. However, this brute-force approach introduces substantial drawbacks: high API latency, massive token consumption costs, and the "needle in a haystack" retrieval degradation where the model ignores critical details hidden in the middle of a massive context. 

Conversely, naive Retrieval-Augmented Generation (RAG)—which splits code files into uniform 500-token chunks and performs cosine similarity matching—fails to capture structural dependencies, class inheritance trees, and cross-file import paths. Developers are left with a stark choice: pay high fees for long-context brute force, or tolerate low-precision answers from traditional RAG.

## Architectural Design: Hybrid Abstract Syntax Tree (AST) RAG
The solution is a hybrid, AST-aware codebase indexer. This architecture blends semantic vector search with structural graph traversal, extracting only the relevant files and their corresponding type references before feeding them to the LLM.

```
       +------------------+
       |   User Query     |
       +------------------+
                |
                v
  +---------------------------+
  |  Vector DB Semantic Search| ---> Retrieve Top-K Target Functions/Files
  +---------------------------+
                |
                | (Extract AST & Imports)
                v
  +---------------------------+
  | Dependency Graph Traversal| ---> Trace classes, types, and definitions
  +---------------------------+
                |
                v
  +---------------------------+
  |  Dynamic Prompt Assembler | ---> Inject structural code context (Min. Cost)
  +---------------------------+
                |
                v
           +----------+
           |   LLM    |
           +----------+
```

This pipeline optimizes codebase representation:
1. **Semantic Hit:** Finds the direct code snippets matching the developer's functional query.
2. **Structural Expansion:** Leverages AST parsing to resolve and inject imports, parent class definitions, or method signatures.
3. **Budgeted Injection:** Packs the exact logical call-graph into a compact prompt context.

## Implementation: AST-Aware Code Chunking and Dependency Tracing
The following python script uses Python's built-in `ast` library to extract class and function definitions from a target codebase file, allowing structural chunking rather than arbitrary line-based splitting.

```python
import ast
from typing import Dict, List, Any

class CodebaseASTParser(ast.NodeVisitor):
    def __init__(self, source_code: str):
        self.source_code = source_code
        self.definitions: List[Dict[str, Any]] = []

    def visit_ClassDef(self, node: ast.ClassDef):
        """Extracts class definitions, their start/end lines, and parent classes."""
        self.definitions.append({
            "type": "class",
            "name": node.name,
            "parents": [self._get_name(base) for base in node.bases],
            "start_line": node.lineno,
            "end_line": node.end_lineno,
            "snippet": self._get_source_segment(node.lineno, node.end_lineno)
        })
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        """Extracts function/method definitions."""
        self.definitions.append({
            "type": "function",
            "name": node.name,
            "args": [arg.arg for arg in node.args.args],
            "start_line": node.lineno,
            "end_line": node.end_lineno,
            "snippet": self._get_source_segment(node.lineno, node.end_lineno)
        })
        self.generic_visit(node)

    def _get_name(self, node: Any) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_name(node.value)}.{node.attr}"
        return "Unknown"

    def _get_source_segment(self, start: int, end: int) -> str:
        lines = self.source_code.splitlines()
        return "\n".join(lines[start-1:end])

# Sample Codebase Extraction
sample_code = """
import os

class PaymentGateway(BaseService):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def process_charge(self, amount: float) -> bool:
        print(f"Charging {amount}")
        return True

def handle_webhook(payload: dict):
    return "Parsed"
"""

if __name__ == "__main__":
    tree = ast.parse(sample_code)
    parser = CodebaseASTParser(sample_code)
    parser.visit(tree)
    
    print("=== Extracted AST Code Chunks ===")
    for chunk in parser.definitions:
        print(f"Type: {chunk['type']:8s} | Name: {chunk['name']:15s} | Lines: {chunk['start_line']}-{chunk['end_line']}")
        # We can write these chunks to Vector DB with precise metadata
```

## Summary of Trade-offs
To decide between long-context or hybrid AST-RAG, consider this quantitative evaluation matrix:

| Metric | Long Context (Brute-Force) | Hybrid AST-RAG |
| :--- | :--- | :--- |
| **API Cost** | Extremely High ($15-$30 per call) | Low ($0.01 - $0.05 per call) |
| **Response Latency** | High (30s - 90s to read 2M tokens) | Low (1s - 3s) |
| **AST Resolution** | Implicit (often misses fine details) | Explicit (forces structural precision) |
| **Setup Overhead** | Zero (just send files) | High (requires AST parsing + DB pipeline) |

For rapid, exploratory prototyping on single files, long-context is highly convenient. But for production enterprise AI agents running hundreds of commands an hour, a hybrid AST-RAG is a necessity. By extracting class dependencies and injecting only the precise logical sub-graph needed for a feature, you minimize both API costs and LLM hallucinations.
