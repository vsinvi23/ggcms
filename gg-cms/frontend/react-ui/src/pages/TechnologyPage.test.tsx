import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TechnologyPage from './TechnologyPage';

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 1, name: 'Identity & Access', slug: 'identity-access', description: 'OAuth and IAM security.' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({
    data: [
      { id: 10, name: 'OAuth 2.0', slug: 'oauth-2-0', description: 'OAuth protocol' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/useTags', () => ({
  useTags: () => ({
    data: [
      { id: 20, name: 'OAuth', slug: 'oauth' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: ({ type }: { type?: string } = {}) => ({
    data: {
      items: type === 'ARTICLE' ? [
        {
          id: 'a1',
          title: 'OAuth 2.0 In Depth Guide',
          type: 'ARTICLE',
          articleType: 'GUIDE',
          categoryId: 1,
          categoryName: 'Identity & Access',
          description: 'Comprehensive OAuth 2.0 tutorial.',
        },
      ] : [],
    },
    isLoading: false,
  }),
  usePublicCmsBody: () => ({ data: '', isLoading: false }),
}));

function renderTechnologyPage(slug = 'identity-access') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/technology/${slug}`]}>
        <Routes>
          <Route path="/technology/:slug" element={<TechnologyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TechnologyPage (Category Detail Article Catalog)', () => {
  it('renders clean category header, search bar, and article grid', () => {
    renderTechnologyPage();
    expect(screen.getAllByText('Identity & Access')[0]).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search articles & resources in Identity & Access/i)).toBeInTheDocument();
    expect(screen.getByText('OAuth 2.0 In Depth Guide')).toBeInTheDocument();
  });

  it('renders filter tags bar and content type filter buttons', () => {
    renderTechnologyPage();
    expect(screen.getByText('#OAuth')).toBeInTheDocument();
    expect(screen.getByText('All (1)')).toBeInTheDocument();
    expect(screen.getByText('Articles (1)')).toBeInTheDocument();
  });
});
