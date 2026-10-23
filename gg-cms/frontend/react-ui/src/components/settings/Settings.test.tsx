import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preferencesFixture } from '@/test/fixtures/analytics';

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/hooks/usePrivacy', () => ({
  usePreferences: () => ({ data: preferencesFixture, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdatePreferences: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteAccount: () => ({ mutate: deleteMutate, isPending: false }),
  useConsent: () => ({ data: undefined }),
  useRetention: () => ({ data: undefined }),
  useSaveConsent: () => ({ mutate: vi.fn(), isPending: false }),
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PreferencesForm } from './PreferencesSections';
import { DeleteAccountCard } from './DeleteAccountCard';

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
});

describe('PreferencesForm', () => {
  it('keeps Save disabled until something changes, then sends the edited preferences', async () => {
    render(<MemoryRouter><PreferencesForm /></MemoryRouter>);
    const save = screen.getByRole('button', { name: 'Save preferences' });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole('switch', { name: 'Replies to my comments email' }));
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0][0];
    expect(payload.notifications.comment_reply).toEqual({ inApp: true, email: false });
    expect(payload.digestFrequency).toBe('weekly');
  });
});

describe('DeleteAccountCard', () => {
  const open = async (onDeleted = vi.fn()) => {
    render(<DeleteAccountCard onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    return onDeleted;
  };

  it('requires the typed confirmation before deleting', async () => {
    await open();
    const confirm = screen.getByRole('button', { name: 'Delete permanently' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Confirmation'), 'DELETE');
    expect(confirm).toBeEnabled();
  });

  it('logs out after a successful delete', async () => {
    deleteMutate.mockImplementation((_pw: string | undefined, opts: { onSuccess: () => void }) => opts.onSuccess());
    const onDeleted = await open();
    await userEvent.type(screen.getByLabelText('Confirmation'), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(deleteMutate.mock.calls[0][0]).toBeUndefined();
    expect(onDeleted).toHaveBeenCalled();
  });

  it('asks for the password when re-authentication is required and then retries with it', async () => {
    deleteMutate.mockImplementationOnce((_pw: string | undefined, opts: { onError: (e: unknown) => void }) =>
      opts.onError({ response: { data: { code: 'reauth_required' } } }),
    );
    const onDeleted = await open();
    await userEvent.type(screen.getByLabelText('Confirmation'), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    const password = await screen.findByLabelText('Password');
    expect(onDeleted).not.toHaveBeenCalled();
    deleteMutate.mockImplementationOnce((_pw: string | undefined, opts: { onSuccess: () => void }) => opts.onSuccess());
    await userEvent.type(password, 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(deleteMutate.mock.calls[1][0]).toBe('hunter2hunter2');
  });
});
