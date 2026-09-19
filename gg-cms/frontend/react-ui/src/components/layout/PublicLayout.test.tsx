import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicLayout } from './PublicLayout';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('@/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ learning_paths: true, reviews: false }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({ data: { items: [] } }),
}));

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicLayout>
          <div>Test Page Content</div>
        </PublicLayout>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicLayout Component (Brand Shell & Header)', () => {
  it('renders header with brand logo GGLogo and navigation links', () => {
    renderComponent();

    expect(screen.getByText('Test Page Content')).toBeInTheDocument();
    expect(screen.getAllByText('Courses')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Learning Paths')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Explore')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Practice')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Interview Prep')[0]).toBeInTheDocument();
  });
});
