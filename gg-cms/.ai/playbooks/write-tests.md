# Playbook: Write Tests

## Before Writing Tests

1. Identify the unit under test (service method, handler, component, hook)
2. Identify what it does and what can go wrong
3. List test cases: happy path + each failure mode + boundary conditions
4. Write the mock/stub for dependencies

## Go: Service Unit Test

```go
// Pattern: table-driven, interface mock, no real DB
// File: internal/application/xxx/service_test.go

package xxx_test

import (
    "context"
    "errors"
    "testing"
    
    "github.com/serenya/go-cms/internal/application/xxx"
    "github.com/serenya/go-cms/internal/domain/entity"
)

// 1. Implement the mock
type mockRepo struct {
    findResult *entity.Xxx
    findErr    error
    createErr  error
    saved      *entity.Xxx
}

func (m *mockRepo) FindByID(ctx context.Context, id uint) (*entity.Xxx, error) {
    return m.findResult, m.findErr
}
func (m *mockRepo) Create(ctx context.Context, x *entity.Xxx) error {
    m.saved = x
    return m.createErr
}
// implement remaining interface methods with zero-value returns

// 2. Table-driven test
func TestService_GetByID(t *testing.T) {
    ctx := context.Background()
    
    tests := []struct {
        name      string
        id        uint
        repoSetup func(*mockRepo)
        wantErr   bool
        wantNil   bool
        wantID    uint
    }{
        {
            name: "found",
            id:   1,
            repoSetup: func(m *mockRepo) {
                m.findResult = &entity.Xxx{ID: 1}
            },
            wantID: 1,
        },
        {
            name:    "not found",
            id:      999,
            wantNil: true,
        },
        {
            name: "repo error",
            id:   1,
            repoSetup: func(m *mockRepo) {
                m.findErr = errors.New("connection refused")
            },
            wantErr: true,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := &mockRepo{}
            if tt.repoSetup != nil {
                tt.repoSetup(repo)
            }
            svc := xxx.NewService(repo)
            
            result, err := svc.GetByID(ctx, tt.id)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("GetByID() error = %v, wantErr %v", err, tt.wantErr)
            }
            if tt.wantNil && result != nil {
                t.Errorf("GetByID() expected nil, got %v", result)
            }
            if !tt.wantNil && !tt.wantErr {
                if result == nil {
                    t.Fatal("GetByID() returned nil")
                }
                if result.ID != tt.wantID {
                    t.Errorf("GetByID() ID = %v, want %v", result.ID, tt.wantID)
                }
            }
        })
    }
}
```

## Go: Handler Test

```go
// Pattern: httptest + gin test mode + mock service
import (
    "bytes"
    "encoding/json"
    "net/http/httptest"
    "testing"
    
    "github.com/gin-gonic/gin"
)

func TestHandler_Create(t *testing.T) {
    gin.SetMode(gin.TestMode)
    
    svc := &mockService{createResult: &entity.Xxx{ID: 1, Name: "Test"}}
    h := handler.NewXxxHandler(svc)
    
    r := gin.New()
    r.POST("/xxx", func(c *gin.Context) {
        c.Set("userID", uint(1)) // simulate auth middleware
    }, h.Create)
    
    body := map[string]any{"name": "Test"}
    bodyBytes, _ := json.Marshal(body)
    
    req := httptest.NewRequest("POST", "/xxx", bytes.NewReader(bodyBytes))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    
    r.ServeHTTP(w, req)
    
    if w.Code != 201 {
        t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
    }
    
    var resp map[string]any
    json.Unmarshal(w.Body.Bytes(), &resp)
    if resp["success"] != true {
        t.Errorf("expected success=true, got %v", resp)
    }
}
```

## TypeScript: Hook Test

```typescript
// Pattern: React Query + mock service + renderHook
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { useXList } from '@/api/hooks/useX';

vi.mock('@/api/services/xService', () => ({
  xService: {
    getAll: vi.fn().mockResolvedValue([{ id: 1, name: 'Item 1' }]),
  },
}));

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useXList', () => {
  it('returns items', async () => {
    const { result } = renderHook(() => useXList(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe('Item 1');
  });
  
  it('handles error', async () => {
    vi.mocked(xService.getAll).mockRejectedValueOnce(new Error('Server error'));
    const { result } = renderHook(() => useXList(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

## Test File Naming Convention

```
# Go — same directory as source
internal/application/xxx/service_test.go
internal/interfaces/http/handler/xxx_handler_test.go
internal/infrastructure/persistence/postgres/xxx_repository_test.go

# TypeScript — same directory as source
src/api/hooks/useX.test.ts
src/api/services/xService.test.ts
src/components/xxx/XxxComponent.test.tsx
```

## Required Test Cases Per Feature

For each new public method/function, write:
- [ ] Happy path (returns expected value)
- [ ] Not found (nil/undefined without error)
- [ ] Dependency error (propagates correctly)
- [ ] Validation error (bad input rejected)
- [ ] Authorization (unauthorized request rejected if applicable)

## Running Tests

```bash
# Go
cd backend/go-cms && go test ./...

# TypeScript
cd frontend/react-ui && npx vitest run

# TypeScript watch mode
cd frontend/react-ui && npx vitest
```
