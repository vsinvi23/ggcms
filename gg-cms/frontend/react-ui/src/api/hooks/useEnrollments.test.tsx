import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSyncLocalProgress } from './useEnrollments';

const svc = vi.hoisted(() => ({ syncLocal: vi.fn() }));
vi.mock('../services/enrollmentService', () => ({ enrollmentService: svc }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useSyncLocalProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does nothing for anonymous visitors', () => {
    localStorage.setItem('ggcms_completed_lessons_5', JSON.stringify([1]));
    renderHook(() => useSyncLocalProgress(false), { wrapper });
    expect(svc.syncLocal).not.toHaveBeenCalled();
    expect(localStorage.getItem('ggcms_completed_lessons_5')).not.toBeNull();
  });

  it('uploads guest progress once after login and clears it', async () => {
    localStorage.setItem('ggcms_completed_lessons_5', JSON.stringify([1, 2]));
    svc.syncLocal.mockResolvedValue([{ courseId: 5, accepted: 2, rejected: 0, progress: 50, status: 'active' }]);
    const { rerender } = renderHook(() => useSyncLocalProgress(true), { wrapper });
    await waitFor(() => expect(localStorage.getItem('ggcms_completed_lessons_5')).toBeNull());
    rerender();
    expect(svc.syncLocal).toHaveBeenCalledTimes(1);
    expect(svc.syncLocal).toHaveBeenCalledWith([{ courseId: 5, completedLessonIds: [1, 2] }]);
  });

  it('keeps local progress when the upload fails so it can retry later', async () => {
    localStorage.setItem('ggcms_completed_lessons_5', JSON.stringify([1]));
    svc.syncLocal.mockRejectedValue(new Error('offline'));
    renderHook(() => useSyncLocalProgress(true), { wrapper });
    await waitFor(() => expect(svc.syncLocal).toHaveBeenCalled());
    expect(localStorage.getItem('ggcms_completed_lessons_5')).not.toBeNull();
  });
});
