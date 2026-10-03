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
      id: 101,
      slug: 'cloud-native',
      kind: 'STRUCTURED_PATH',
      title: 'Cloud Native Architect',
      description: 'Master Kubernetes, Go, and GCP',
      courses: [
        { courseId: 1, sortOrder: 1, title: 'Container Security Masterclass', slug: 'container-security', status: 'PUBLISHED' },
      ],
    },
    isLoading: false,
  }),
  usePublicCmsList: () => ({ data: { items: [] }, isLoading: false }),
  usePublicLearningPaths: () => ({
    data: [{ id: 102, slug: 'fullstack-go', kind: 'STRUCTURED_PATH', title: 'Fullstack Go Developer', description: '', courseCount: 4 }],
  }),
}));

vi.mock('@/api/services/sectionService', () => ({
  sectionService: { getSectionsByCourse: () => Promise.resolve([]) },
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
          <Route path="/learn/:path" element={<LearningPathPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LearningPathPage', () => {
  it('renders one landing page with intro, curriculum modules and start action', () => {
    renderPage();

    expect(screen.getAllByText('Cloud Native Architect')[0]).toBeInTheDocument();
    expect(screen.getByText('Master Kubernetes, Go, and GCP')).toBeInTheDocument();
    expect(screen.getByText('Curriculum')).toBeInTheDocument();
    expect(screen.getAllByText('Container Security Masterclass')[0]).toBeInTheDocument();
    expect(screen.getByText('Start Learning Path')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('shows a compact related paths rail', () => {
    renderPage();

    expect(screen.getByText('Related Paths')).toBeInTheDocument();
    expect(screen.getByText('Fullstack Go Developer')).toBeInTheDocument();
    expect(screen.getByText('4 modules')).toBeInTheDocument();
  });
});
