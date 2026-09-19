import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}));

vi.mock('@/components/personalization/VisitorImportDialog', () => ({
  VisitorImportDialog: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    isAuthenticated: true,
    isAdmin: true,
    isLoading: false,
    userGroups: [],
    groupNames: ['ADMIN'],
    visitorProfileImported: false,
    clearVisitorImportFlag: vi.fn(),
  }),
}));

const mockUsersData = {
  items: [
    { id: 1, status: 'ACTIVE' },
    { id: 2, status: 'ACTIVE' },
    { id: 3, status: 'INACTIVE' },
    { id: 4, status: 'PENDING' },
  ],
  totalElements: 4,
};

vi.mock('@/api/hooks/useUsers', () => ({
  useUsersQuery: () => ({ data: mockUsersData, isLoading: false }),
}));

vi.mock('@/api/hooks/useTasks', () => ({
  useTasksQuery: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock('@/api/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://localhost:1337/api',
  APP_NAME: 'TestApp',
  ADMIN_GROUP_NAME: 'Admin',
  TOKEN_STORAGE_KEY: 'authToken',
  USER_STORAGE_KEY: 'auth_user',
  GROUPS_STORAGE_KEY: 'user_groups_cache',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import DashboardPage from './Dashboard';

function createStore() {
  return configureStore({ reducer: { user: (s = {}) => s } });
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = createStore();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inside DashboardLayout', () => {
    renderDashboard();
    expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
  });

  it('renders the Admin Command Center heading', () => {
    renderDashboard();
    expect(screen.getByText('Admin Command Center')).toBeInTheDocument();
  });

  it('renders Total Members stat card', () => {
    renderDashboard();
    expect(screen.getByText('Total Members')).toBeInTheDocument();
  });

  it('renders Tech Domains stat card', () => {
    renderDashboard();
    expect(screen.getByText('Tech Domains')).toBeInTheDocument();
  });

  it('renders Published Articles stat card', () => {
    renderDashboard();
    expect(screen.getByText('Published Articles')).toBeInTheDocument();
  });

  it('renders AI Content Factory button', () => {
    renderDashboard();
    expect(screen.getByText('AI Content Factory')).toBeInTheDocument();
  });
});
