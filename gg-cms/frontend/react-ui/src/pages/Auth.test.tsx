import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import Auth from './Auth';
import { oauthErrorMessage, safeRedirectPath } from '@/components/auth/oauthMessages';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockSocialLogin = vi.fn();
const mockNavigate = vi.fn();
const providersState = vi.hoisted(() => ({ list: [] as { id: string; name: string }[] }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    signup: mockSignup,
    socialLogin: mockSocialLogin,
    isLoading: false,
    isAuthenticated: false,
  }),
}));

vi.mock('@/components/auth/useAuthProviders', () => ({
  useAuthProviders: () => providersState.list,
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
    providersState.list = [];
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
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my-long-passphrase' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'my-long-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith('jane@example.com', 'my-long-passphrase', 'Jane Doe');
    });
  });

  it('does not call signup when passwords do not match', async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => screen.getByLabelText(/Full Name/i));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass-one-long-1' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'pass-two-long-2' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  it('requires at least 12 characters for the new password', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => screen.getByLabelText(/Full Name/i));
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '12');
  });

  it('shows a confirmation notice and stays put when signup returns info', async () => {
    mockSignup.mockResolvedValue({ info: 'Please sign in to continue.' });
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('tab', { name: /Sign Up/i }));
    await waitFor(() => screen.getByLabelText(/Full Name/i));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my-long-passphrase' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'my-long-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard');
  });
});

describe('Auth page — social providers', () => {
  beforeEach(() => {
    mockSocialLogin.mockReset();
    providersState.list = [];
  });

  it('shows no social buttons when the backend reports no enabled providers', () => {
    renderAuth();
    expect(screen.queryByText(/Continue with/i)).toBeNull();
  });

  it('renders one "Continue with" button per enabled provider', () => {
    providersState.list = [{ id: 'google', name: 'Google' }, { id: 'linkedin', name: 'LinkedIn' }];
    renderAuth();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with LinkedIn/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with GitHub/i })).toBeNull();
  });

  it('starts the provider flow when a button is clicked', async () => {
    providersState.list = [{ id: 'github', name: 'GitHub' }];
    const user = userEvent.setup();
    renderAuth();
    await user.click(screen.getByRole('button', { name: /Continue with GitHub/i }));
    expect(mockSocialLogin).toHaveBeenCalledWith('github', '/');
  });
});

describe('oauth callback helpers', () => {
  it('maps known codes to fixed messages and unknown codes to a generic one', () => {
    expect(oauthErrorMessage('email_unverified')).toMatch(/not verified/i);
    expect(oauthErrorMessage('<script>alert(1)</script>')).toBe(oauthErrorMessage(null));
  });

  it('only allows relative redirect paths', () => {
    expect(safeRedirectPath('/courses/1')).toBe('/courses/1');
    for (const bad of ['//evil.com', 'https://evil.com', '/' + String.fromCharCode(92) + 'evil.com', 'javascript:alert(1)', '', null]) {
      expect(safeRedirectPath(bad as string | null)).toBe('/dashboard');
    }
  });
});
