# Playbook: Fix a Bug

## Diagnosis Protocol

1. **Read the failing code fully** — understand the intent, not just the symptoms
2. **Identify root cause** — not just the error location
3. **Check for similar bugs elsewhere** — patterns repeat
4. **State your diagnosis** before writing any fix

## Minimal Fix Principle

> Change only the lines that are wrong. Do not touch anything else.

```
BAD:  "I'll fix the bug and also clean up the surrounding code"
GOOD: "I'll change lines 42-45 in user_service.go only"
```

## Common Bug Categories

### 1. Nil pointer dereference (Go)
```go
// Bug: accessing field on nil pointer
article.Category.Name  // Category may be nil if not preloaded

// Fix: nil check or preload
if article.Category != nil {
    return article.Category.Name
}
// or:
r.read.WithContext(ctx).Preload("Category").First(&article, id)
```

### 2. Missing route/handler wiring
```go
// Symptom: 404 on valid path
// Check router.go: is the handler initialized? is the route registered?
// Check Services struct: is the new service present?
```

### 3. React Query not invalidating
```typescript
// Bug: mutation succeeds but UI doesn't update
// Fix: ensure onSuccess invalidates the correct query key
onSuccess: () => qc.invalidateQueries({ queryKey: ['the-right-key'] })
```

### 4. Wrong response shape
```typescript
// Bug: frontend shows undefined, network tab shows data
// Check: is the service extracting res.data.data or res.data.items?
// Fix: match the backend response envelope
return res.data.data ?? [];     // standard response
return res.data.items ?? [];    // paged response
```

### 5. Auth token not sent
```typescript
// Bug: 401 on protected route despite being logged in
// Check: apiClient.ts interceptor — is setAuthToken being called after login?
// Check: is the token in sessionStorage or in-memory cache?
```

### 6. GORM not finding records
```go
// Bug: FindByID returns nil even though record exists
// Check 1: is soft delete (DeletedAt) filtering it out?
// Check 2: is WHERE clause correct?
// Check 3: is the read DB different from write DB?
// Fix: add .Unscoped() if legitimately needed for deleted records
```

### 7. Migration conflict
```go
// Bug: server fails to start with "column already exists" error
// This means a non-idempotent migration was added
// Fix: wrap the offending DDL with IF NOT EXISTS / IF EXISTS
```

## Fix Verification

After making the fix:

```bash
# Backend
cd backend/go-cms && go build ./...

# Frontend
cd frontend/react-ui && npx tsc --noEmit -p tsconfig.app.json
```

Both must pass before reporting the fix as complete.

## Reporting Protocol

After fixing:
1. State what the root cause was (one sentence)
2. State what you changed (file + line range)
3. State the verification step you ran
4. List any related issues observed (but DO NOT fix them)
