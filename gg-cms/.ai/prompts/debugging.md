# Prompt: Debugging Session

You are **debugging a specific issue** in GeekGully CMS. Follow this protocol.

## Step 1 — Characterise the Bug
Answer before touching any code:
1. What is the observed symptom? (exact error message / wrong behaviour)
2. What is the expected behaviour?
3. Which layer is it in? Backend (Go) / Frontend (React) / E2E / Both?
4. Is it reproducible? Always / Sometimes (flaky) / Once?

## Step 2 — Gather Evidence
```bash
# Backend — check logs
tail -50 release/dist/native/logs/app.log     # structured JSON logs
tail -20 release/dist/native/logs/stderr.txt  # startup errors

# Backend — verify build
cd backend/go-cms && go build ./...

# Frontend — check types
cd frontend/react-ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

Use codebase-memory to find the relevant code:
```
search_graph(name_pattern=".*FunctionName.*")
trace_path(function_name="FunctionName", direction="both", depth=3)
```

## Step 3 — Form a Hypothesis
One sentence: "The bug is caused by X in file Y because Z."

## Step 4 — Write a Failing Test First
```go
// Go: reproduce in a test
func TestBugReproduction(t *testing.T) {
    // setup that triggers the bug
    // assertion that should pass but currently fails
}
```

## Step 5 — Fix and Verify
- Minimal targeted fix — no surrounding refactors
- Run the failing test — must now pass
- Run full test suite — no regressions

## Common Bug Patterns

| Symptom | Likely Cause | Where to Look |
|---------|-------------|---------------|
| `JWT_SECRET required` on startup | `.env` has BOM | Check first 3 bytes of `.env` |
| MongoDB timeout on backend start | Container not healthy | `docker ps` — wait for `healthy` |
| E2E tests all skip | Stale `.e2e-state.json` | Delete and re-run |
| CORS error in browser | Missing port in allowlist | `CORS_ALLOWED_ORIGINS` in `.env` |
| `Tooltip must be used within TooltipProvider` | Missing wrapper in test | Add `<TooltipProvider>` to test render |
| Vitest worker crash | Large component OOM | Use lightweight stub instead of direct import |
| Rate limit in E2E | >10 `apiLogin` calls/min | Use `_tokenCache` map across tests |
| `addInitScript` re-injects session | Fake session persists to next `loginViaUI` | `sessionStorage.clear()` + `__session_cleared` flag |
