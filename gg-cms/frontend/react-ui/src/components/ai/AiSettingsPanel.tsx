import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiSettings, useUpdateAiSettings } from '@/api/hooks/useAi';
import { AiSettingsView } from '@/api/types';
import { AiErrorNotice } from './AiShared';
import { AiSettingsErrors, AiSettingsForm, toForm, toUpdate, validateAiSettings } from './aiSettingsForm';

const TOGGLES: { key: keyof AiSettingsForm; label: string }[] = [
  { key: 'enabled', label: 'Enable AI (master switch)' },
  { key: 'editorialEnabled', label: 'Editorial assistant' },
  { key: 'moderationEnabled', label: 'Comment moderation' },
  { key: 'tutorEnabled', label: 'Learner tutor' },
  { key: 'quizEnabled', label: 'Quiz drafts' },
  { key: 'studyPlanEnabled', label: 'Study plans' },
  { key: 'moderationFailClosed', label: 'Hold comments for review when screening fails' },
];

const TEXT_FIELDS: { key: keyof AiSettingsForm; label: string; type?: string }[] = [
  { key: 'modelDefault', label: 'Default model' },
  { key: 'modelCheap', label: 'Cheap model' },
  { key: 'userPerMinute', label: 'Requests per user per minute', type: 'number' },
  { key: 'globalPerMinute', label: 'Requests per minute (all users)', type: 'number' },
  { key: 'userDailyTutor', label: 'Tutor questions per user per day', type: 'number' },
  { key: 'userDailyOther', label: 'Other AI calls per user per day', type: 'number' },
  { key: 'monthlyBudgetUsd', label: 'Monthly budget (USD)', type: 'number' },
  { key: 'perRequestBudgetUsd', label: 'Per-request budget (USD)', type: 'number' },
];

function SettingsForm({ settings }: { settings: AiSettingsView }) {
  const [form, setForm] = useState<AiSettingsForm>(() => toForm(settings));
  const [errors, setErrors] = useState<AiSettingsErrors>({});
  const update = useUpdateAiSettings();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateAiSettings(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await update.mutateAsync(toUpdate(form));
      toast.success('AI settings saved');
    } catch {
      /* surfaced below */
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <p className="text-sm text-muted-foreground">
        Provider: {settings.provider || 'none'} - API key {settings.keyConfigured ? 'configured' : 'not configured (set ANTHROPIC_API_KEY on the server)'}.
      </p>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Features</legend>
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center gap-3">
            <Switch id={`ai-${t.key}`} checked={form[t.key] as boolean} onCheckedChange={(v) => setForm((f) => ({ ...f, [t.key]: v }))} />
            <Label htmlFor={`ai-${t.key}`}>{t.label}</Label>
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Models, limits and budgets</legend>
        {TEXT_FIELDS.map((t) => (
          <div key={t.key}>
            <Label htmlFor={`ai-${t.key}`}>{t.label}</Label>
            <Input
              id={`ai-${t.key}`}
              type={t.type ?? 'text'}
              step={t.key.endsWith('Usd') ? '0.01' : undefined}
              value={form[t.key] as string}
              onChange={(e) => setForm((f) => ({ ...f, [t.key]: e.target.value }))}
              aria-invalid={!!errors[t.key]}
              aria-describedby={errors[t.key] ? `ai-${t.key}-err` : undefined}
            />
            {errors[t.key] && <p id={`ai-${t.key}-err`} role="alert" className="mt-1 text-xs text-destructive">{errors[t.key]}</p>}
          </div>
        ))}
      </fieldset>
      {update.isError && <AiErrorNotice error={update.error} />}
      <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save settings'}</Button>
    </form>
  );
}

export function AiSettingsPanel() {
  const q = useAiSettings();
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <AiErrorNotice error={q.error} />;
  if (!q.data) return <p className="text-muted-foreground">No settings available.</p>;
  return <SettingsForm settings={q.data} />;
}
