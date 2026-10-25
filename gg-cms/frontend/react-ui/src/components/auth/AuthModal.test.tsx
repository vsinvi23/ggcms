import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthModal } from './AuthModal';

const signup = vi.fn();
const toast = vi.fn();
const navigate = vi.fn();
const onOpenChange = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), signup, socialLogin: vi.fn(), isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/auth/useAuthProviders', () => ({ useAuthProviders: () => [] }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

function fillAndSubmit(redirectToDashboard?: boolean) {
  render(
    <MemoryRouter>
      <AuthModal open onOpenChange={onOpenChange} defaultTab="signup" redirectToDashboard={redirectToDashboard} />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText('Email', { selector: '#modal-signup-email' }), { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getByLabelText('Password', { selector: '#modal-signup-password' }), { target: { value: 'a-long-passphrase-1' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'a-long-passphrase-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
}

describe('AuthModal signup with the 202 register contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the info message and switches to login when signup cannot start a session', async () => {
    signup.mockResolvedValue({ info: 'Please sign in to continue.' });
    fillAndSubmit();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Check your email', description: 'Please sign in to continue.' })));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes without redirecting when signup logs the user in and redirect is disabled', async () => {
    signup.mockResolvedValue({});
    fillAndSubmit(false);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard by default after a successful signup', async () => {
    signup.mockResolvedValue({});
    fillAndSubmit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
  });
});
