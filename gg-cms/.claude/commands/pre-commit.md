# /pre-commit — Pre-Commit Gate

Run this immediately before `git commit`. Blocks commit if any hard gate fails.

## Instructions

You are the pre-commit gate for the GeekGully CMS.
Run every check below. Print a clear PASS/FAIL for each.
**If any HARD gate fails, print "COMMIT BLOCKED" and list what must be fixed before committing.**
SOFT gates produce warnings but do not block.

---

### HARD Gate 1 — Backend Compiles

```bash
cd backend/go-cms && go build ./...
```

Result: PASS (zero output) or FAIL (print errors).

---

### HARD Gate 2 — Frontend Types Clean

```bash
cd frontend/react-ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

Result: PASS (zero output) or FAIL (print errors).

---

### HARD Gate 2b — Frontend ESLint Clean

```bash
cd frontend/react-ui && npm run lint
```

Result: PASS (exit 0, no output after banner) or FAIL (list every error).

Rules that always block:
- `react-hooks/rules-of-hooks` — conditional hook = runtime crash
- `@typescript-eslint/no-explicit-any` — use `unknown` or a typed interface
- `no-control-regex` — embedded control chars in regex (security + correctness)
- `@typescript-eslint/no-require-imports` — use ESM imports in TS files

Acceptable suppressions (must include reason comment):
- `// eslint-disable-next-line react-hooks/exhaustive-deps` on mount-only effects
- `// eslint-disable-next-line @typescript-eslint/no-require-imports` on config files only (e.g. tailwind.config.ts)

---

### HARD Gate 3 — No XSS Vectors

```bash
grep -rn "dangerouslySetInnerHTML" frontend/react-ui/src --include="*.tsx" | grep -v "sanitizeHtml\|chart.tsx"
```

Result: PASS (zero hits) or FAIL (list files — every `dangerouslySetInnerHTML` must use `sanitizeHtml()`).

---

### HARD Gate 4 — No Secrets or Credentials in Code

```bash
grep -rn "password\s*=\s*['\"][^'\"]\|api_key\s*=\s*['\"][^'\"]\|secret\s*=\s*['\"][^'\"]" \
  backend/go-cms --include="*.go" | grep -v "_test.go\|example\|mock\|#"

grep -rn "VITE_\|process\.env\." frontend/react-ui/src --include="*.ts" --include="*.tsx" | \
  grep "=['\"][A-Za-z0-9_-]\{20,\}" | grep -v "\.env\|example\|#"
```

Result: PASS (zero hits) or FAIL.

---

### HARD Gate 5 — No localStorage for Sensitive Data

```bash
grep -rn "localStorage\.setItem" frontend/react-ui/src --include="*.ts" --include="*.tsx" | \
  grep -v "visitorProfile\|dismissWidget\|#"
```

Result: PASS (zero hits) or FAIL.

---

### HARD Gate 6 — No Raw SQL String Interpolation

```bash
grep -rn 'fmt\.Sprintf.*\(SELECT\|INSERT\|UPDATE\|DELETE\)' \
  backend/go-cms/internal --include="*.go"
```

Result: PASS (zero hits) or FAIL.

---

### SOFT Gate 7 — No Debug Statements

```bash
grep -rn "fmt\.Println\|console\.log\|console\.error" \
  backend/go-cms/internal frontend/react-ui/src \
  --include="*.go" --include="*.ts" --include="*.tsx" | \
  grep -v "_test\.\|spec\.\|# "
```

Result: WARN (list files) or OK.

---

### SOFT Gate 8 — New Entities Have Migrations

```bash
ENTITY_FILES=$(git diff --cached --name-only | grep "internal/domain/entity" | grep "\.go$")
if [ -n "$ENTITY_FILES" ]; then
  LATEST_MIGRATION=$(ls backend/go-cms/migrations/postgres/ | sort | tail -1)
  echo "Entity changes: $ENTITY_FILES"
  echo "Latest migration: $LATEST_MIGRATION"
  echo "WARN: Verify $LATEST_MIGRATION covers the entity change."
fi
```

Result: WARN (if entity changed without migration) or OK.

---

### SOFT Gate 9 — New Service Methods Have Tests

```bash
CHANGED_SERVICES=$(git diff --cached --name-only | grep "internal/application" | grep "\.go$" | grep -v "_test\.go")
if [ -n "$CHANGED_SERVICES" ]; then
  for f in $CHANGED_SERVICES; do
    TEST="${f%.go}_test.go"
    [ -f "$TEST" ] || echo "WARN: Missing test file: $TEST"
  done
fi
```

Result: WARN (list missing tests) or OK.

---

### SOFT Gate 10 — .ai/ Docs Freshness

```bash
CHANGED=$(git diff --cached --name-only)
echo "$CHANGED" | grep -q "internal/domain/entity\|migrations/postgres" && \
  echo "WARN: Entity/migration changed — update .ai/memory-bank.md and .ai/context/database.md"
echo "$CHANGED" | grep -q "internal/interfaces/http/router" && \
  echo "WARN: Router changed — update .ai/context/api-contracts.md"
echo "$CHANGED" | grep -q "src/api/types.ts\|src/api/hooks\|src/api/services" && \
  echo "WARN: Frontend API changed — update .ai/context/frontend.md"
echo "$CHANGED" | grep -q "src/lib/sanitize\|src/lib/errors\|middleware/auth\|middleware/cors" && \
  echo "WARN: Security-related file changed — update .ai/context/security.md"
```

---

### Final Decision

```
PRE-COMMIT GATE RESULTS
═══════════════════════
[HARD] Backend compile    : PASS/FAIL
[HARD] Frontend types     : PASS/FAIL
[HARD] No XSS vectors     : PASS/FAIL
[HARD] No secrets in code : PASS/FAIL
[HARD] No localStorage    : PASS/FAIL
[HARD] No raw SQL         : PASS/FAIL
[SOFT] No debug prints    : OK/WARN
[SOFT] Entity→migration   : OK/WARN
[SOFT] Service→tests      : OK/WARN
[SOFT] Docs freshness     : OK/WARN

══════════════════════════════════════
✓ ALL HARD GATES PASSED — safe to commit
  (address WARN items before PR review)

OR:

✗ COMMIT BLOCKED — fix these before committing:
  1. [describe issue + file:line]
  2. ...
```
