import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import Auth from './Auth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    signup: mockSignup,
    socialLogin: vi.fn(),
    isLoading: false,
    isAuthenticated: false,
  }),
}));

vi.mock('@/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ social_login: false }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://localhost:1337/api',
  APP_NAME: 'TestApp',
  ADMIN_GROUP_NAME: 'Admin',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderAuth() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <Auth />
      </MemoryRouter>
    </TooltipProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth page — Login tab', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockSignup.mockReset();
    mockNavigate.mockReset();
  });

  it('renders Login and Sign Up tabs', () => {
    renderAuth();
    expect(screen.getByRole('tab', { name: /Login/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sign Up/i })).toBeInTheDocument();
  });

  it('renders email and password fields on the login tab', () => {
    renderAuth();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  it('renders "Back to Home" link', () => {
    renderAuth();
    expect(screen.getByRole('link', { name: /Back to Home/i })).toBeInTheDocument();
  });

  it('calls login with entered credentials on submit', async () => {
    mockLogin.mockResolvedValue({});
    renderAuth();

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret123');
    });
  });

  it('navigates to /dashboard after successful login', async () => {
    mockLogin.mockResolvedValue({});
    renderAuth();

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('does not navigate on login error', async () => {
    mockLogin.mockResolvedValue({ error: 'Invalid email or password' });
    renderAuth();

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard');
    });
  });
});

describe('Auth page — Sign Up tab', () => {
  beforeEach(() => {
    mockSignup.mockReset();
    mockNavigate.mockReset();
  });

  it('renders signup form fields after switching tab', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
    });
  });

  it('calls signup with entered data on submit', async () => {
    mockSignup.mockResolvedValue({});
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => screen.getByLabelText(/Full Name/i));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'mypassword' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith('jane@example.com', 'mypassword', 'Jane Doe');
    });
  });

  it('does not call signup when passwords do not match', async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => screen.getByLabelText(/Full Name/i));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass1' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'pass2' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  it('does not show social login buttons when feature flag is off', () => {
    renderAuth();
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByText('GitHub')).toBeNull();
  });
});
