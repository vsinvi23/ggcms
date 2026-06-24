# Bug Fix Template

Use this structure when filing or implementing a bug fix.

---

## Bug Report

**Summary:** [One sentence description]  
**Severity:** Critical / High / Medium / Low  
**Reported by:** [user/AI/test]  
**Affects:** Backend / Frontend / Both  

### Reproduction Steps
1. 
2. 
3. 

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Root Cause
[Once identified — the underlying code issue]

---

## Fix Checklist

- [ ] Write a failing test that reproduces the bug (test first)
- [ ] Identify the root cause (not just the symptom)
- [ ] Implement minimal targeted fix — no surrounding refactors
- [ ] Run `go build ./...` / `npx tsc --noEmit` — must pass
- [ ] Run relevant tests — must all pass
- [ ] Verify the fix with the reproduction steps

---

## Commit Message
```
fix(scope): concise description of what was broken

Root cause: [one sentence]
Fix: [one sentence]

Fixes #<issue-number>
```

**Scope examples:** `auth`, `cms`, `frontend`, `e2e`, `settings`, `enrollment`
