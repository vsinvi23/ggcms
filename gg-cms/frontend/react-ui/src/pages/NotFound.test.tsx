import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import NotFound from './NotFound';

function renderNotFound(path = '/some/bad/path') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>
  );
}

describe('NotFound page', () => {
  it('renders the 404 heading', () => {
    renderNotFound();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders the "Page not found" message', () => {
    renderNotFound();
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
  });

  it('renders a "Return to Home" link pointing to "/"', () => {
    renderNotFound();
    const link = screen.getByRole('link', { name: /Return to Home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
