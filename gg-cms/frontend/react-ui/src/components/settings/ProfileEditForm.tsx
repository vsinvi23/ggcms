import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences, useSelfProfile, useUpdateSelfProfile } from '@/api/hooks/usePrivacy';
import { toUserMessage } from '@/lib/errors';
import { validateProfile, type ProfileFormValues } from '@/lib/profileValidation';

const FIELDS: { key: keyof ProfileFormValues; label: string; type?: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'mobileNo', label: 'Phone', type: 'tel' },
  { key: 'avatarUrl', label: 'Avatar URL', type: 'url' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'location', label: 'Location' },
  { key: 'bio', label: 'Bio', multiline: true },
];

export function ProfileEditForm() {
  const me = useSelfProfile();
  const prefs = usePreferences();
  const update = useUpdateSelfProfile();
  const [draft, setDraft] = useState<Partial<ProfileFormValues>>({});

  if (me.isLoading || prefs.isLoading) return <Skeleton className="h-64 w-full" />;
  if (me.isError || prefs.isError) {
    return <p role="alert" className="text-sm text-destructive">Could not load your profile.</p>;
  }

  const base: ProfileFormValues = {
    name: me.data?.name ?? '',
    mobileNo: me.data?.mobileNo ?? '',
    avatarUrl: me.data?.avatarUrl ?? '',
    bio: prefs.data?.profile.bio ?? '',
    location: prefs.data?.profile.location ?? '',
    jobTitle: prefs.data?.profile.jobTitle ?? '',
  };
  const values = { ...base, ...draft };
  const errors = validateProfile(values);
  const invalid = Object.keys(errors).length > 0;

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (invalid) return;
    update.mutate(
      { ...values, name: values.name.trim() },
      {
        onSuccess: () => {
          setDraft({});
          toast.success('Profile updated');
        },
        onError: (err: Error) => toast.error(toUserMessage(err, 'Failed to update profile')),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {FIELDS.map((f) => {
        const id = `profile-${f.key}`;
        const err = errors[f.key];
        const common = {
          id,
          value: values[f.key],
          'aria-invalid': !!err,
          'aria-describedby': err ? `${id}-error` : undefined,
        };
        return (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={id}>{f.label}</Label>
            {f.multiline ? (
              <Textarea {...common} rows={4} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            ) : (
              <Input {...common} type={f.type} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            )}
            {err && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
        );
      })}
      <Button type="submit" disabled={invalid || update.isPending || Object.keys(draft).length === 0}>
        {update.isPending ? 'Saving...' : 'Save profile'}
      </Button>
    </form>
  );
}
