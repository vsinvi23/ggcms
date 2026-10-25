import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, Download, Palette, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useConsent,
  useExportData,
  usePreferences,
  useRetention,
  useSaveConsent,
  useUpdatePreferences,
} from '@/api/hooks/usePrivacy';
import { toUserMessage } from '@/lib/errors';
import { getStoredConsent, storeConsent } from '@/lib/consent';
import { applyTheme } from '@/lib/theme';
import type { DigestFrequency, PreferenceNotificationType, ThemePreference, UserPreferences } from '@/api/types';

const TYPE_LABELS: Record<PreferenceNotificationType, string> = {
  review_decision: 'Review decisions',
  review_assigned: 'Review assigned to me',
  content_published: 'My content published',
  comment_reply: 'Replies to my comments',
  comment_mention: 'Mentions',
  enrollment: 'Enrollments',
  course_completed: 'Course completed',
  welcome: 'Welcome',
};

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

export function PreferencesForm() {
  const { data, isLoading, isError, refetch } = usePreferences();
  const update = useUpdatePreferences();
  const [draft, setDraft] = useState<UserPreferences | null>(null);
  const form = draft ?? data;

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !form) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p role="alert" className="text-sm text-destructive">Could not load your preferences.</p>
          <Button variant="link" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const patch = (changes: Partial<UserPreferences>) => setDraft({ ...form, ...changes });

  const save = () =>
    update.mutate(
      {
        notifications: form.notifications,
        digestFrequency: form.digestFrequency,
        emailUnsubscribed: form.emailUnsubscribed,
        privacy: form.privacy,
        appearance: form.appearance,
      },
      {
        onSuccess: () => {
          applyTheme(form.appearance.theme);
          setDraft(null);
          toast.success('Preferences saved');
        },
        onError: (err: Error) => toast.error(toUserMessage(err, 'Failed to save preferences')),
      },
    );

  return (
    <>
      <Card id="notifications">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" aria-hidden="true" />Notifications</CardTitle>
          <CardDescription>Choose where each kind of notification reaches you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <caption className="sr-only">Notification preferences by type and channel</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 font-medium">Type</th>
                <th scope="col" className="py-2 text-center font-medium">In-app</th>
                <th scope="col" className="py-2 text-center font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(TYPE_LABELS) as PreferenceNotificationType[]).map((t) => (
                <tr key={t} className="border-t">
                  <th scope="row" className="py-2 text-left font-normal">{TYPE_LABELS[t]}</th>
                  {(['inApp', 'email'] as const).map((ch) => (
                    <td key={ch} className="py-2 text-center">
                      <Switch
                        aria-label={`${TYPE_LABELS[t]} ${ch === 'inApp' ? 'in-app' : 'email'}`}
                        checked={form.notifications[t]?.[ch] ?? false}
                        disabled={ch === 'email' && form.emailUnsubscribed}
                        onCheckedChange={(v) =>
                          patch({ notifications: { ...form.notifications, [t]: { ...form.notifications[t], [ch]: v } } })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="email-unsub">Pause all email</Label>
              <p className="text-xs text-muted-foreground">Turns off every notification and digest email.</p>
            </div>
            <Switch id="email-unsub" checked={form.emailUnsubscribed} onCheckedChange={(v) => patch({ emailUnsubscribed: v })} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="digest">Email digest of new content</Label>
            <Select value={form.digestFrequency} onValueChange={(v) => patch({ digestFrequency: v as DigestFrequency })} disabled={form.emailUnsubscribed}>
              <SelectTrigger id="digest" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" aria-hidden="true" />Profile visibility</CardTitle>
          <CardDescription>Control what other members can see.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            ['profilePublic', 'Public profile', 'Let others view your profile.'],
            ['showActivity', 'Show my activity', 'Show your learning activity on your profile.'],
          ] as const).map(([key, label, help]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`priv-${key}`}>{label}</Label>
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
              <Switch id={`priv-${key}`} checked={form.privacy[key]} onCheckedChange={(v) => patch({ privacy: { ...form.privacy, [key]: v } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" aria-hidden="true" />Appearance and language</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="theme">Theme</Label>
            <Select value={form.appearance.theme} onValueChange={(v) => patch({ appearance: { ...form.appearance, theme: v as ThemePreference } })}>
              <SelectTrigger id="theme" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="language">Language</Label>
            <Select value={form.appearance.language} onValueChange={(v) => patch({ appearance: { ...form.appearance, language: v } })}>
              <SelectTrigger id="language" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending || !draft}>
          {update.isPending ? 'Saving...' : 'Save preferences'}
        </Button>
      </div>
    </>
  );
}

export function ConsentCard() {
  const { data: state } = useConsent(true);
  const { data: retention } = useRetention();
  const save = useSaveConsent();
  const stored = getStoredConsent();
  const current = state?.current ?? stored;
  const [draft, setDraft] = useState<{ analytics: boolean; personalization: boolean; marketing: boolean } | null>(null);
  const values = draft ?? {
    analytics: current?.analytics ?? false,
    personalization: current?.personalization ?? false,
    marketing: current?.marketing ?? false,
  };
  const policyVersion = state?.currentPolicyVersion ?? retention?.consentPolicyVersion;

  const onSave = () => {
    if (!policyVersion) return;
    save.mutate(
      { policyVersion, ...values },
      {
        onSuccess: () => {
          storeConsent({ policyVersion, ...values });
          setDraft(null);
          toast.success('Privacy choices saved');
        },
        onError: (err: Error) => toast.error(toUserMessage(err, 'Failed to save privacy choices')),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy choices</CardTitle>
        <CardDescription>
          What we may do with your data. Policy version {policyVersion ?? 'loading'}.{' '}
          <Link to="/privacy" className="underline">Retention details</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {([
          ['analytics', 'Analytics', 'Usage statistics linked to a random browser id.'],
          ['personalization', 'Personalization', 'Recommendations based on your activity.'],
          ['marketing', 'Marketing emails', 'Product news and announcements.'],
        ] as const).map(([key, label, help]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={`cons-${key}`}>{label}</Label>
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>
            <Switch id={`cons-${key}`} checked={values[key]} onCheckedChange={(v) => setDraft({ ...values, [key]: v })} />
          </div>
        ))}
        <Button onClick={onSave} disabled={!draft || !policyVersion || save.isPending}>Save privacy choices</Button>
      </CardContent>
    </Card>
  );
}

export function DataExportCard() {
  const exportData = useExportData();

  const onExport = () =>
    exportData.mutate(undefined, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onError: (err: Error) => toast.error(toUserMessage(err, 'Failed to export your data')),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" aria-hidden="true" />Export my data</CardTitle>
        <CardDescription>Download everything we hold about you as a JSON file. Credentials are never included.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={onExport} disabled={exportData.isPending}>
          {exportData.isPending ? 'Preparing...' : 'Download my data'}
        </Button>
      </CardContent>
    </Card>
  );
}
