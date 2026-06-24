# Test Template

---

## Go Unit Test (table-driven)

```go
// internal/application/xxx/service_test.go
package xxx_test

import (
    "context"
    "testing"
    "github.com/serenya/go-cms/internal/application/xxx"
    "github.com/serenya/go-cms/internal/domain/entity"
)

type mockXxxRepo struct {
    items map[uint]*entity.Xxx
    err   error
}

func (m *mockXxxRepo) FindByID(ctx context.Context, id uint) (*entity.Xxx, error) {
    if m.err != nil { return nil, m.err }
    return m.items[id], nil
}

func TestXxxService_GetByID(t *testing.T) {
    tests := []struct {
        name    string
        id      uint
        setup   func(*mockXxxRepo)
        wantErr bool
    }{
        {name: "found",    id: 1, setup: func(m *mockXxxRepo) { m.items[1] = &entity.Xxx{ID: 1} }},
        {name: "not found", id: 99, wantErr: false},
        {name: "db error", id: 1, setup: func(m *mockXxxRepo) { m.err = errors.New("db down") }, wantErr: true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := &mockXxxRepo{items: make(map[uint]*entity.Xxx)}
            if tt.setup != nil { tt.setup(repo) }
            svc := xxx.NewService(repo)
            _, err := svc.GetByID(context.Background(), tt.id)
            if tt.wantErr && err == nil { t.Error("expected error, got nil") }
            if !tt.wantErr && err != nil { t.Errorf("unexpected error: %v", err) }
        })
    }
}
```

---

## React Component Test (Vitest)

```typescript
// src/components/xxx/XxxComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { XxxComponent } from './XxxComponent';

vi.mock('@/api/hooks/useXxx', () => ({
  useXxx: () => ({ data: [{ id: 1, name: 'Test' }], isLoading: false }),
}));
vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://localhost:1337/api',
  APP_NAME: 'TestApp',
  ADMIN_GROUP_NAME: 'Admin',
  TOKEN_STORAGE_KEY: 'authToken',
  USER_STORAGE_KEY: 'auth_user',
  GROUPS_STORAGE_KEY: 'user_groups_cache',
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('XxxComponent', () => {
  it('renders items', () => {
    render(<XxxComponent />, { wrapper });
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

---

## Playwright E2E Test

```typescript
// e2e/xxx.spec.ts
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Xxx Feature', () => {
  test('admin can access page', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/xxx');
    await expect(page).toHaveURL(/\/xxx/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('unauthenticated user redirected', async ({ page }) => {
    await page.goto('/xxx');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});
```

---

## Test Checklist

For every feature, write:
- [ ] Happy path (returns expected data)
- [ ] Not found / empty case
- [ ] Validation error (400)
- [ ] Unauthorized (401 / redirect to /auth)
- [ ] One edge case specific to this feature
