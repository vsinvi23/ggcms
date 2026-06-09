# Code Review Checklist

## Backend (Go)

### Architecture
- [ ] Handler calls service — not repository directly
- [ ] Service calls repository — no Gin context in service
- [ ] No business logic in handler
- [ ] New repository method declared in `interfaces.go` first
- [ ] New service method declared in `Service interface` first

### Correctness
- [ ] All error paths handled (`if err != nil`)
- [ ] Errors wrapped with context (`fmt.Errorf("operation: %w", err)`)
- [ ] Not-found returns `nil, nil` — not an error
- [ ] `ctx` passed through to all DB calls
- [ ] Read operations use `r.read`, mutations use `r.write`

### API
- [ ] Uses `response.OK / response.Paged / response.BadRequest / response.InternalError`
- [ ] Never uses raw `c.JSON`
- [ ] User ID from `middleware.GetUserID(c)` — never from request body
- [ ] DTO has binding tags for required fields
- [ ] Input validated before calling service

### Security
- [ ] Protected routes have `authMW` applied
- [ ] Admin-only routes have `middleware.AdminOnly()`
- [ ] No sensitive data in response (passwords, JWT secrets)
- [ ] No path traversal risk in file operations

### Database
- [ ] New migration is idempotent (`IF NOT EXISTS`)
- [ ] Migration number is sequential
- [ ] Entity `TableName()` method present
- [ ] JSONB columns use `gorm:"type:jsonb;serializer:json"`

### Quality
- [ ] No commented-out code
- [ ] No `fmt.Println` or `log.Printf` debug statements
- [ ] Function names match naming convention (VerbNoun)
- [ ] No unused imports

---

## Frontend (TypeScript)

### Architecture
- [ ] No data fetching in components — uses hooks
- [ ] Service returns typed data (no `any` returns)
- [ ] Types declared in `src/api/types.ts`
- [ ] Query keys follow convention `['resource', 'sub-action', ...params]`
- [ ] Mutation has `onSuccess` invalidation

### Correctness
- [ ] Virtual categories filtered: `.filter(c => !c.isVirtual)`
- [ ] Null-safe access on optional data (`data?.field ?? defaultValue`)
- [ ] Loading state handled (Skeleton or spinner)
- [ ] Error state handled (toast or error message)
- [ ] `enabled` flag on queries that depend on other data

### Types
- [ ] No `any` except at legacy API boundaries
- [ ] Props interface defined for components
- [ ] Event handlers properly typed (`React.ChangeEvent<HTMLInputElement>`)

### Quality
- [ ] No inline styles (use Tailwind classes)
- [ ] No hardcoded strings that should be constants
- [ ] `key` prop on all list items (unique, not array index)
- [ ] `useCallback` / `useMemo` only where genuinely needed (not premature)
- [ ] No console.log in production code

---

## Both

- [ ] `go build ./...` passes (if backend changed)
- [ ] `tsc --noEmit` passes (if frontend changed)
- [ ] Change scope is minimal — only what was asked
- [ ] No unrelated refactoring included
- [ ] No new abstractions introduced without explicit request
