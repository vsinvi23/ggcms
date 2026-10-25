import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Trophy, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toUserMessage } from '@/lib/errors';
import { useAssessmentDefinition, useMyAssessmentAttempts, useStartAssessment, useSubmitAssessment } from '@/api/hooks/useAssessments';
import {
  AssessmentAttemptDto,
  AssessmentDefinitionDto,
  AssessmentQuestionResultDto,
} from '@/api/types';

interface AssessmentTakerProps {
  assessmentId: number;
  title: string;
  description?: string;
}

const statusOf = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

export function AssessmentTaker({ assessmentId, title, description }: AssessmentTakerProps) {
  const history = useMyAssessmentAttempts(assessmentId);
  const info = useAssessmentDefinition(assessmentId);
  const start = useStartAssessment();
  const submit = useSubmitAssessment();

  const [definition, setDefinition] = useState<AssessmentDefinitionDto | null>(null);
  const [attempt, setAttempt] = useState<AssessmentAttemptDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ attempt: AssessmentAttemptDto; results: AssessmentQuestionResultDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = history.data;
  const openAttempt = data?.attempts.find(a => a.submittedAt === null);
  const submitted = data?.attempts.filter(a => a.submittedAt !== null) ?? [];

  const handleStart = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await start.mutateAsync(assessmentId);
      setDefinition(res.assessment);
      setAttempt(res.attempt);
      setAnswers({});
      setIndex(0);
    } catch (err) {
      setError(
        statusOf(err) === 409
          ? 'You have used all attempts for this assessment.'
          : toUserMessage(err, 'Could not start the assessment. Please try again.'),
      );
      history.refetch();
    }
  };

  const toggle = (questionId: string, optionIdx: number, multiple: boolean) => {
    setAnswers(prev => {
      const current = prev[questionId] ?? [];
      if (!multiple) return { ...prev, [questionId]: [optionIdx] };
      return {
        ...prev,
        [questionId]: current.includes(optionIdx) ? current.filter(i => i !== optionIdx) : [...current, optionIdx],
      };
    });
  };

  const handleSubmit = async () => {
    if (!definition || !attempt || submit.isPending) return;
    setError(null);
    try {
      const res = await submit.mutateAsync({
        assessmentId,
        attemptId: attempt.id,
        answers: definition.questions.map(q => ({ questionId: q.id, selected: answers[q.id] ?? [] })),
      });
      setResult(res);
      setAttempt(null);
    } catch (err) {
      if (statusOf(err) === 409) {
        setError('This attempt was already submitted. Your result is in the history below.');
        setAttempt(null);
        setDefinition(null);
        history.refetch();
      } else {
        setError(toUserMessage(err, 'Could not submit your answers. Please try again.'));
      }
    }
  };

  const question = definition && attempt ? definition.questions[index] : null;
  const answeredCount = definition ? definition.questions.filter(q => (answers[q.id] ?? []).length > 0).length : 0;
  const passMark = result?.attempt.passMark ?? data?.passMark;
  const attemptsLimit = (definition ?? info.data)?.maxAttempts ?? 0;
  const attemptsExhausted = !!data && attemptsLimit > 0 && data.attemptsUsed >= attemptsLimit && !openAttempt;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
      <div className="border-b border-border pb-4 space-y-1">
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
      </div>

      <div role="alert">
        {error && (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}
      </div>

      {question && definition ? (
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Question {index + 1} of {definition.questions.length}</span>
            <span>{answeredCount} answered</span>
          </div>
          <Progress value={((index + 1) / definition.questions.length) * 100} className="h-1.5" aria-hidden="true" />

          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-foreground leading-snug">{question.text}</legend>
            {question.multiple && <p className="text-xs text-muted-foreground">Select all that apply.</p>}
            <div className="space-y-2.5 pt-2">
              {question.options.map((opt, optIdx) => {
                const checked = (answers[question.id] ?? []).includes(optIdx);
                const inputId = `q-${question.id}-${optIdx}`;
                return (
                  <label
                    key={optIdx}
                    htmlFor={inputId}
                    className={cn(
                      'flex items-center gap-3 w-full p-3.5 rounded-xl border text-xs font-medium cursor-pointer transition-all focus-within:ring-2 focus-within:ring-primary',
                      checked ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-card border-border hover:bg-muted/60',
                    )}
                  >
                    <input
                      id={inputId}
                      type={question.multiple ? 'checkbox' : 'radio'}
                      name={`q-${question.id}`}
                      checked={checked}
                      onChange={() => toggle(question.id, optIdx, question.multiple)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="rounded-xl text-xs">
              Previous
            </Button>
            {index < definition.questions.length - 1 ? (
              <Button type="button" size="sm" onClick={() => setIndex(i => i + 1)} className="rounded-xl text-xs font-bold">
                Next Question
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={submit.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs">
                {submit.isPending ? 'Submitting…' : 'Submit Test'}
              </Button>
            )}
          </div>
          {answeredCount < definition.questions.length && index === definition.questions.length - 1 && (
            <p className="text-xs text-muted-foreground">
              {definition.questions.length - answeredCount} unanswered question(s) will be marked wrong.
            </p>
          )}
        </form>
      ) : (
        <div className="space-y-5">
          <div role="status" aria-live="polite">
            {result && (
              <div className="space-y-5">
                <div className={cn('p-6 rounded-3xl border text-center space-y-2', result.attempt.passed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/30')}>
                  <Trophy className="w-12 h-12 text-primary mx-auto" aria-hidden="true" />
                  <h3 className="text-3xl font-extrabold text-foreground">{Math.round(result.attempt.score ?? 0)}% Score</h3>
                  <p className="text-sm font-bold">
                    {result.attempt.passed ? 'Passed' : 'Not passed'} &middot; pass mark {result.attempt.passMark}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Correct answers: {result.attempt.correctCount ?? 0} / {result.attempt.totalQuestions}
                  </p>
                </div>
                <div className="space-y-3 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question review</h4>
                  <ol className="space-y-3">
                    {result.results.map((r, i) => (
                      <li key={r.questionId} className={cn('p-4 rounded-2xl border text-xs space-y-1', r.correct ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/30')}>
                        <div className="flex items-center gap-2 font-bold">
                          {r.correct ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />}
                          <span>Question {i + 1}: {r.correct ? 'Correct' : 'Incorrect'}</span>
                        </div>
                        {r.explanation && <p className="text-muted-foreground pl-6">{r.explanation}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>

          {history.isLoading && (
            <p role="status" className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your attempts…</p>
          )}
          {history.isError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              Could not load your attempt history.{' '}
              <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button>
            </p>
          )}

          {data && (
            <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-muted-foreground">Attempts used</dt>
                  <dd className="font-bold text-foreground text-base">{data.attemptsUsed}{attemptsLimit > 0 ? ` / ${attemptsLimit}` : ''}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-muted-foreground">Best score</dt>
                  <dd className="font-bold text-foreground text-base">{data.bestScore === null ? '—' : `${Math.round(data.bestScore)}%`}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-muted-foreground">Pass mark</dt>
                  <dd className="font-bold text-foreground text-base">{passMark}%</dd>
                </div>
              </dl>
              {data.passed && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">You have passed this assessment.</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStart} disabled={start.isPending || attemptsExhausted || history.isLoading} className="rounded-xl text-xs font-bold gap-1.5">
              {start.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {openAttempt ? 'Resume attempt' : data && data.attemptsUsed > 0 ? 'Retake test' : 'Start test'}
            </Button>
            {attemptsExhausted && <p className="text-xs text-muted-foreground self-center">Maximum attempts reached.</p>}
          </div>

          {submitted.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attempt history</h4>
              <ul className="space-y-1.5">
                {submitted.map(a => (
                  <li key={a.id} className="flex items-center justify-between text-xs rounded-lg border border-border px-3 py-2">
                    <span>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : ''}</span>
                    <span className="font-bold">
                      {a.score === null ? '—' : `${Math.round(a.score)}%`} &middot; {a.passed ? 'Passed' : 'Not passed'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AssessmentTaker;
