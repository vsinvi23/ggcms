# AI Operating Guidelines

> How Claude Code sessions should use this `.ai/` system efficiently.

---

## Context Loading Protocol

### Minimum Load (every session)
```
.ai/memory-bank.md       — architecture, entities, conventions
.ai/session-init.md      — behavior contract, mandatory workflows
```
These two files give 80% of the context needed for most tasks.

### Task-Specific Additions
Load only what the current task requires:

```
Backend feature work:
  .ai/context/backend.md
  .ai/context/database.md

Frontend feature work:
  .ai/context/frontend.md

Full-stack feature:
  .ai/context/backend.md + .ai/context/frontend.md

Auth/security changes:
  .ai/context/authentication.md + .ai/context/security.md

API design:
  .ai/context/api-contracts.md

New feature (any):
  .ai/playbooks/build-new-feature.md

Database migration:
  .ai/playbooks/db-migration.md

Writing tests:
  .ai/context/testing-strategy.md + .ai/playbooks/write-tests.md

Code review:
  .ai/playbooks/code-review-checklist.md

Performance investigation:
  .ai/context/performance.md
```

### Never Load Simultaneously
- Do not load all context/ files at once — token waste
- Load skills/ files only when explicitly working on that skill area
- ADRs are reference-only; load specific ADR if investigating a decision

---

## File Freshness Rules

| File | Update Trigger |
|------|---------------|
| `memory-bank.md` | New entity, new service, major architecture change |
| `repository-map.md` | New file/folder structure added |
| `context/backend.md` | New pattern introduced in Go code |
| `context/frontend.md` | New component pattern or hook pattern |
| `context/database.md` | New migration, new collection |
| `adr/` | Significant architectural decision made |

Update the relevant file when you make a change that would confuse a future session.

---

## Signal Words → Context Files

When user says... → load this file:

| User mentions | Load |
|---------------|------|
| "migration", "table", "column", "schema" | `context/database.md` + `playbooks/db-migration.md` |
| "auth", "login", "JWT", "permission", "role" | `context/authentication.md` |
| "test", "spec", "coverage" | `context/testing-strategy.md` |
| "performance", "slow", "N+1", "cache" | `context/performance.md` |
| "security", "XSS", "injection", "CORS" | `context/security.md` |
| "API", "endpoint", "route", "handler" | `context/api-contracts.md` |
| "frontend", "component", "page", "hook" | `context/frontend.md` |
| "deploy", "docker", "compose" | `context/deployment.md` |
| "refactor" | `skills/refactoring.md` |
| "review" | `playbooks/code-review-checklist.md` |
| "new feature" | `playbooks/build-new-feature.md` |

---

## Response Quality Standards

Every response from Claude in this project must:
- Reference specific file paths (`backend/go-cms/internal/...`) not generic descriptions
- Name the exact pattern being followed (e.g., "matching the LearningPath service pattern")
- Specify the verification step to run after the change
- Not add anything not asked for

---

## How to Extend This System

When introducing new technology or pattern:
1. Add it to `memory-bank.md` under the appropriate section
2. Create or update the relevant `context/` file
3. If it's a recurring workflow, create a `playbooks/` entry
4. If it was a significant decision, add an ADR

When a rule is broken and causes a bug:
1. Add the rule explicitly to `project-rules.md`
2. Add a warning note to `memory-bank.md` under "Known Gaps"

---

## Anti-Patterns to Avoid

```
BAD: "I'll now refactor the surrounding code while I'm here"
BAD: "Let me add some defensive error handling just in case"
BAD: "I'll create a utility function for this"
BAD: "I'll update the tests to reflect the new behavior" (unless asked)
BAD: Loading all .ai/ files every session
BAD: Creating .ai/ files that duplicate content from CLAUDE.md

GOOD: "I'll change only lines 42-47 in this file"
GOOD: "I'll run go build ./... to verify before reporting done"
GOOD: "I'll match the exact pattern used in the adjacent service"
```
