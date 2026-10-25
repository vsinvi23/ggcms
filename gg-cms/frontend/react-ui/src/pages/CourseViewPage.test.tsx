import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseViewPage } from './CourseViewPage';

const enroll = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    isAdmin: false,
    isMasterAdmin: false,
    canQuickEditPublic: false,
  }),
}));

vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/auth/AuthModal', () => ({
  AuthModal: ({ open }: { open: boolean }) => (open ? <div data-testid="auth-modal" /> : null),
}));

vi.mock('@/components/engagement/HighlightOverlay', () => ({ HighlightOverlay: () => null }));
vi.mock('@/components/engagement/HighlightsPanel', () => ({ HighlightsPanel: () => null }));
vi.mock('@/components/engagement/InteractionBar', () => ({ InteractionBar: () => null }));
vi.mock('@/components/shared/CommentsSection', () => ({ CommentsSection: () => null }));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsById: () => ({
    data: {
      id: 7,
      slug: 'go-basics',
      type: 'COURSE',
      title: 'Go Basics',
      description: 'Learn Go',
      body: null,
      categoryName: 'Programming',
      status: 'PUBLISHED',
    },
    isLoading: false,
  }),
  usePublicCmsList: () => ({ data: { items: [] }, isLoading: false }),
  usePublicLearningPathById: () => ({ data: undefined }),
  usePublicLearningPaths: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useSections', () => ({
  useSectionsByCourse: () => ({
    data: [
      {
        id: 1,
        title: 'Intro',
        order: 1,
        lessons: [{ id: 11, title: 'Hello Go', type: 'text', duration: 5, order: 1, content: '<p>Welcome</p>' }],
      },
    ],
  }),
}));

vi.mock('@/api/hooks/useEnrollments', () => ({
  useMyEnrollment: () => ({ data: undefined }),
  useEnroll: () => ({ mutate: enroll, mutateAsync: enroll }),
  useUpdateProgress: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCourseResume: () => ({ data: undefined, isLoading: false }),
  useSyncLocalProgress: () => undefined,
}));

vi.mock('@/api/hooks/useCms', () => ({
  useUpdateCms: () => ({ mutateAsync: vi.fn() }),
  useSubmitCmsForReview: () => ({ mutateAsync: vi.fn() }),
  useCmsById: () => ({ data: undefined }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/course/programming/go-basics']}>
        <Routes>
          <Route path="/course/*" element={<CourseViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CourseViewPage lesson gating', () => {
  it('opens the auth modal and does not open a lesson when an anonymous visitor clicks Start Learning', () => {
    renderPage();
    expect(screen.queryByTestId('auth-modal')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Start Learning/i }));

    expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
    expect(screen.queryByText('Welcome')).toBeNull();
    expect(enroll).not.toHaveBeenCalled();
  });
});
