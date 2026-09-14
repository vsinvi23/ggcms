import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PublicHome from './PublicHome';

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

describe('PublicHome Page (Panel 1 UI Spec)', () => {
  it('renders hero title and search input', () => {
    renderPage();
    expect(screen.getByText(/Build Better./i)).toBeInTheDocument();
    expect(screen.getByText(/Learn Deeper./i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/What do you want to learn today?/i)).toBeInTheDocument();
  });

  it('renders Explore by Domain section directly under hero', () => {
    renderPage();
    expect(screen.getByText('Explore by Domain')).toBeInTheDocument();
    expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    expect(screen.getByText('Cloud & Infrastructure')).toBeInTheDocument();
  });

  it('renders popular topics and latest articles', () => {
    renderPage();
    expect(screen.getByText('Popular Topics')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Getting Started with Go')).toBeInTheDocument();
  });
});
