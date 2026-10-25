import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TutorPanel } from './TutorPanel';
import { EditorialAiPanel } from './EditorialAiPanel';
import { validateAiSettings, toForm } from './aiSettingsForm';
import { normalizeCitationUrl } from './aiErrors';
import { groundedAnswer, refusalAnswer, settingsView, statusOff, statusOn, summaryDraft } from '@/test/fixtures/mockAi';

const svc = vi.hoisted(() => ({
  getStatus: vi.fn(),
  ask: vi.fn(),
  sendFeedback: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listDrafts: vi.fn(),
  resolveDraft: vi.fn(),
  suggestTags: vi.fn(),
  generateSummary: vi.fn(),
  generateSeo: vi.fn(),
  qualityCheck: vi.fn(),
  generateQuiz: vi.fn(),
}));
vi.mock('@/api/services/aiService', () => ({ aiService: svc }));

const auth = vi.hoisted(() => ({ user: { emailVerified: true } as { emailVerified: boolean }, isAuthenticated: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/api/services/authService', () => ({ authService: { resendVerification: vi.fn().mockResolvedValue(undefined) } }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  svc.getStatus.mockResolvedValue(statusOn);
  svc.listDrafts.mockResolvedValue([]);
  auth.user = { emailVerified: true };
});

describe('TutorPanel', () => {
  it('shows a grounded answer as plain text with normalised citation links', async () => {
    svc.ask.mockResolvedValue(groundedAnswer);
    wrap(<TutorPanel contentType="course" contentId={3} />);
    await userEvent.type(await screen.findByLabelText('Your question'), 'What is hashing?');
    await userEvent.click(screen.getByRole('button', { name: /ask$/i }));
    expect(await screen.findByText(/Hashing is one-way/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    const link = screen.getByRole('link', { name: /Crypto 101 - Hashing/ });
    expect(link).toHaveAttribute('href', '/course/crypto-101#hashing');
    expect(svc.ask).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'course', contentId: 3, question: 'What is hashing?' }));
  });

  it('shows the not-enough-information state for an ungrounded answer', async () => {
    svc.ask.mockResolvedValue(refusalAnswer);
    wrap(<TutorPanel contentType="course" contentId={3} />);
    await userEvent.type(await screen.findByLabelText('Your question'), 'Something unrelated');
    await userEvent.click(screen.getByRole('button', { name: /ask$/i }));
    expect(await screen.findByText(/Not enough information in this course/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Sources')).toBeNull();
  });

  it('maps rate-limit errors to a friendly message', async () => {
    svc.ask.mockRejectedValue({ response: { status: 429, data: { code: 'AI_RATE_LIMITED' } } });
    wrap(<TutorPanel contentType="article" contentId={9} />);
    await userEvent.type(await screen.findByLabelText('Your question'), 'Why so fast?');
    await userEvent.click(screen.getByRole('button', { name: /ask$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too quickly/i);
  });

  it('disables asking once the daily limit is hit', async () => {
    svc.ask.mockRejectedValue({ response: { status: 429, data: { code: 'AI_DAILY_LIMIT' } } });
    wrap(<TutorPanel contentType="article" contentId={9} />);
    await userEvent.type(await screen.findByLabelText('Your question'), 'One more please');
    await userEvent.click(screen.getByRole('button', { name: /ask$/i }));
    expect(await screen.findByText(/Daily question limit reached/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your question')).toBeDisabled();
  });

  it('sends thumbs feedback', async () => {
    svc.ask.mockResolvedValue(groundedAnswer);
    svc.sendFeedback.mockResolvedValue(undefined);
    wrap(<TutorPanel contentType="course" contentId={3} />);
    await userEvent.type(await screen.findByLabelText('Your question'), 'What is hashing?');
    await userEvent.click(screen.getByRole('button', { name: /ask$/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Helpful' }));
    await waitFor(() => expect(svc.sendFeedback).toHaveBeenCalledWith(7, 1));
    expect(screen.getByRole('button', { name: 'Helpful' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders nothing when AI is disabled', async () => {
    svc.getStatus.mockResolvedValue(statusOff);
    const { container } = wrap(<TutorPanel contentType="course" contentId={3} />);
    await waitFor(() => expect(svc.getStatus).toHaveBeenCalled());
    expect(container.querySelector('#tutor-title')).toBeNull();
  });

  it('prompts unverified users to verify their email', async () => {
    auth.user = { emailVerified: false };
    wrap(<TutorPanel contentType="course" contentId={3} />);
    expect(await screen.findByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Your question')).toBeNull();
  });
});

describe('EditorialAiPanel', () => {
  it('accepts and rejects drafts only on explicit click', async () => {
    svc.listDrafts.mockResolvedValue([summaryDraft, { ...summaryDraft, id: 'd2' }]);
    svc.resolveDraft.mockResolvedValue({ ...summaryDraft, status: 'accepted' });
    wrap(<EditorialAiPanel contentType="article" contentId={5} />);
    const accepts = await screen.findAllByRole('button', { name: /accept summary draft/i });
    expect(svc.resolveDraft).not.toHaveBeenCalled();
    await userEvent.click(accepts[0]);
    await waitFor(() => expect(svc.resolveDraft).toHaveBeenCalledWith('d1', true));
    await userEvent.click(screen.getAllByRole('button', { name: /reject summary draft/i })[1]);
    await waitFor(() => expect(svc.resolveDraft).toHaveBeenCalledWith('d2', false));
  });

  it('applies a suggested topic only when clicked', async () => {
    svc.suggestTags.mockResolvedValue({ topics: [{ id: 4, name: 'Cryptography', score: 0.9 }], categories: [], tags: [], source: 'llm' });
    const onApplyTopic = vi.fn();
    wrap(<EditorialAiPanel contentType="article" contentId={5} onApplyTopic={onApplyTopic} />);
    await userEvent.click(await screen.findByRole('button', { name: /suggest topics/i }));
    expect(onApplyTopic).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    expect(onApplyTopic).toHaveBeenCalledWith(4);
  });

  it('is hidden when the editorial feature is off', async () => {
    svc.getStatus.mockResolvedValue({ ...statusOn, features: { ...statusOn.features, editorial: false } });
    wrap(<EditorialAiPanel contentType="article" contentId={5} />);
    await waitFor(() => expect(svc.getStatus).toHaveBeenCalled());
    expect(screen.queryByText('AI assistant')).toBeNull();
  });
});

describe('AI settings validation', () => {
  it('accepts the current settings', () => {
    expect(validateAiSettings(toForm(settingsView))).toEqual({});
  });

  it('rejects bad models, limits and budgets', () => {
    const f = { ...toForm(settingsView), modelDefault: 'gpt-4', userPerMinute: '0', userDailyTutor: '1.5', monthlyBudgetUsd: '-1' };
    const e = validateAiSettings(f);
    expect(e.modelDefault).toBeDefined();
    expect(e.userPerMinute).toBeDefined();
    expect(e.userDailyTutor).toBeDefined();
    expect(e.monthlyBudgetUsd).toBeDefined();
  });

  it('rejects a per-request budget above the monthly budget', () => {
    const e = validateAiSettings({ ...toForm(settingsView), monthlyBudgetUsd: '1', perRequestBudgetUsd: '2' });
    expect(e.perRequestBudgetUsd).toBeDefined();
  });
});

describe('normalizeCitationUrl', () => {
  it('maps backend plural paths to SPA routes and rejects absolute urls', () => {
    expect(normalizeCitationUrl('/articles/my-post#intro', 'article')).toBe('/article/my-post#intro');
    expect(normalizeCitationUrl('/courses/abc#x y', 'course')).toBe('/course/abc');
    expect(normalizeCitationUrl('https://evil.example/a', 'article')).toBe('');
    expect(normalizeCitationUrl('javascript:alert(1)', 'article')).toBe('');
  });
});
