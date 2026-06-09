# /dev-check — Full Development Quality Gate

Run this after every meaningful change to verify the system is healthy across all dimensions.

## Instructions

You are performing a full development quality gate for the GeekGully CMS (Go backend + React frontend).
Execute each check below in order. Stop and report immediately on any failure — do not proceed past a failing gate.

---

### Gate 1 — Backend Compile

```bash
cd backend/go-cms && go build ./...
```

Expected: zero output (no errors). If errors found, list them and stop — do not proceed.

---

### Gate 2 — Frontend Type Check

```bash
cd frontend/react-ui && npx tsc --noEmit -p tsconfig.app.json
```

Expected: zero output. If errors found, list them and stop.

---

### Gate 3 — Security Scan

Run these grep checks and report any hits:

```bash
# 1. dangerouslySetInnerHTML without sanitizeHtml (XSS risk)
grep -rn "dangerouslySetInnerHTML" frontend/react-ui/src --include="*.tsx" | grep -v "sanitizeHtml\|chart.tsx"

# 2. localStorage storing auth or sensitive data
grep -rn "localStorage.setItem" frontend/react-ui/src --include="*.ts" --include="*.tsx" | grep -v "visitorProfile\|dismissWidget\|#"

# 3. Raw error messages shown to users
grep -rn "err\.message\|error\.message\|error\.response?.data?.message" frontend/react-ui/src --include="*.ts" --include="*.tsx" | grep -v "toUserMessage\|errors.ts\|#"

# 4. console.log/console.error in production code (not test files)
grep -rn "console\.log\|console\.error" frontend/react-ui/src --include="*.ts" --include="*.tsx" | grep -v "\.test\.\|spec\.\|#"

# 5. Backend: raw SQL string interpolation
grep -rn 'fmt\.Sprintf.*SELECT\|fmt\.Sprintf.*INSERT\|fmt\.Sprintf.*UPDATE\|fmt\.Sprintf.*DELETE' backend/go-cms/internal --include="*.go"
```

Report any hits. If none found, confirm "Security scan PASSED".

---

### Gate 4 — Architecture Compliance

Check for layer violations:

```bash
# Handlers importing repository layer directly (violation)
grep -rn "persistence/postgres\|persistence/mongodb" backend/go-cms/internal/interfaces --include="*.go"

# Services importing Gin context (violation)
grep -rn "gin\.Context\|c\.Param\|c\.Query" backend/go-cms/internal/application --include="*.go"

# Components fetching data directly (no hooks)
grep -rn "axios\.\|apiClient\." frontend/react-ui/src/components --include="*.tsx" | grep -v "services/"
```

Report any violations.

---

### Gate 5 — Test Coverage Check

For every new or modified service/handler file, verify a corresponding test file exists:

```bash
# List Go service files modified in last commit
git diff --name-only HEAD~1 HEAD 2>/dev/null | grep "internal/application\|internal/interfaces/http/handler" | grep "\.go$"

# Check for corresponding _test.go files
git diff --name-only HEAD~1 HEAD 2>/dev/null | grep "internal/application\|internal/interfaces/http/handler" | grep "\.go$" | sed 's/\.go/_test.go/' | while read f; do [ -f "$f" ] && echo "EXISTS: $f" || echo "MISSING: $f"; done
```

Report any missing test files as warnings (not hard failures).

---

### Gate 6 — Migration Sync Check

If any entity files were modified, verify a corresponding migration file exists:

```bash
ENTITY_CHANGES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep "internal/domain/entity" | grep "\.go$")
if [ -n "$ENTITY_CHANGES" ]; then
  echo "Entity changes detected: $ENTITY_CHANGES"
  ls backend/go-cms/migrations/postgres/ | tail -5
  echo "Verify the latest migration covers these entity changes."
fi
```

---

### Gate 7 — Documentation Freshness

Report which `.ai/` files may need updating based on what changed:

- Modified entity files → `.ai/memory-bank.md`, `.ai/context/database.md`
- Modified service files → `.ai/memory-bank.md`, `.ai/context/backend.md`
- Modified frontend hooks/services → `.ai/context/frontend.md`
- Modified API routes → `.ai/context/api-contracts.md`
- Modified security-related files → `.ai/context/security.md`

Print a checklist of docs to review.

---

### Summary

Print a final table:

| Gate | Status | Notes |
|------|--------|-------|
| Backend compile | PASS/FAIL | |
| Frontend types | PASS/FAIL | |
| Security scan | PASS/FAIL | N issues |
| Architecture | PASS/FAIL | N violations |
| Test coverage | WARN/OK | N missing |
| Migration sync | OK/WARN | |
| Docs freshness | CHECKLIST | files to update |
