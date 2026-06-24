# Refactor Template

---

## Refactor Scope

**What is changing:** [structural change only — no behavior change]  
**Motivation:** [performance / maintainability / tech-debt / pattern consistency]  
**What stays the same:** [API, behavior, tests, DB schema]

## Touch Points

Files that will change:
- [ ] 
- [ ] 
- [ ] 

Callers/consumers verified via:
```
search_graph(name_pattern=".*OldName.*")
grep -rn "OldName" .
```

## Safety Net

```bash
# Before starting — all must pass
cd backend/go-cms && go test ./internal/... -short -count=1
cd frontend/react-ui && npm run lint && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

## Verification

```bash
# After each change
go build ./...         # backend
npx tsc --noEmit       # frontend

# After all changes
go test ./internal/... -short   # backend tests
node node_modules/vitest/vitest.mjs run   # frontend tests
```

## Commit Message
```
refactor(scope): description of structural change

Motivation: [why]
Behavior unchanged: confirmed by tests
```
