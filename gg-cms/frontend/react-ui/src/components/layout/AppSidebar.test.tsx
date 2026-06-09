import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock NavLink to avoid complex active-class logic in tests
vi.mock('@/components/NavLink', () => ({
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { AppSidebar } from './AppSidebar';

function renderSidebar(isAdmin: boolean, isAuthenticated = true, initialPath = '/dashboard') {
  mockUseAuth.mockReturnValue({ isAdmin, isAuthenticated });
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppSidebar />
      </MemoryRouter>
    </TooltipProvider>
  );
}

// ─── Items visible to ALL authenticated users ─────────────────────────────────

describe('AppSidebar — items visible to all authenticated users', () => {
  it('regular user sees Dashboard nav item', () => {
    renderSidebar(false);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('regular user sees My Tasks nav item', () => {
    renderSidebar(false);
    expect(screen.getByText('My Tasks')).toBeInTheDocument();
  });

  it('regular user sees Courses nav item', () => {
    renderSidebar(false);
    expect(screen.getByText('Courses')).toBeInTheDocument();
  });

  it('regular user sees Articles nav item', () => {
    renderSidebar(false);
    expect(screen.getByText('Articles')).toBeInTheDocument();
  });

  it('regular user sees My Learning nav item', () => {
    renderSidebar(false);
    expect(screen.getByText('My Learning')).toBeInTheDocument();
  });
});

// ─── Admin-only items ─────────────────────────────────────────────────────────

describe('AppSidebar — admin-only items visible only to admins', () => {
  it('admin sees User Management section', () => {
    renderSidebar(true);
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('admin sees Settings section', () => {
    renderSidebar(true);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('admin sees Analytics nav item', () => {
    renderSidebar(true);
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('admin sees Manage Users link inside User Management', () => {
    renderSidebar(true, true, '/users');
    expect(screen.getByText('Manage Users')).toBeInTheDocument();
  });

  it('admin sees Roles & Permissions link', () => {
    renderSidebar(true, true, '/roles');
    expect(screen.getByText('Roles & Permissions')).toBeInTheDocument();
  });

  it('admin sees Configuration link under Settings', () => {
    renderSidebar(true, true, '/settings');
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });
});

// ─── Regular user does NOT see admin items ────────────────────────────────────

describe('AppSidebar — admin items hidden from regular users', () => {
  it('regular user does NOT see User Management section', () => {
    renderSidebar(false);
    expect(screen.queryByText('User Management')).toBeNull();
  });

  it('regular user does NOT see Manage Users', () => {
    renderSidebar(false);
    expect(screen.queryByText('Manage Users')).toBeNull();
  });

  it('regular user does NOT see Roles & Permissions', () => {
    renderSidebar(false);
    expect(screen.queryByText('Roles & Permissions')).toBeNull();
  });

  it('regular user does NOT see Analytics', () => {
    renderSidebar(false);
    expect(screen.queryByText('Analytics')).toBeNull();
  });

  it('regular user does NOT see System Settings', () => {
    renderSidebar(false);
    expect(screen.queryByText('System Settings')).toBeNull();
  });

  it('regular user does NOT see Configuration', () => {
    renderSidebar(false);
    expect(screen.queryByText('Configuration')).toBeNull();
  });
});

// ─── Admin user sees both common AND admin items ──────────────────────────────

describe('AppSidebar — admin user sees everything', () => {
  it('admin sees both common items and admin-only sections', () => {
    renderSidebar(true);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
