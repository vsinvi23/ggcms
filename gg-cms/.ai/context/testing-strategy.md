# Testing Strategy

## Current State

| Layer | Coverage | Status |
|-------|---------|--------|
| Go service unit tests | Near zero | **Gap** |
| Go repository integration tests | Near zero | **Gap** |
| Go handler/API tests | Minimal | **Gap** |
| React component tests | 1,468 Vitest | **Good** |
| React E2E (Playwright) | 269+ | **Good** |
| API contract tests | Minimal | **Gap** |

Priority: Add Go service unit tests with mocked repositories.

## Go Testing Patterns

### Service Unit Test (table-driven)
```go
// internal/application/xxx/service_test.go
package xxx_test

import (
    "context"
    "testing"

    "github.com/serenya/go-cms/internal/application/xxx"
    "github.com/serenya/go-cms/internal/domain/entity"
)

// Mock repository
type mockXxxRepo struct {
    items map[uint]*entity.Xxx
    err   error
}

func (m *mockXxxRepo) FindByID(ctx context.Context, id uint) (*entity.Xxx, error) {
    if m.err != nil { return nil, m.err }
    return m.items[id], nil
}
// ... implement other interface methods

func TestXxxService_GetByID(t *testing.T) {
    tests := []struct {
        name    string
        id      uint
        setup   func(*mockXxxRepo)
        wantErr bool
        wantNil bool
    }{
        {
            name: "existing item",
            id:   1,
            setup: func(m *mockXxxRepo) {
                m.items[1] = &entity.Xxx{ID: 1, Name: "Test"}
            },
        },
        {
            name:    "not found",
            id:      99,
            wantNil: true,
        },
        {
            name:    "repo error",
            id:      1,
            setup:   func(m *mockXxxRepo) { m.err = errors.New("db down") },
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := &mockXxxRepo{items: make(map[uint]*entity.Xxx)}
            if tt.setup != nil { tt.setup(repo) }
            svc := xxx.NewService(repo)
            
            result, err := svc.GetByID(context.Background(), tt.id)
            
            if tt.wantErr && err == nil {
                t.Error("expected error, got nil")
            }
            if !tt.wantErr && err != nil {
                t.Errorf("unexpected error: %v", err)
            }
            if tt.wantNil && result != nil {
                t.Error("expected nil result")
            }
        })
    }
}
```

### Handler Integration Test
```go
// Use httptest.NewRecorder + gin test mode
func TestXxxHandler_GetAll(t *testing.T) {
    gin.SetMode(gin.TestMode)
    r := gin.New()
    
    svc := &mockXxxService{...}
    h := handler.NewXxxHandler(svc)
    r.GET("/api/xxx", h.GetAll)
    
    req := httptest.NewRequest("GET", "/api/xxx", nil)
    req.Header.Set("Authorization", "Bearer "+validToken)
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)
    
    assert.Equal(t, 200, w.Code)
    // parse body and assert structure
}
```

## TypeScript Testing Patterns

### Vitest unit test (component)
```typescript
// src/components/xxx/XxxComponent.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { XxxComponent } from './XxxComponent';

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('XxxComponent', () => {
  it('renders items', async () => {
    // mock the hook
    vi.mock('@/api/hooks/useX', () => ({
      useXList: () => ({ data: [{ id: 1, name: 'Item 1' }], isLoading: false }),
    }));
    
    render(<XxxComponent />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
  
  it('shows loading state', () => {
    vi.mock('@/api/hooks/useX', () => ({
      useXList: () => ({ data: undefined, isLoading: true }),
    }));
    render(<XxxComponent />, { wrapper: createWrapper() });
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});
```

### Playwright E2E test
```typescript
// tests/xxx.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Xxx Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth');
    await page.fill('[name=email]', 'admin@test.com');
    await page.fill('[name=password]', 'password');
    await page.click('[type=submit]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('creates a new item', async ({ page }) => {
    await page.goto('/xxx');
    await page.click('[data-testid=create-btn]');
    await page.fill('[name=title]', 'Test Item');
    await page.click('[type=submit]');
    await expect(page.locator('text=Test Item')).toBeVisible();
  });
});
```

## Testing Priorities (Ordered)

1. **Service unit tests** (Go) — zero mocks of external services, use interface mocks
2. **Repository integration tests** (Go) — use test PostgreSQL container or testcontainers-go
3. **Handler tests** (Go) — httptest + mock services
4. **API contract tests** — verify request/response shapes match types.ts
5. **Component tests** (Vitest) — render + user interaction
6. **E2E critical paths** (Playwright) — login, content creation, enrollment

## What to Test Per Feature

For each new feature, write:
- [ ] Happy path (returns expected data)
- [ ] Not found case (returns nil or 404)
- [ ] Validation error (returns 400)
- [ ] Unauthorized (returns 401)
- [ ] At least one edge case specific to the feature

## Test File Locations

```
backend/go-cms/
  internal/application/xxx/service_test.go
  internal/infrastructure/persistence/postgres/xxx_repository_test.go
  internal/interfaces/http/handler/xxx_handler_test.go

frontend/react-ui/src/
  components/xxx/XxxComponent.test.tsx
  api/hooks/useX.test.ts
  api/services/xService.test.ts
```

## Coverage Targets (Aspirational)

| Layer | Target |
|-------|--------|
| Service layer | 80% |
| Repository layer | 60% (integration tests) |
| Handler layer | 70% |
| React components | 70% |
| E2E critical paths | 100% of defined user journeys |
