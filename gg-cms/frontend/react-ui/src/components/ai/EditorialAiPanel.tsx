import { useState } from 'react';
import { Check, ListChecks, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAiDrafts, useAiFeature, useGenerateQuiz, useGenerateSeo, useGenerateSummary, useQualityCheck, useResolveDraft, useSuggestTags,
} from '@/api/hooks/useAi';
import { AiContentType, AiDifficulty, AiDraft, AiQuizQuestion } from '@/api/types';
import { AiDisclaimer, AiErrorNotice, SafeText } from './AiShared';

interface Props {
  contentType: AiContentType;
  /** Saved content id; undefined until the content has been saved once. */
  contentId?: number;
  onApplyTopic?: (id: number) => void;
  onApplyCategory?: (id: number) => void;
  onApplyDescription?: (text: string) => void;
}

const SEVERITY_STYLE = { error: 'destructive', warn: 'secondary', info: 'outline' } as const;

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={value > max ? 'text-destructive' : 'text-muted-foreground'} aria-label={`${value} of ${max} characters`}>
      {value}/{max}
    </span>
  );
}

function DraftBody({ draft, onApplyDescription }: { draft: AiDraft; onApplyDescription?: (t: string) => void }) {
  const p = draft.payload;
  if (draft.kind === 'summary') {
    const tldr = String(p.tldr ?? '');
    const takeaways = Array.isArray(p.takeaways) ? (p.takeaways as string[]) : [];
    return (
      <div className="space-y-1 text-sm">
        <SafeText text={tldr} />
        {takeaways.length > 0 && <ul className="list-disc pl-5">{takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        {onApplyDescription && <Button size="sm" variant="outline" onClick={() => onApplyDescription(tldr)}>Use TL;DR as description</Button>}
      </div>
    );
  }
  if (draft.kind === 'seo') {
    const title = String(p.metaTitle ?? '');
    const desc = String(p.metaDescription ?? '');
    return (
      <dl className="space-y-1 text-sm">
        <dt className="font-medium">Title <Counter value={title.length} max={60} /></dt>
        <dd>{title}</dd>
        <dt className="font-medium">Description <Counter value={desc.length} max={160} /></dt>
        <dd>{desc}</dd>
        {onApplyDescription && <Button size="sm" variant="outline" onClick={() => onApplyDescription(desc)}>Use as description</Button>}
      </dl>
    );
  }
  const questions = Array.isArray(p.questions) ? (p.questions as AiQuizQuestion[]) : [];
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      {questions.map((q, i) => (
        <li key={i}>
          <p className="font-medium">{q.question}</p>
          <ul className="pl-3">
            {q.options.map((o, j) => (
              <li key={j}>{o}{j === q.correctIndex && <span className="ml-1 text-emerald-600">(correct)</span>}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{q.explanation}</p>
        </li>
      ))}
    </ol>
  );
}

export function EditorialAiPanel({ contentType, contentId, onApplyTopic, onApplyCategory, onApplyDescription }: Props) {
  const { visible } = useAiFeature('editorial');
  const quizOn = useAiFeature('quiz').visible;
  const [count, setCount] = useState('5');
  const [difficulty, setDifficulty] = useState<AiDifficulty>('medium');
  const [applied, setApplied] = useState<Record<string, boolean>>({});

  const id = contentId ?? 0;
  const tags = useSuggestTags();
  const summary = useGenerateSummary();
  const seo = useGenerateSeo();
  const quality = useQualityCheck();
  const quiz = useGenerateQuiz();
  const drafts = useAiDrafts(contentType, id, undefined, visible);
  const resolve = useResolveDraft();

  if (!visible) return null;

  const countNum = Number(count);
  const countValid = Number.isInteger(countNum) && countNum >= 1 && countNum <= 15;
  const args = { t: contentType, id };
  const busy = tags.isPending || summary.isPending || seo.isPending || quality.isPending || quiz.isPending;
  const mark = (k: string) => setApplied((a) => ({ ...a, [k]: true }));
  const pending = (drafts.data ?? []).filter((d) => d.status === 'draft');
  const firstError = tags.error ?? summary.error ?? seo.error ?? quality.error ?? quiz.error ?? resolve.error;

  return (
    <Card aria-labelledby="editorial-ai-title">
      <CardHeader className="pb-2">
        <CardTitle id="editorial-ai-title" className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> AI assistant
        </CardTitle>
        <AiDisclaimer />
      </CardHeader>
      <CardContent className="space-y-4">
        {!contentId ? (
          <p className="text-sm text-muted-foreground">Save this content first to use the AI assistant.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => tags.mutate(args)}>Suggest topics and tags</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => summary.mutate(args)}>Generate TL;DR</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => seo.mutate(args)}>Suggest SEO</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => quality.mutate(args)}>
                <ListChecks className="mr-1 h-4 w-4" aria-hidden="true" /> Quality check
              </Button>
            </div>
            {quizOn && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="quiz-count" className="text-xs">Questions (1-15)</Label>
                  <Input id="quiz-count" type="number" min={1} max={15} value={count} onChange={(e) => setCount(e.target.value)} className="w-24" aria-invalid={!countValid} />
                </div>
                <div>
                  <Label htmlFor="quiz-diff" className="text-xs">Difficulty</Label>
                  <select id="quiz-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as AiDifficulty)} className="h-10 rounded-md border bg-background px-2 text-sm">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <Button size="sm" variant="outline" disabled={busy || !countValid} onClick={() => quiz.mutate({ ...args, count: countNum, difficulty })}>Generate quiz draft</Button>
              </div>
            )}

            <div aria-live="polite" className="space-y-3">
              {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Working...</p>}
              {firstError != null && <AiErrorNotice error={firstError} />}

              {tags.data && (
                <section aria-label="Suggestions">
                  <h3 className="text-sm font-medium">Suggestions {tags.data.source === 'heuristic' && <Badge variant="outline">keyword match</Badge>}</h3>
                  {tags.data.note && <p className="text-xs text-muted-foreground">{tags.data.note}</p>}
                  {tags.data.topics.length + tags.data.categories.length + tags.data.tags.length === 0 && <p className="text-sm text-muted-foreground">No suggestions found.</p>}
                  <ul className="mt-1 space-y-1">
                    {tags.data.topics.map((s) => (
                      <li key={`t${s.id}`} className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary">Topic</Badge> {s.name}
                        {onApplyTopic && <Button size="sm" variant="ghost" disabled={applied[`t${s.id}`]} onClick={() => { onApplyTopic(s.id); mark(`t${s.id}`); }}>{applied[`t${s.id}`] ? 'Added' : 'Add'}</Button>}
                      </li>
                    ))}
                    {tags.data.categories.map((s) => (
                      <li key={`c${s.id}`} className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary">Category</Badge> {s.name}
                        {onApplyCategory && <Button size="sm" variant="ghost" disabled={applied[`c${s.id}`]} onClick={() => { onApplyCategory(s.id); mark(`c${s.id}`); }}>{applied[`c${s.id}`] ? 'Applied' : 'Use'}</Button>}
                      </li>
                    ))}
                    {tags.data.tags.map((s) => (
                      <li key={`g${s.id}`} className="flex items-center gap-2 text-sm"><Badge variant="outline">Tag</Badge> {s.name}</li>
                    ))}
                  </ul>
                </section>
              )}

              {quality.data && (
                <section aria-label="Quality report">
                  <h3 className="text-sm font-medium">Quality score: {quality.data.score}/100</h3>
                  {quality.data.note && <p className="text-xs text-muted-foreground">{quality.data.note}</p>}
                  {quality.data.issues.length === 0 && <p className="text-sm text-muted-foreground">No issues found.</p>}
                  <ul className="mt-1 space-y-1">
                    {quality.data.issues.map((i, n) => (
                      <li key={n} className="flex items-start gap-2 text-sm">
                        <Badge variant={SEVERITY_STYLE[i.severity]}>{i.severity}</Badge>
                        <span>{i.message}{i.location ? ` (${i.location})` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <section aria-label="AI drafts">
              <h3 className="text-sm font-medium">Drafts awaiting review</h3>
              {drafts.isLoading && <p className="text-sm text-muted-foreground">Loading drafts...</p>}
              {drafts.isError && <AiErrorNotice error={drafts.error} />}
              {drafts.isSuccess && pending.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet. Generated drafts appear here and are never applied automatically.</p>}
              <ul className="space-y-3">
                {pending.map((d) => (
                  <li key={d.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Badge variant="secondary">{d.kind}</Badge>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: d.id, accept: true })} aria-label={`Accept ${d.kind} draft`}>
                          <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: d.id, accept: false })} aria-label={`Reject ${d.kind} draft`}>
                          <X className="mr-1 h-4 w-4" aria-hidden="true" /> Reject
                        </Button>
                      </div>
                    </div>
                    <DraftBody draft={d} onApplyDescription={onApplyDescription} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
