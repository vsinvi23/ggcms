# Frontend Context — React 19 + Vite

## Data Flow Architecture

```
Component
  └── uses Hook (src/api/hooks/use*.ts)
        └── calls Service (src/api/services/*Service.ts)
              └── calls apiClient (src/api/client.ts)
                    └── Axios → Backend API
```

Types live in `src/api/types.ts`. Never define complex types inline in components.

## API Client Setup (src/api/client.ts)

```typescript
// Token management
export const setAuthToken = (token: string): void
export const getAuthToken = (): string | null
export const clearAllAuthData = (): void
export const setUserData = <T>(data: T): void
export const getUserData = <T>(): T | null
export const isAuthenticated = (): boolean

// Axios interceptors handle:
// - Adding Authorization header from token cache / sessionStorage
// - 401 → dispatching 'auth:logout' event
```

## Service Pattern

```typescript
// src/api/services/xService.ts
import apiClient from '../client';
import type { XDto, CreateXDto } from '../types';

export const xService = {
  getAll: async (): Promise<XDto[]> => {
    const res = await apiClient.get('/x');
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<XDto> => {
    const res = await apiClient.get(`/x/${id}`);
    return res.data.data;
  },

  create: async (data: CreateXDto): Promise<XDto> => {
    const res = await apiClient.post('/x', data);
    return res.data.data;
  },

  update: async (id: number, data: Partial<CreateXDto>): Promise<XDto> => {
    const res = await apiClient.put(`/x/${id}`, data);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/x/${id}`);
  },
};
```

## Hook Pattern

```typescript
// src/api/hooks/useX.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { xService } from '../services/xService';
import type { CreateXDto } from '../types';

export const xKeys = {
  all: ['x'] as const,
  list: () => [...xKeys.all, 'list'] as const,
  detail: (id: number) => [...xKeys.all, id] as const,
};

export const useXList = () =>
  useQuery({
    queryKey: xKeys.list(),
    queryFn: () => xService.getAll(),
    staleTime: 5 * 60 * 1000,
  });

export const useX = (id: number) =>
  useQuery({
    queryKey: xKeys.detail(id),
    queryFn: () => xService.getById(id),
    enabled: id > 0,
  });

export const useCreateX = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateXDto) => xService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: xKeys.all }),
  });
};

export const useDeleteX = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => xService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: xKeys.all }),
  });
};
```

## Types Pattern

```typescript
// src/api/types.ts — add to the appropriate section

export interface XDto {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateXDto {
  name: string;
  description?: string;
}

export type XPagedResponse = PagedResponse<XDto>;
```

## HTML Sanitization (Security — Required)

Every `dangerouslySetInnerHTML` MUST use `sanitizeHtml()`:
```tsx
import { sanitizeHtml } from '@/lib/sanitize';
// Always:
dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(body)) }}
// Never:
dangerouslySetInnerHTML={{ __html: html }}  // XSS risk
```

## Safe Error Messages (Security — Required)

Never surface raw API errors. Use `toUserMessage()`:
```typescript
import { toUserMessage } from '@/lib/errors';
// In catch blocks:
return { error: toUserMessage(err, 'Operation failed.') };
// Maps status codes to safe strings — no stack traces, no server paths
```

## Auth Context Usage

```typescript
import { useAuth } from '@/contexts/AuthContext';

const { user, isAuthenticated, isAdmin, login, logout,
        visitorProfileImported, clearVisitorImportFlag } = useAuth();
// user: { id, name, email, role, status }
// isAuthenticated: boolean
// isAdmin: boolean (role==='admin' OR admin group member)
// userGroups: GroupResponseDto[] — memory-only (NOT in sessionStorage)
// visitorProfileImported: boolean — true after login imports sessionStorage profile
// clearVisitorImportFlag: () => void — call after showing VisitorImportDialog
```

### Visitor Profile (anonymous users)
```typescript
import { getVisitorProfile, setVisitorProfile, clearVisitorProfile } from '@/lib/visitorProfile';
// Stored in sessionStorage (cleared on tab close — more secure than localStorage)
// Auto-imported to API on login via AuthContext.importVisitorProfile()
```

### Role Presets
```typescript
import { ROLE_PRESETS } from '@/lib/rolePresets';
// ROLE_PRESETS: RolePreset[] — 6 entries (learner/developer/architect/manager/researcher/executive)
// Each has: roleType, label, icon, description, experienceLevel, learningGoals
```

## Route Guard

```tsx
// In App.tsx — wrap protected routes
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
<Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
```

## Layout Components

```tsx
// Dashboard pages
<DashboardLayout>
  {/* your page content */}
</DashboardLayout>

// Public pages
<PublicLayout>
  {/* your page content */}
</PublicLayout>
```

## Feature Flags

```tsx
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
const flags = useFeatureFlags();
if (flags.learning_paths) { /* show learning paths */ }
```

Available flags: `learning_paths`, `interview_prep`

## Virtual Category Filter (Always Apply)

```tsx
const { data: categories = [] } = useCategories();
const visibleCategories = categories.filter(c => !c.isVirtual);
```

## Paged API Response Handling

```typescript
// Backend returns: { success, items, total, currentPage, pageSize }
// OR Strapi format: { data: [], meta: { pagination: { page, pageSize, total } } }

// Use null-coalescing to handle both:
const items = res.data.items ?? res.data.data ?? [];
const total = res.data.total ?? res.data.meta?.pagination?.total ?? 0;
```

## Toast Notifications

```tsx
import { toast } from 'sonner';

toast.success('Saved successfully');
toast.error('Something went wrong');
```

## Slug Utilities

```typescript
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';

const url = buildArticleUrl(article); // uses slug if available, falls back to id
const url = buildCourseUrl(course);
```

## Component File Structure

```tsx
// Standard component file
import { useState } from 'react';
// UI primitives
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
// Hooks
import { useXList } from '@/api/hooks/useX';
// Types
import type { XDto } from '@/api/types';

interface Props {
  onSelect?: (item: XDto) => void;
}

export function XComponent({ onSelect }: Props) {
  const { data = [], isLoading } = useXList();
  // ...
}
```

## Stale Time Guidelines

| Data Type | staleTime |
|-----------|-----------|
| Tags, Categories, ContentTypes | 10 * 60 * 1000 (10 min) |
| Learning paths | 5 * 60 * 1000 (5 min) |
| User profile, Recommendations | 2-5 * 60 * 1000 |
| CMS articles/courses (list) | 2 * 60 * 1000 |
| Notifications | 60 * 1000 (1 min) |
| Dashboard stats | 60 * 1000 |
