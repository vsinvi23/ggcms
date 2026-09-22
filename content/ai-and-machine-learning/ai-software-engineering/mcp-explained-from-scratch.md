---
title: "Model Context Protocol (MCP) Explained from Scratch"
description: "Why the N-to-M integration problem forced a standard protocol for AI context, and a from-scratch JSON-RPC 2.0 router implementation showing how MCP resources, prompts, and tools actually work."
categorySlug: "ai-software-engineering"
articleType: "GUIDE"
tags:
  - "model-context-protocol"
  - "mcp"
  - "json-rpc"
  - "ai-agents"
  - "protocol-design"
---

# Model Context Protocol (MCP) Explained from Scratch

## The Problem: The Integrations N-to-M Nightmare

Before the Model Context Protocol (MCP), integrating AI models with external software was a chaotic engineering task. If you had $N$ different IDEs or agent frameworks (VS Code, Cursor, LangChain, AutoGPT) and $M$ different developer tools or data sources (Postgres, GitHub, Slack, local filesystems), you had to write and maintain $N \times M$ custom integrations.

Each integration required custom serialization, unique API schemas, and bespoke auth layers. This massive fragmentation slowed down development, bloated codebases, and introduced security vulnerabilities.

```text
Proprietary Integration Model (Chaos):
VS Code   ──► GitHub Client (Custom) ──► GitHub API
Cursor    ──► GitHub Client (Cursor) ──► GitHub API
LangChain ──► GitHub Loader (Lang)   ──► GitHub API
```

## The Solution: A Unified Standard for Context Ingestion

MCP solves this by decoupling the AI host client from the external data source using a hub-and-spoke architecture. MCP acts like the **Language Server Protocol (LSP)** but is designed for LLM context instead of IDE code intelligence.

MCP standardizes communication using JSON-RPC 2.0 over either standard input/output (stdio) or Server-Sent Events (SSE). Under this standard, any AI client (Cursor, Cline, or a CLI agent) can instantly interact with any compliant MCP server.

```text
Standardized MCP Architecture:
┌───────────────┐                  ┌─────────────────────────┐
│               │                  │       MCP Server        │
│  MCP Client   │   JSON-RPC 2.0   ├─────────────────────────┤
│  (IDE/Agent)  │◄────────────────►│  ├── Resources (Data)   │
│               │   (stdio/SSE)    │  ├── Prompts (Templates)│
└───────┬───────┘                  │  └── Tools (Actions)    │
        │                          └─────────────────────────┘
        ▼
┌───────────────┐
│  LLM Engine   │
└───────────────┘
```

The protocol relies on three primary primitives:

1. **Resources**: read-only, URI-addressable data sources (e.g., `postgres://db/users/schema` or `file:///logs/today.txt`).
2. **Prompts**: standardized templates designed to guide user-model interaction (e.g., "Review this commit").
3. **Tools**: executable functions that can perform state-changing operations (e.g., "Run this git commit" or "Deploy this container").

## Implementation: Building an MCP Router from Scratch

To truly understand how simple MCP is, let's implement a JSON-RPC 2.0 router in Python from scratch, showing how the protocol receives, parses, and dispatches resource requests and tool executions.

```python
import sys
import json
from typing import Dict, Any, Callable, Tuple

class MCPServer:
    def __init__(self, name: str):
        self.name = name
        self.resources: Dict[str, str] = {}
        self.tools: Dict[str, Callable] = {}

    def register_resource(self, uri: str, content: str):
        """Registers a read-only static context resource."""
        self.resources[uri] = content

    def register_tool(self, name: str, func: Callable):
        """Registers an executable state-changing tool."""
        self.tools[name] = func

    def handle_request(self, json_rpc_string: str) -> str:
        """Parses and dispatches standard JSON-RPC 2.0 requests."""
        try:
            req = json.loads(json_rpc_string)
            req_id = req.get("id")
            method = req.get("method")
            params = req.get("params", {})

            if method == "resources/list":
                return self._json_response(req_id, {
                    "resources": [{"uri": uri, "name": f"Resource: {uri}"} for uri in self.resources.keys()]
                })

            elif method == "resources/read":
                uri = params.get("uri")
                if uri in self.resources:
                    return self._json_response(req_id, {
                        "contents": [{"uri": uri, "mimeType": "text/plain", "text": self.resources[uri]}]
                    })
                return self._error_response(req_id, -32602, "Resource not found")

            elif method == "tools/call":
                tool_name = params.get("name")
                tool_args = params.get("arguments", {})
                if tool_name in self.tools:
                    result = self.tools[tool_name](**tool_args)
                    return self._json_response(req_id, {
                        "content": [{"type": "text", "text": str(result)}]
                    })

                return self._error_response(req_id, -32601, f"Tool '{tool_name}' not found")

            return self._error_response(req_id, -32601, "Method not found")

        except Exception as e:
            return json.dumps({"jsonrpc": "2.0", "error": {"code": -32603, "message": str(e)}, "id": None})

    def _json_response(self, req_id: Any, result: Any) -> str:
        return json.dumps({"jsonrpc": "2.0", "result": result, "id": req_id})

    def _error_response(self, req_id: Any, code: int, message: str) -> str:
        return json.dumps({"jsonrpc": "2.0", "error": {"code": code, "message": message}, "id": req_id})


# Verification of Core Functionality
server = MCPServer("DebugServer")

# Register standard resource
server.register_resource("file:///workspace/env_config", "DB_HOST=localhost\nDB_PORT=5432")

# Register standard tool
def search_logs(pattern: str) -> str:
    return f"Searching database for regex: {pattern}... Found 0 warnings."
server.register_tool("search_logs", search_logs)

# 1. Test Resource Listing Request
req_list = '{"jsonrpc": "2.0", "method": "resources/list", "id": 1}'
print("List Resources:", server.handle_request(req_list))

# 2. Test Resource Read Request
req_read = '{"jsonrpc": "2.0", "method": "resources/read", "params": {"uri": "file:///workspace/env_config"}, "id": 2}'
print("Read Resource:", server.handle_request(req_read))

# 3. Test Tool Calling Request
req_tool = '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "search_logs", "arguments": {"pattern": "FATAL"}}, "id": 3}'
print("Call Tool:", server.handle_request(req_tool))
```

Running this script produces three JSON-RPC responses, one per primitive: a resource listing, a resource read returning the raw env file contents, and a tool call result — the exact three request shapes a real MCP client sends against any compliant server.

## Key Takeaways

1. **MCP operates like LSP.** It defines standard JSON-RPC contracts over simple, lightweight I/O streams.
2. **Context boundaries are standardized.** It clearly separates passive context injection (Resources) from active side-effect execution (Tools).
3. **Decoupled client-server lifecycle.** An IDE can dynamically query, register, and leverage any number of MCP servers, completely eliminating the need to write custom integration adapters for each separate LLM or environment.
