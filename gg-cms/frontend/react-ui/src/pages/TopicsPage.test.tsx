import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopicsPage from './TopicsPage';

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({
    data: [
      { id: '1', name: 'Go', slug: 'go', description: 'Go programming language' },
      { id: '2', name: 'Docker', slug: 'docker', description: 'Containerization tool' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: '1', name: 'Backend Engineering', slug: 'backend' }],
  }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({
    data: {
      items: [
        { id: 'c1', title: 'Go Microservices', type: 'COURSE', topics: [{ name: 'Go' }] },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/useDomains', () => ({
  useDomains: () => ({
    data: [
      { id: 'd1', name: 'Software Engineering', slug: 'software-engineering' },
    ],
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TopicsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TopicsPage (Panel 4 UI Spec)', () => {
  it('renders topics page header and filter tabs', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Topics/i })).toBeInTheDocument();
    expect(screen.getByText('All Topics')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByText('By Domain')).toBeInTheDocument();
  });

  it('renders topic cards with live API counts', () => {
    renderPage();
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
  });
});
