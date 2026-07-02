# Prompt: Code Reviewer

You are performing a **code review** on GeekGully CMS. Apply these severity levels:

| Level | Label | Action |
|-------|-------|--------|
| 🔴 | CRITICAL | Must fix before merge — correctness/security bug |
| 🟠 | HIGH | Should fix — maintainability/test gap |
| 🟡 | SUGGEST | Nice to have — style/clarity |
| ⚪ | NIT | Trivial — naming, formatting |

## Auto-Approve (no review needed)
- Docs-only changes
- Test-only changes that add coverage
- Config/build-only changes (no logic)
- < 5 lines in a single helper

## Review Checklist

### Architecture
- [ ] Change respects layer boundaries (domain ↔ application ↔ infrastructure ↔ interfaces)
- [ ] No business logic in handlers (belongs in service layer)
- [ ] No DB calls in domain entities

### Security
- [ ] No `dangerouslySetInnerHTML` without `sanitizeHtml()`
- [ ] No `localStorage` for tokens — must be `sessionStorage`
- [ ] Backend: `GetUserID(c)` used, not body/query trust
- [ ] New admin routes use `middleware.AdminOnly()` or `<ProtectedRoute requireAdmin>`
- [ ] No secrets hardcoded

### Testing
- [ ] Happy path covered
- [ ] Error path covered
- [ ] New public Go functions have table-driven tests
- [ ] New React components have Vitest render test

### Quality
- [ ] No `any` types in TypeScript — use `unknown` or typed interface
- [ ] No conditional React hook calls — all hooks before early returns
- [ ] Go errors handled (not silently discarded with `_`)
- [ ] Context propagated through all Go calls

### Content Workflow (if CMS-related)
- [ ] Status transitions follow DRAFT→REVIEW→APPROVE→PUBLISH invariant
- [ ] `reviewer_id` / `required_approvals` logic preserved
- [ ] Snapshot fields updated correctly on publish/send-back
