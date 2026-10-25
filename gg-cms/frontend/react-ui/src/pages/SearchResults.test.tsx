import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { SearchParams, SearchResponse } from '@/api/types';
import { SearchResults } from './SearchResults';
import { emptySearchResponse, searchResponse, suggestResponse } from '@/test/fixtures/search';

interface SearchState {
  data?: SearchResponse;
  isLoading: boolean;
  isError: boolean;
}

const state: SearchState = { isLoading: false, isError: false };
const seen: SearchParams[] = [];

vi.mock('@/api/hooks/usePublicSearch', () => ({
  MIN_SUGGEST_LENGTH: 2,
  hasSearchCriteria: (p: SearchParams) => !!(p.q || p.category || p.topic || p.level || (p.type && p.type !== 'all')),
  usePublicSearch: (p: SearchParams) => {
    seen.push(p);
    return { ...state, isFetching: false, refetch: vi.fn() };
  },
  useSearchSuggest: () => ({ data: suggestResponse, isFetching: false, isError: false }),
}));
vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 1, name: 'Security', slug: 'security', parentId: null }] }),
}));
vi.mock('@/api/hooks/useTopics', () => ({
  useTopics: () => ({ data: [{ id: 5, name: 'OAuth', slug: 'oauth' }] }),
}));
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.search}</div>;
}

const setup = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SearchResults />
      <Where />
    </MemoryRouter>,
  );

describe('SearchResults', () => {
  beforeEach(() => {
    seen.length = 0;
    state.data = searchResponse(1);
    state.isLoading = false;
    state.isError = false;
    localStorage.clear();
  });

  it('renders only <mark> from server highlights and builds links from slugs', () => {
    setup('/search?q=oauth');
    const link = screen.getByRole('link', { name: /OAuth guide/ });
    expect(link).toHaveAttribute('href', '/article/security/oauth-guide');
    expect(link.querySelector('mark')).not.toBeNull();
    const card = link.closest('article') as HTMLElement;
    expect(card.querySelector('script')).toBeNull();
    expect(card.querySelector('img')).toBeNull();
    expect(card.innerHTML).not.toMatch(/onerror/i);
    expect(card.querySelectorAll('mark').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: 'Identity basics' })).toHaveAttribute('href', '/course/security/identity-basics');
    expect(screen.getByText(/Matches lesson: OAuth in practice/)).toBeInTheDocument();
  });

  it('reads filters and page from the URL (1-based in URL, 0-based to API)', () => {
    setup('/search?q=oauth&type=course&level=advanced&category=security&topic=oauth&page=2');
    expect(seen[seen.length - 1]).toMatchObject({ q: 'oauth', type: 'course', level: 'advanced', category: 'security', topic: 'oauth', page: 1, size: 10 });
    expect(screen.getByLabelText('Level')).toHaveValue('advanced');
  });

  it('syncs filter changes and pagination back to the URL', async () => {
    const user = userEvent.setup();
    setup('/search?q=oauth&page=2');
    await user.selectOptions(screen.getByLabelText('Level'), 'beginner');
    expect(screen.getByTestId('where').textContent).toBe('?q=oauth&level=beginner');
    await user.click(within(screen.getByRole('navigation', { name: 'Search pagination' })).getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('where').textContent).toBe('?q=oauth&level=beginner&page=2');
  });

  it('announces the result count in a live region', () => {
    setup('/search?q=oauth');
    const live = screen.getAllByRole('status').find((el) => el.textContent?.includes('25 results'));
    expect(live).toBeDefined();
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('shows did-you-mean suggestions and browse links on zero results', async () => {
    const user = userEvent.setup();
    state.data = emptySearchResponse;
    setup('/search?q=oautth');
    expect(screen.getByRole('heading', { name: /No results for/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Browse content' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'oauth flows' }));
    expect(screen.getByTestId('where').textContent).toBe('?q=oauth+flows');
  });

  it('shows an error state with retry', () => {
    state.data = undefined;
    state.isError = true;
    setup('/search?q=oauth');
    expect(screen.getByRole('alert')).toHaveTextContent('Search is unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not query without a term or filter', () => {
    state.data = undefined;
    setup('/search');
    expect(screen.getByText('What do you want to learn?')).toBeInTheDocument();
  });
});
