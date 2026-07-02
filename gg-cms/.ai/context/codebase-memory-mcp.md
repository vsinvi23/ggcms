# Codebase Memory MCP

_Version: 0.8.1 (static binary, tree-sitter engine)_

## What It Is

`codebase-memory-mcp` is a knowledge-graph MCP server that indexes this CMS monorepo
(Go backend + React frontend) into a searchable code-intelligence layer. It replaces
manual Grep/Glob exploration with structured graph queries — call chains, data flow,
architecture views, symbol lookup.

Project ID: `C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms`
Index stats: 5,409 nodes · 15,716 edges (mode: moderate)

## Repo-Level Config (checked in — works for all agents)

| File | Agent |
|---|---|
| `.mcp.json` | Claude Code, Cursor, Zed, OpenCode, Aider, KiloCode, Kiro |
| `.vscode/mcp.json` | VS Code (Copilot Chat MCP) |
| `.codebase-memory/graph.db.zst` | Pre-built graph artifact — teammates bootstrap from this |
| `.codebase-memory/artifact.json` | Artifact metadata (commit, node/edge counts, sizes) |
| `.codebase-memory/.gitattributes` | `merge=ours binary` — prevents artifact merge conflicts |

All committed to the repo. Teammates only need the binary installed — the graph
loads from `.codebase-memory/graph.db.zst`, no local re-index required.

## One-Time Setup Per Developer

```bash
# 1. Install binary (add NODE_TLS_REJECT_UNAUTHORIZED=0 if behind corp proxy)
npm install -g codebase-memory-mcp

# 2. Register agent-level hooks (optional — auto-reminders to use the graph)
codebase-memory-mcp install

# 3. Bootstrap — opens project; graph loads from .codebase-memory/graph.db.zst
#    Or force a fresh index:
codebase-memory-mcp cli index_repository '{"repo_path":"c:/Vivek/Pesonal/Serenya/Project/CMS/gocms/gg-cms","mode":"moderate"}'
```

`.mcp.json` / `.vscode/mcp.json` are auto-read by each agent — no manual config.

## Re-indexing + Refreshing the Artifact (MANDATORY after any feature)

```bash
# 1. Re-index (MCP tool inside Claude Code)
index_repository(repo_path="c:/Vivek/Pesonal/Serenya/Project/CMS/gocms/gg-cms", mode="moderate")

# 2. Rebuild the shareable artifact from the live graph store
DB="$HOME/.cache/codebase-memory-mcp/C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms.db"
zstd -19 -q -f -o .codebase-memory/graph.db.zst "$DB"
# Then update .codebase-memory/artifact.json (commit hash, node/edge counts, sizes)

# 3. Regenerate affected .ai-memory/ docs (summaries/overview.md at minimum)
```

> The MCP's own `persistence:true` flag does not write the repo artifact on this
> binary build — rebuild it manually with `zstd` from the live cache `.db` as above.

Modes: `fast` (no similarity) · `moderate` (filtered + similarity) · `full` (all + semantic)

## Key Tools

| Tool | Use For |
|---|---|
| `search_graph` | Find functions/classes/routes by name, text, or semantic query |
| `trace_path` | Follow call chains, data flow, or cross-service HTTP paths |
| `get_code_snippet` | Read exact source for a qualified symbol |
| `query_graph` | Cypher queries — hotspots, loops, complexity |
| `get_architecture` | Package/service structure + Leiden community clusters |
| `search_code` | Graph-augmented grep — deduped + ranked by importance |
| `detect_changes` | Impact analysis since a git ref or date |
| `manage_adr` | Store/retrieve Architecture Decision Records in the graph |

## Corporate Proxy Note

Binary downloads require `NODE_TLS_REJECT_UNAUTHORIZED=0` due to corporate TLS
interception. Set it before running `npm install` or `npx` on this machine.

## Protocol

Per `.ai/session-init.md`, `.ai/project-rules.md`, and `CLAUDE.md`:
**Always call a codebase-memory tool first** before Grep/Glob when exploring code,
and **re-index + rebuild the artifact after every feature** (hard gate).
