# /review-change — Code Review with Full Quality Enforcement

Run this before marking any feature or fix complete. Reviews the current diff against all quality dimensions.

## Instructions

You are performing a senior-level code review of the current working tree changes in the GeekGully CMS.
Review the diff, then evaluate each dimension below. For each issue found, give: **file:line | severity | description | fix**.

---

### Step 1 — Get the Diff

```bash
git diff HEAD 2>/dev/null || git diff --cached 2>/dev/null
```

Read the full diff. Understand what changed before evaluating.

---

### Dimension 1 — Correctness

**Go backend:**
- [ ] All error paths handled (`if err != nil`)
- [ ] Errors wrapped with context (`fmt.Errorf("op: %w", err)`)
- [ ] Not-found returns `nil, nil` — not an error
- [ ] `ctx` passed to all DB calls (`WithContext(ctx)`)
- [ ] Read operations use `r.read`, mutations use `r.write`
- [ ] New repository methods declared in `interfaces.go` first
- [ ] New service methods declared in `Service interface` first
- [ ] Response helpers used (`response.OK/BadRequest/InternalError`)
- [ ] User ID from `middleware.GetUserID(c)` — never from request body

**Frontend:**
- [ ] No data fetching in components — hooks used
- [ ] Mutation has `onSuccess` cache invalidation
- [ ] Virtual categories filtered: `.filter(c => !c.isVirtual)`
- [ ] Null-safe access on optional data
- [ ] Loading and error states handled

---

### Dimension 2 — Security

- [ ] `dangerouslySetInnerHTML` wrapped with `sanitizeHtml()` from `@/lib/sanitize`
- [ ] No raw error messages shown to users — `toUserMessage()` used
- [ ] No token, password, or secret in any URL params or navigation state
- [ ] `localStorage` not used for sensitive data (auth tokens, groups, PII)
- [ ] No `console.log/error` in production code paths
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] New backend endpoints have `authMW` applied (protected routes)
- [ ] Admin-only mutations use `middleware.AdminOnly()`
- [ ] File uploads: MIME type validated, filename sanitized

---

### Dimension 3 — Architecture & Patterns

- [ ] Handler → Service → Repository → DB (no layer skipping)
- [ ] No business logic in handler
- [ ] No Gin context in service layer
- [ ] New entity has `TableName()` method
- [ ] New migration is idempotent (`IF NOT EXISTS`)
- [ ] Migration number is sequential (check `migrations/postgres/`)
- [ ] Frontend service returns typed data (no `any` returns)
- [ ] Query keys follow convention `['resource', 'action', ...params]`

---

### Dimension 4 — Testing

For every new public function/method added:
- [ ] Happy path test exists
- [ ] Not-found / empty state test exists
- [ ] At least one error path test exists
- [ ] Auth/permission test exists (if endpoint adds a new route)

Check:
```bash
# New Go files without corresponding test files
git diff --name-only HEAD 2>/dev/null | grep "internal/application\|internal/interfaces/http/handler" | grep "\.go$" | grep -v "_test\.go" | while read f; do
  TEST="${f%.go}_test.go"
  [ -f "$TEST" ] || echo "MISSING TEST: $TEST"
done
```

---

### Dimension 5 — Documentation

For each changed area, identify which `.ai/` files need updating:

| Changed File Pattern | Update Required |
|---------------------|----------------|
| `internal/domain/entity/*.go` | `.ai/memory-bank.md`, `.ai/context/database.md` |
| `internal/application/*/service.go` | `.ai/memory-bank.md`, `.ai/context/backend.md` |
| `internal/interfaces/http/router.go` | `.ai/context/api-contracts.md` |
| `migrations/postgres/*.sql` | `.ai/context/database.md` |
| `src/api/types.ts` | `.ai/context/frontend.md` |
| `src/api/hooks/*.ts` or `src/api/services/*.ts` | `.ai/context/frontend.md` |
| `src/lib/sanitize.ts` or `src/lib/errors.ts` | `.ai/context/security.md` |
| Any security-related change | `.ai/context/security.md` |

List any docs that need updating.

---

### Dimension 6 — Code Quality

- [ ] No `fmt.Println` / `console.log` debug statements
- [ ] No commented-out code
- [ ] No unused imports
- [ ] Function names follow naming conventions (VerbNoun in Go, camelCase in TS)
- [ ] No inline complex types that belong in `types.ts`
- [ ] No new abstraction added for a one-off operation
- [ ] No surrounding code refactored (scope limited to the task)
- [ ] Tailwind classes used (no inline styles)
- [ ] `key` prop on all list items (not array index)

---

### Final Review Summary

Print:

```
REVIEW SUMMARY
══════════════
Correctness:  PASS | N issues
Security:     PASS | N issues  
Architecture: PASS | N violations
Testing:      PASS | N missing tests
Documentation: N files to update: [list]
Code Quality: PASS | N issues

VERDICT: ✓ READY TO COMMIT  |  ✗ CHANGES REQUIRED
```

If `CHANGES REQUIRED`, list every issue with file:line reference.
