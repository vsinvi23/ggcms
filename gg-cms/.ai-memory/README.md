# .ai-memory — Graph-Derived Memory Index

Pre-computed from `codebase-memory-mcp` indexing run.  
**Project:** `C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms`  
**Graph:** 5,158 nodes · 15,366 edges · Last indexed: 2026-06-11

---

## Files

| File | Description | Tokens (est.) |
|------|-------------|---------------|
| `summaries.md` | Project overview, recent commits, test status, known issues, perf hotspots | ~900 |
| `modules.md` | All backend services, frontend pages, API hooks, E2E infrastructure | ~1,500 |
| `architecture.md` | System topology, workflow state machine, RBAC, DB schema, security controls | ~1,800 |
| `runbooks.md` | Onboarding, running tests, adding features, troubleshooting tables | ~2,000 |

**Total context cost: ~6,200 tokens** — replaces ~80,000 tokens of raw source browsing.

---

## When to Load

| Task | Load |
|------|------|
| New to the project | `summaries.md` + `modules.md` |
| Architecture question | `architecture.md` |
| Feature work | `modules.md` + `runbooks.md` §4/5 |
| Debugging | `runbooks.md` §6/7/8 |
| Test work | `summaries.md` §4 + `runbooks.md` §3 |
| E2E patterns | `modules.md` E2E section + `runbooks.md` §9 |
| Content workflow | `architecture.md` §State Machine + `runbooks.md` §10 |

---

## Refresh

```bash
# Re-index after significant codebase changes
# Run from Claude Code session:
mcp__codebase-memory-mcp__index_repository({
  repo_path: "c:\\Vivek\\Pesonal\\Serenya\\Project\\CMS\\gocms\\gg-cms",
  mode: "moderate",
  persistence: true
})
```

Then regenerate `.ai-memory/` files using the codebase-memory skill.

---

## Graph Quick Reference

```
# Find a function
search_graph(name_pattern=".*FunctionName.*", label="Function")

# Trace call chain
trace_path(function_name="Approve", direction="both", depth=3)

# Find hot code (many callers)
search_graph(min_degree=8, relationship="CALLS", direction="inbound")

# Detect recent change impact
detect_changes(since="HEAD~3", depth=2)

# Architecture clusters
get_architecture(aspects=["clusters", "packages"])
```
