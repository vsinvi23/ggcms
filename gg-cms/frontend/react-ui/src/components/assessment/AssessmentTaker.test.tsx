import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssessmentTaker } from './AssessmentTaker';

const svc = vi.hoisted(() => ({
  getDefinition: vi.fn(),
  start: vi.fn(),
  submit: vi.fn(),
  getMyAttempts: vi.fn(),
}));
vi.mock('@/api/services/assessmentService', () => ({ assessmentService: svc }));

const definition = {
  assessmentId: 9,
  title: 'Quiz',
  passMark: 70,
  questionCount: 1,
  maxAttempts: 2,
  questions: [{ id: '0', text: 'Pick one', options: ['A', 'B'], multiple: false }],
};
const openAttempt = {
  id: 3,
  assessmentId: 9,
  status: 'in_progress',
  score: null,
  correctCount: null,
  totalQuestions: 1,
  passMark: 70,
  passed: null,
  startedAt: '2026-01-01T00:00:00Z',
  submittedAt: null,
  durationSeconds: null,
};

function renderTaker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AssessmentTaker assessmentId={9} title="Quiz" />
    </QueryClientProvider>,
  );
}

async function startButton() {
  await screen.findByText('Attempts used');
  return screen.getByRole('button', { name: /Start test/i });
}

describe('AssessmentTaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getDefinition.mockResolvedValue(definition);
    svc.getMyAttempts.mockResolvedValue({ assessmentId: 9, passMark: 70, attemptsUsed: 0, bestScore: null, passed: false, attempts: [] });
  });

  it('starts, submits answers and shows the server result', async () => {
    svc.start.mockResolvedValue({ attempt: openAttempt, assessment: definition });
    svc.submit.mockResolvedValue({
      attempt: { ...openAttempt, status: 'submitted', score: 100, correctCount: 1, passed: true, submittedAt: '2026-01-01T00:05:00Z' },
      results: [{ questionId: '0', correct: true, explanation: 'Because B' }],
    });
    renderTaker();

    fireEvent.click(await startButton());
    fireEvent.click(await screen.findByLabelText('B'));
    fireEvent.click(screen.getByRole('button', { name: /Submit Test/i }));

    expect(await screen.findByText('100% Score')).toBeInTheDocument();
    expect(screen.getByText(/Passed/)).toBeInTheDocument();
    expect(screen.getByText('Because B')).toBeInTheDocument();
    expect(svc.submit).toHaveBeenCalledWith(9, 3, [{ questionId: '0', selected: [1] }]);
  });

  it('offers to resume an open attempt', async () => {
    svc.getMyAttempts.mockResolvedValue({ assessmentId: 9, passMark: 70, attemptsUsed: 1, bestScore: null, passed: false, attempts: [openAttempt] });
    renderTaker();
    expect(await screen.findByRole('button', { name: /Resume attempt/i })).toBeInTheDocument();
  });

  it('shows a clear message when max attempts is reached (409)', async () => {
    svc.start.mockRejectedValue({ response: { status: 409 } });
    renderTaker();
    fireEvent.click(await startButton());
    expect(await screen.findByText(/used all attempts/i)).toBeInTheDocument();
  });

  it('handles a double submit conflict without crashing', async () => {
    svc.start.mockResolvedValue({ attempt: openAttempt, assessment: definition });
    svc.submit.mockRejectedValue({ response: { status: 409 } });
    renderTaker();
    fireEvent.click(await startButton());
    fireEvent.click(await screen.findByLabelText('A'));
    fireEvent.click(screen.getByRole('button', { name: /Submit Test/i }));
    expect(await screen.findByText(/already submitted/i)).toBeInTheDocument();
    await waitFor(() => expect(svc.getMyAttempts.mock.calls.length).toBeGreaterThan(1));
  });
});
