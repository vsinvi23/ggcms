import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRoute(
  authState: { isAuthenticated: boolean; isAdmin: boolean; isLoading: boolean }
) {
  mockUseAuth.mockReturnValue(authState);
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<div>Auth Page</div>} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading spinner while auth is resolving', () => {
    renderWithRoute({ isAuthenticated: false, isAdmin: false, isLoading: true });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('redirects to /auth when not authenticated', () => {
    renderWithRoute({ isAuthenticated: false, isAdmin: false, isLoading: false });
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('renders children when authenticated', () => {
    renderWithRoute({ isAuthenticated: true, isAdmin: false, isLoading: false });
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to / when requireAdmin=true but user is not admin', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false, isLoading: false });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).toBeNull();
  });

  it('renders children when requireAdmin=true and user is admin', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true, isLoading: false });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
