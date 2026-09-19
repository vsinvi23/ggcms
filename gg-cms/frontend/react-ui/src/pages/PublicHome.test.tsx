import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicHome } from './PublicHome';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('@/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ learning_paths: true }),
}));

vi.mock('@/api/hooks/useProfile', () => ({
  useProfile: () => ({ data: null }),
}));

vi.mock('@/api/hooks/useDomains', () => ({
  useDomains: () => ({
    data: [
      { id: '1', name: 'Software Engineering', slug: 'software-engineering', articleCount: 10, courseCount: 5 },
      { id: '2', name: 'Cloud & Infrastructure', slug: 'cloud-infrastructure', articleCount: 8, courseCount: 3 },
    ],
  }),
}));

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({
    data: [
      { id: '1', name: 'React', slug: 'react' },
      { id: '2', name: 'Go', slug: 'go' },
    ],
  }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: '1', name: 'Backend Engineering', slug: 'backend' }],
  }),
}));

vi.mock('@/api/hooks/useTags', () => ({
  useTags: () => ({
    data: [{ name: 'frontend' }, { name: 'backend' }],
  }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({
    data: { items: [{ id: 'a1', title: 'Getting Started with Go', type: 'ARTICLE', blockCount: 3 }] },
    isLoading: false,
  }),
  usePublicLearningPaths: () => ({
    data: [{ id: 'lp1', title: 'Fullstack Go & React Developer', description: 'Master fullstack' }],
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicHome />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicHome Page', () => {
  it('renders hero title and quick-jump buttons', () => {
    renderPage();
    expect(screen.getByText(/Learn. Explore. Practice. Grow./i)).toBeInTheDocument();
    expect(screen.getByText('Learn a Technology')).toBeInTheDocument();
  });

  it('renders Explore Technologies section', () => {
    renderPage();
    expect(screen.getByText('Explore Technologies')).toBeInTheDocument();
  });
});
