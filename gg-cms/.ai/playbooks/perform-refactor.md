# Playbook: Perform a Refactor

> **Rule:** Never refactor surrounding code when fixing a bug. Only refactor when explicitly asked.

---

## Step 1 — Define Scope
- [ ] What exactly is being refactored? (file, function, module, pattern)
- [ ] What stays unchanged? (behavior, API contracts, DB schema)
- [ ] What is the motivation? (performance, maintainability, tech-debt)
- [ ] Write one sentence: "This refactor changes X without altering Y"

## Step 2 — Create Safety Net
```bash
# Backend — all tests must pass before starting
cd backend/go-cms && go test ./internal/... -short -count=1

# Frontend — lint + types must be clean
cd frontend/react-ui && npm run lint && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```
If tests fail before refactor, fix them first.

## Step 3 — Identify Touch Points
```
# Use codebase-memory to find all callers
search_graph(name_pattern=".*OldFunctionName.*")
trace_path(function_name="OldFunctionName", direction="inbound", depth=3)
```
List every file that will need updating.

## Step 4 — Refactor Incrementally
- Change one logical unit at a time
- After each change: `go build ./...` (backend) or `npx tsc --noEmit` (frontend)
- Do NOT change behavior — only structure
- Match existing code style exactly in each file

## Step 5 — Update Callsites
- Update every file identified in Step 3
- Search for any remaining references: `grep -rn "OldName" .`
- Verify no missed usages

## Step 6 — Verify Equivalence
```bash
# All tests must still pass
cd backend/go-cms && go test ./internal/... -short -count=1
cd frontend/react-ui && node node_modules/vitest/vitest.mjs run

# No new lint errors
cd frontend/react-ui && npm run lint
```

## Step 7 — Commit
```bash
git commit -m "refactor(scope): concise description of structural change

- What moved/renamed/restructured
- Why (motivation)
- Behavior unchanged: confirmed by tests"
```

---

## Refactor Anti-Patterns — Never Do These

| Anti-Pattern | Why It's Wrong |
|-------------|----------------|
| Rename a public API symbol without updating all callers | Breaks other files silently |
| Change error messages during refactor | Breaks E2E tests that match text |
| Add new abstractions "while I'm in here" | Scope creep; introduces risk |
| Refactor + bug fix in same commit | Conflates intent; hard to revert |
| Fix formatting across unrelated files | Pollutes diff; harder to review |
