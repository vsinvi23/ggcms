# Frontend — React UI (CLAUDE.md)

> Component-level conventions for `frontend/react-ui/`. Supplements root `CLAUDE.md`.

---

## Verify After Every Change

```bash
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json   # 0 errors
npm run lint                                                          # 0 errors
node node_modules/vitest/vitest.mjs run                              # all pass
```

---

## Adding a New Feature

```
1. src/api/types.ts                     — add Request + Response interfaces
2. src/api/services/*Service.ts         — add axios call function
3. src/api/hooks/use*.ts                — add React Query hook
4. src/pages/ or src/components/        — add UI
5. src/App.tsx                          — wire route (with <ProtectedRoute> if needed)
```

---

## Patterns

### Service function
```typescript
// src/api/services/xxxService.ts
getXxx: async (id: number): Promise<XxxDto> => {
  const res = await apiClient.get<ApiResponse<XxxDto>>(`/xxx/${id}`);
  return res.data.data!;
},
```

### React Query hook
```typescript
// src/api/hooks/useXxx.ts
export const useXxx = (id: number) =>
  useQuery({ queryKey: ['xxx', id], queryFn: () => xxxService.getXxx(id) });

export const useCreateXxx = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: xxxService.createXxx,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xxx'] }),
  });
};
```

### Protected route
```tsx
// Admin-only page
<Route path="/admin/xxx" element={<ProtectedRoute requireAdmin><XxxPage /></ProtectedRoute>} />

// Any authenticated user
<Route path="/xxx" element={<ProtectedRoute><XxxPage /></ProtectedRoute>} />
```

### Auth check
```typescript
const { isAuthenticated, isAdmin, hasGroup } = useAuth();  // always from hook
// Never: localStorage.getItem('authToken')
// Never: sessionStorage.getItem('user_groups_cache')  — groups are memory-only
```

---

## Rules

| Rule | Why |
|------|-----|
| All API calls via `apiClient` (src/api/client.ts) | Interceptors handle auth + 401 |
| All types in `src/api/types.ts` | Single source of truth |
| No `any` — use `unknown` + narrowing | Type safety |
| All hooks before conditional `return` | React rules of hooks |
| `useAuth()` for auth state — never check storage directly | Security |
| `.filter(c => !c.isVirtual)` before rendering categories | Hides virtual "geek" root |
| `sanitizeHtml()` before `dangerouslySetInnerHTML` | XSS prevention |

---

## Test Patterns

### Unit test wrapper (required for Radix components)
```typescript
import { TooltipProvider } from '@/components/ui/tooltip';
function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}
```

### Radix tab/dropdown clicks
```typescript
const user = userEvent.setup({ delay: null });  // NOT fireEvent.click
await user.click(screen.getByRole('tab', { name: /Storage/i }));
```

### E2E — fake session
```typescript
import { injectFakeSession } from './helpers/auth';
await injectFakeSession(page, 'admin');  // or 'reviewer', 'creator', 'learner'
```

### E2E — before real loginViaUI after injectFakeSession
```typescript
// Clear addInitScript state to prevent re-injection
await page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('__session_cleared','1'); });
await loginViaUI(page, email, password);
```

---

## E2E State File

`e2e/.e2e-state.json` — seeded users/group/category IDs.  
Delete before running against fresh DB. Preserved across runs by global-teardown.
