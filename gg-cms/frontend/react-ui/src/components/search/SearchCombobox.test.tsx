import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SearchCombobox } from './SearchCombobox';
import { suggestResponse } from '@/test/fixtures/search';

vi.mock('@/api/hooks/usePublicSearch', () => ({
  MIN_SUGGEST_LENGTH: 2,
  useSearchSuggest: (q: string) => ({
    data: q.length >= 2 ? suggestResponse : undefined,
    isFetching: false,
    isError: false,
  }),
}));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const setup = () =>
  render(
    <MemoryRouter>
      <SearchCombobox label="Search site" />
      <Where />
    </MemoryRouter>,
  );

describe('SearchCombobox', () => {
  beforeEach(() => localStorage.clear());

  it('exposes the WAI-ARIA combobox pattern and announces option counts', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('combobox', { name: 'Search site' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.type(input, 'oau');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(6));
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option').length).toBe(6);
    expect(screen.getByRole('status')).toHaveTextContent('6 options available');
  });

  it('moves the active option with arrow keys and opens it with Enter', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'oau');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(6));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/article/security/oauth-guide');
  });

  it('submits the typed query on Enter with no active option and stores it as recent', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('combobox'), 'oau{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=oau');
    expect(JSON.parse(localStorage.getItem('gg_recent_searches') ?? '[]')).toEqual(['oau']);
  });

  it('closes the list on Escape', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'oau');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows and clears recent searches', async () => {
    localStorage.setItem('gg_recent_searches', JSON.stringify(['golang']));
    const user = userEvent.setup();
    setup();
    fireEvent.focus(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'golang' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear recent searches' }));
    expect(screen.queryByRole('option')).toBeNull();
    expect(localStorage.getItem('gg_recent_searches')).toBeNull();
  });
});
