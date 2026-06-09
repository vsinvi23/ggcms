import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/api/services/tagService', () => ({
  tagService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    getCategoryTags: vi.fn(),
    setCategoryTags: vi.fn(),
  },
}));

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTags', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
  });

  it('returns tags on success', async () => {
    const tags = [{ id: 1, name: 'react' }, { id: 2, name: 'go' }];
    mockGetAll.mockResolvedValue(tags);

    const { useTags } = await import('./useTags');
    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it('returns error state on failure', async () => {
    mockGetAll.mockRejectedValue(new Error('Server error'));

    const { useTags } = await import('./useTags');
    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateTag', () => {
  beforeEach(() => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockReset();
  });

  it('calls tagService.create with the tag name string', async () => {
    mockCreate.mockResolvedValue({ id: 3, name: 'typescript' });

    const { useCreateTag } = await import('./useTags');
    const { result } = renderHook(() => useCreateTag(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync('TypeScript');
    });

    expect(mockCreate).toHaveBeenCalledWith('TypeScript');
  });
});

describe('useDeleteTag', () => {
  beforeEach(() => {
    mockGetAll.mockResolvedValue([]);
    mockDelete.mockReset();
  });

  it('calls tagService.delete with the correct id', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { useDeleteTag } = await import('./useTags');
    const { result } = renderHook(() => useDeleteTag(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(42);
    });

    expect(mockDelete).toHaveBeenCalledWith(42);
  });
});
