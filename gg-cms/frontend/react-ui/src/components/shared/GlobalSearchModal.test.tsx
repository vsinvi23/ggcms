import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalSearchModal } from './GlobalSearchModal';

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({
    data: {
      items: [
        { id: '1', title: 'Advanced Go Concurrency', type: 'ARTICLE' },
        { id: '2', title: 'Docker Essentials', type: 'COURSE' },
      ],
    },
  }),
}));

vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({
    data: [{ id: '1', name: 'Go', slug: 'go' }],
  }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: '1', name: 'Backend Engineering', slug: 'backend' }],
  }),
}));

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GlobalSearchModal open={true} onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GlobalSearchModal (⌘K Spotlight Search)', () => {
  it('renders search modal input and results capped at 3 per section when open', () => {
    renderComponent();

    const input = screen.getByPlaceholderText(/Search courses, articles, topics/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Go' } });

    expect(screen.getByText('Advanced Go Concurrency')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
  });
});
