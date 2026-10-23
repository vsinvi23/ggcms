import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth() }));

const saveMutate = vi.fn();
const mockConsent = vi.fn();
vi.mock('@/api/hooks/usePrivacy', () => ({
  useRetention: () => ({ data: { consentPolicyVersion: '2026-01' } }),
  useConsent: () => mockConsent(),
  useSaveConsent: () => ({ mutate: saveMutate }),
}));

import { ConsentBanner } from './ConsentBanner';
import { getStoredConsent, openPrivacySettings } from '@/lib/consent';

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ConsentBanner />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  mockAuth.mockReturnValue({ isAuthenticated: false });
  mockConsent.mockReturnValue({ data: undefined });
});

describe('ConsentBanner', () => {
  it('shows for visitors with no decision and stores Accept locally', async () => {
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(getStoredConsent()).toMatchObject({ policyVersion: '2026-01', analytics: true });
    expect(saveMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /consent/i })).not.toBeInTheDocument();
  });

  it('stores Reject as all false', async () => {
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(getStoredConsent()).toMatchObject({ analytics: false, personalization: false, marketing: false });
  });

  it('persists to the server when signed in', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockConsent.mockReturnValue({
      data: { current: null, currentPolicyVersion: '2026-01', needsReconsent: false, history: [] },
    });
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(saveMutate).toHaveBeenCalledWith({ policyVersion: '2026-01', analytics: true, personalization: true, marketing: false });
  });

  it('stays hidden when consent exists for the current policy and reopens from the footer link', async () => {
    localStorage.setItem(
      'gg_consent',
      JSON.stringify({ policyVersion: '2026-01', analytics: false, personalization: false, marketing: false, decidedAt: 'x' }),
    );
    renderBanner();
    expect(screen.queryByRole('region', { name: /consent/i })).not.toBeInTheDocument();
    openPrivacySettings();
    expect(await screen.findByText('Privacy settings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Analytics' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save choices' }));
    expect(getStoredConsent()?.analytics).toBe(true);
  });

  it('asks again when the policy version changed', async () => {
    localStorage.setItem(
      'gg_consent',
      JSON.stringify({ policyVersion: '2025-01', analytics: true, personalization: true, marketing: false, decidedAt: 'x' }),
    );
    renderBanner();
    expect(await screen.findByRole('region', { name: /consent/i })).toBeInTheDocument();
  });
});
