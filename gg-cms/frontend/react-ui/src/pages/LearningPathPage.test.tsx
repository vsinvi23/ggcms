import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LearningPathPage from './LearningPathPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicLearningPathById: () => ({
    data: {
      id: 'lp-101',
      title: 'Cloud Native Architect',
      description: 'Master Kubernetes, Go, and GCP',
      courses: [
        { id: 'c1', title: 'Container Security Masterclass' },
      ],
    },
    isLoading: false,
  }),
  usePublicLearningPaths: () => ({
    data: [
      { id: 'lp-102', title: 'Fullstack Go Developer' },
    ],
  }),
  usePublicCmsList: () => ({
    data: { items: [] },
  }),
}));

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useEnrollments', () => ({
  useMyEnrollments: () => ({ data: [] }),
  useEnroll: () => ({ mutate: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/learn/lp-101']}>
        <Routes>
          <Route path="/learn/:id" element={<LearningPathPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LearningPathPage (Panel 5 UI Spec)', () => {
  it('renders learning path details and skills sidebar', () => {
    renderPage();

    expect(screen.getAllByText('Cloud Native Architect')[0]).toBeInTheDocument();
    expect(screen.getByText('Master Kubernetes, Go, and GCP')).toBeInTheDocument();
    expect(screen.getByText("Skills You'll Gain")).toBeInTheDocument();
    expect(screen.getByText('Build secure, high-performance APIs')).toBeInTheDocument();
  });
});
