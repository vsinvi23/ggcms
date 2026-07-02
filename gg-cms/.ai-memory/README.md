# .ai-memory — Graph-Derived Memory Index

**Project:** `C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms`  
**Graph:** 5,158 nodes · 15,366 edges · Indexed: 2026-06-11

---

## Directory Structure

```
.ai-memory/
  summaries/
    overview.md          ← hottest symbols, complexity, cluster map, test coverage
  modules/
    backend-services.md  ← all 21 Go services, handler→service map, pkg/ fan-in
    frontend-modules.md  ← service sizes, hook sizes, page complexity, state mgmt
  architecture/
    service-map.md       ← topology diagram, clusters, deployment variants, HTTP_CALLS
    data-flow.md         ← content lifecycle, auth, feature flags, engagement, personalization
  runbooks/
    onboarding.md           ← first setup, release package, where-is-X table
    troubleshooting.md      ← backend, frontend/E2E, Docker, workflow issue tables
    feature-development.md  ← add backend/frontend feature, E2E patterns, workflow API
```

---

## Token Budget

| File | Est. Tokens | Load When |
|------|-------------|-----------|
| `summaries/overview.md` | ~900 | Session start — always |
| `modules/backend-services.md` | ~700 | Backend feature work |
| `modules/frontend-modules.md` | ~700 | Frontend feature work |
| `architecture/service-map.md` | ~900 | Architecture decisions |
| `architecture/data-flow.md` | ~600 | Flow/sequence questions |
| `runbooks/onboarding.md` | ~400 | New developer, setup |
| `runbooks/troubleshooting.md` | ~600 | Debugging sessions |
| `runbooks/feature-development.md` | ~700 | Building any feature (backend/frontend/E2E) |

**Total if all loaded: ~5,500 tokens** vs ~80,000 for raw source browsing.

---

## Minimum Load (every session)

```
.ai-memory/summaries/overview.md      ← hottest symbols + complexity + test map
.ai/memory-bank.md                    ← entities, workflow rules, tech stack
.ai/session-init.md                   ← behavior contract
```

---

## Refresh — MANDATORY After Every Feature

The code graph and `.ai-memory/` files MUST be refreshed whenever code changes
(new feature, refactor, schema change). This keeps graph-derived docs accurate
and is a hard project rule (see `CLAUDE.md` and `.ai/project-rules.md`).

```
# 1. Re-index the graph
mcp__codebase-memory-mcp__index_repository(
  repo_path="c:\\Vivek\\Pesonal\\Serenya\\Project\\CMS\\gocms\\gg-cms",
  mode="moderate"
)

# 2. Inspect blast radius of the change
mcp__codebase-memory-mcp__detect_changes(
  project="C-Vivek-Pesonal-Serenya-Project-CMS-gocms-gg-cms",
  since="HEAD~1", depth=2
)

# 3. Regenerate affected .ai-memory/ files (summaries/overview.md at minimum)
```

> Graph data lives in the codebase-memory MCP store (queryable via the MCP tools).
> The durable, checked-in representation is this `.ai-memory/` markdown set —
> treat it as the source of truth for onboarding and architecture context.
