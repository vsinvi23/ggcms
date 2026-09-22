# Building a Secure MCP Server

### The Problem: Naive Code Execution and Host Exposure
As developers rush to build custom Model Context Protocol (MCP) servers to expose local resources to AI agents, they frequently introduce severe security flaws. A typical "developer agent tool" script might expose a fast file-reading utility or a shell-runner that accepts any file path or bash string and executes it directly on the host using Python's `open()` or Node's `child_process.exec()`.

This naive approach turns the MCP server into a remote code execution (RCE) backdoor. If the LLM is manipulated via a prompt injection attack, the agent will exploit these wide-open endpoints to traverse your entire file system, read SSH keys, or corrupt system configurations. 

```
  Naively Exposed MCP Server (Backdoor):
  LLM Agent ──► JSON-RPC: {"path": "/etc/passwd"} ──► Python: open(path) ──► Exploit!
```

To prevent this, MCP servers must be secure-by-design, incorporating strict input schema validation, canonical path isolation (chrooting), and defense-in-depth resource sandboxing.

### Technical Architecture: The Secure Handshake Pipeline
A secure MCP server acts as an isolated sandbox guard. It decodes JSON-RPC messages, validates schemas, canonicalizes and sanitizes file paths to prevent directory traversals, and runs executions inside a highly restricted, read-only-by-default environment.

```
  [ MCP JSON-RPC Request ]
             │
             ▼
┌──────────────────────────┐
│     JSON-RPC Decoder     │ (Parses standard protocol envelope)
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│    Pydantic Validator    │ (Enforces parameter constraints & types)
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Path Sanitizer (chroot)  │ (Guarantees isolation inside the workspace)
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│    Restricted Executor   │ (Safe native execution or isolated subprocess)
└──────────────────────────┘
```

### Implementation: Secure Python MCP Server
The implementation below uses Python and the official `mcp` SDK to construct a secure-by-design MCP Server. It registers a file-reader tool that uses absolute path canonicalization to enforce a strict directory jail, preventing any directory traversal out of a specified workspace.

```python
import os
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

# Initialize FastMCP - the official high-level SDK framework
mcp = FastMCP("SecureWorkspaceServer")

# Enforce a strict jail directory (chroot simulation)
JAIL_DIR = Path("C:\\workspace\\sandbox").resolve()

class SecureReadInput(BaseModel):
    relative_path: str = Field(
        ..., 
        description="The path of the file to read, relative to the workspace sandbox."
    )

def safe_resolve_path(rel_path: str, base_dir: Path) -> Path:
    """Canonicalizes the target path and guarantees it resides inside the base directory."""
    # Combine and convert to absolute, resolving all symlinks and relative references (..)
    target = Path(os.path.join(base_dir, rel_path)).resolve()
    
    # Check if the canonicalized path starts with the base directory path
    if not target.is_relative_to(base_dir):
        raise PermissionError(
            f"Security Violation: Path '{rel_path}' resolves outside the allowed sandbox."
        )
    return target

@mcp.tool()
def secure_read_file(relative_path: str) -> str:
    """
    Safely reads a text file from the secure local workspace sandbox.
    Access outside the sandbox is strictly blocked.
    """
    try:
        # 1. Enforce Path Canonicalization & Sandboxing
        safe_path = safe_resolve_path(relative_path, JAIL_DIR)
        
        # 2. Check if path exists and is a file
        if not safe_path.exists():
            return f"Error: File '{relative_path}' not found."
        if not safe_path.is_file():
            return f"Error: Path '{relative_path}' is not a regular file."
            
        # 3. Read content with size restrictions to prevent out-of-memory crashes
        max_bytes = 1024 * 1024  # 1MB limit
        file_size = safe_path.stat().st_size
        if file_size > max_bytes:
            return f"Error: File size ({file_size} bytes) exceeds the 1MB safety limit."
            
        with open(safe_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return content

    except PermissionError as pe:
        return f"Access Denied: {str(pe)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

if __name__ == "__main__":
    # Ensure our jail directory exists on the system
    os.makedirs(JAIL_DIR, exist_ok=True)
    
    # Start the standard MCP server on stdio transport streams
    print("Launching secure MCP server on stdio...")
    mcp.run()
```

### Key Takeaways
1. **Never trust raw path inputs.** Use Python's `.resolve()` and `Path.is_relative_to()` (or Node's `path.resolve()` combined with boundary checks) to guarantee filesystem isolation.
2. **Limit response sizes.** Maliciously large files can cause memory exhaustion (DoS) or consume excess token budgets in the context window.
3. **Use Official SDK frameworks.** Leverage structured schemas, typed BaseModel parameters, and standard handlers to benefit from built-in schema serialization and type enforcement.
