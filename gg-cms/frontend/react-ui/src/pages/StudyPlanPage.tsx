import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiFeature, useAiStatus, useStudyPlan } from '@/api/hooks/useAi';
import { AiLevel } from '@/api/types';
import { AiDisclaimer, AiErrorNotice, SafeText, VerifyEmailPrompt } from '@/components/ai/AiShared';

const MIN = 3;
const MAX = 600;

export default function StudyPlanPage() {
  const status = useAiStatus();
  const { visible, needsVerification } = useAiFeature('studyPlan');
  const plan = useStudyPlan();
  const [goals, setGoals] = useState('');
  const [level, setLevel] = useState<AiLevel>('beginner');

  const trimmed = goals.trim();
  const valid = trimmed.length >= MIN && trimmed.length <= MAX;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !plan.isPending) plan.mutate({ goals: trimmed, level });
  };

  let body;
  if (status.isLoading) body = <Skeleton className="h-40 w-full" />;
  else if (needsVerification) body = <VerifyEmailPrompt feature="study plan" />;
  else if (!visible) body = <p className="text-muted-foreground">The study plan is not available right now.</p>;
  else {
    body = (
      <div className="space-y-6">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="sp-goals">What do you want to learn?</Label>
            <Textarea id="sp-goals" value={goals} maxLength={MAX} onChange={(e) => setGoals(e.target.value)} className="min-h-[100px]" placeholder="For example: get ready for a cloud security interview in 8 weeks" aria-describedby="sp-count" />
            <span id="sp-count" className="text-xs text-muted-foreground">{trimmed.length}/{MAX} (at least {MIN})</span>
          </div>
          <div>
            <Label htmlFor="sp-level">Your level</Label>
            <select id="sp-level" value={level} onChange={(e) => setLevel(e.target.value as AiLevel)} className="mt-1 block h-10 rounded-md border bg-background px-2 text-sm">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <Button type="submit" disabled={!valid || plan.isPending}>
            {plan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Build my plan
          </Button>
          <AiDisclaimer />
        </form>

        <div aria-live="polite">
          {plan.isError && <AiErrorNotice error={plan.error} />}
          {plan.data && plan.data.items.length === 0 && (
            <p className="text-muted-foreground">We could not match your goals to our current courses. Try describing them differently.</p>
          )}
          {plan.data && plan.data.items.length > 0 && (
            <section aria-label="Your study plan" className="space-y-3">
              <SafeText text={plan.data.summary} />
              {plan.data.note && <p className="text-xs text-muted-foreground">{plan.data.note}</p>}
              <ol className="space-y-3">
                {[...plan.data.items].sort((a, b) => a.order - b.order).map((it) => (
                  <li key={`${it.type}-${it.id}`}>
                    <Card>
                      <CardContent className="p-4">
                        <Link to={it.type === 'course' ? `/courses/${it.id}` : `/learning-paths/${it.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                          {it.title}
                        </Link>
                        <span className="ml-2 text-xs uppercase text-muted-foreground">{it.type === 'course' ? 'Course' : 'Learning path'}</span>
                        <SafeText text={it.reason} className="mt-1 text-sm text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">Study plan</h1>
        {body}
      </div>
    </DashboardLayout>
  );
}
