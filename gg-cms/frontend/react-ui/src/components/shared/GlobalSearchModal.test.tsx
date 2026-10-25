import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GlobalSearchModal } from './GlobalSearchModal';
import { suggestResponse } from '@/test/fixtures/search';

vi.mock('@/api/hooks/usePublicSearch', () => ({
  MIN_SUGGEST_LENGTH: 2,
  useSearchSuggest: (q: string) => ({
    data: q.length >= 2 ? suggestResponse : undefined,
    isFetching: false,
    isError: false,
  }),
}));

describe('GlobalSearchModal (Ctrl/Cmd+K search)', () => {
  it('renders a focused combobox with server suggestions and closes on selection', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GlobalSearchModal open={true} onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await user.type(input, 'oau');
    expect(await screen.findByRole('option', { name: 'OAuth guide' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Security' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'OAuth guide' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
