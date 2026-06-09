import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetGroups = vi.fn();

vi.mock('@/api/services/groupService', () => ({
  groupService: {
    getGroups: (...args: unknown[]) => mockGetGroups(...args),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    getGroupMembers: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
  },
}));

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useGroupsQuery', () => {
  beforeEach(() => {
    mockGetGroups.mockReset();
  });

  it('returns groups data on successful fetch', async () => {
    const groups = [{ id: 1, name: 'Admin' }, { id: 2, name: 'Editor' }];
    mockGetGroups.mockResolvedValue({ items: groups, totalElements: 2 });

    const { useGroupsQuery } = await import('./useGroups');
    const { result } = renderHook(() => useGroupsQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.items[0].name).toBe('Admin');
  });

  it('is in loading state initially', async () => {
    mockGetGroups.mockReturnValue(new Promise(() => {}));

    const { useGroupsQuery } = await import('./useGroups');
    const { result } = renderHook(() => useGroupsQuery(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
  });

  it('is in error state when fetch fails', async () => {
    mockGetGroups.mockRejectedValue(new Error('Network error'));

    const { useGroupsQuery } = await import('./useGroups');
    const { result } = renderHook(() => useGroupsQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
