import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  authService,
  type ConnectedIdentity,
  type SocialProvider,
} from '@/api/services/authService';
import { useAuthProviders } from '@/components/auth/useAuthProviders';
import { PROVIDER_LABELS } from '@/components/auth/oauthMessages';
import { Loader2 } from 'lucide-react';

const SETTINGS_PATH = '/account-settings';

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

/**
 * "Connected accounts" settings section: link / unlink social sign-in methods and
 * set a password for social-only accounts. Renders nothing when no provider is
 * enabled and none is linked.
 */
export const ConnectedAccounts: React.FC = () => {
  const { toast } = useToast();
  const providers = useAuthProviders();
  const [identities, setIdentities] = useState<ConnectedIdentity[]>([]);
  const [passwordSet, setPasswordSet] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SocialProvider | null>(null);
  const [reauthFor, setReauthFor] = useState<SocialProvider | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, me] = await Promise.all([authService.listIdentities(), authService.getCurrentUser()]);
      setIdentities(list);
      setPasswordSet(me.passwordSet);
    } catch {
      setIdentities([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startLink = async (provider: SocialProvider) => {
    setBusy(provider);
    try {
      const url = await authService.startLinkIdentity(provider, SETTINGS_PATH);
      window.location.href = url;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'reauth_required') {
        if (passwordSet) {
          setReauthFor(provider);
        } else {
          toast({ title: 'Sign in again', description: 'For your security, please sign out and sign in again before linking an account.', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Could not link account', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
      }
      setBusy(null);
    }
  };

  const submitReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reauthFor) return;
    const provider = reauthFor;
    setBusy(provider);
    try {
      await authService.reauth(reauthPassword);
      setReauthFor(null);
      setReauthPassword('');
      await startLink(provider);
    } catch (err: unknown) {
      toast({ title: 'Could not confirm', description: err instanceof Error ? err.message : 'Incorrect password.', variant: 'destructive' });
      setBusy(null);
    }
  };

  const unlink = async (provider: SocialProvider) => {
    setBusy(provider);
    try {
      await authService.unlinkIdentity(provider);
      setConfirming(null);
      toast({ title: 'Account unlinked', description: `${PROVIDER_LABELS[provider] ?? provider} was removed. Your other sessions were signed out.` });
      await load();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      toast({
        title: 'Could not unlink',
        description: code === 'last_login_method'
          ? 'Set a password or link another account first, so you can still sign in.'
          : err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('password');
    try {
      await authService.changePassword('', newPassword);
      setNewPassword('');
      toast({ title: 'Password set', description: 'You can now also sign in with your email and password.' });
      await load();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      toast({
        title: 'Could not set password',
        description: code === 'reauth_required'
          ? 'For your security, please sign out and sign in again, then retry.'
          : err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const byProvider = new Map(identities.map((i) => [i.provider, i]));
  const visible = new Map<SocialProvider, string>();
  providers.forEach((p) => visible.set(p.id, p.name));
  identities.forEach((i) => visible.set(i.provider, PROVIDER_LABELS[i.provider] ?? i.provider));

  if (!loaded || (visible.size === 0 && passwordSet)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>Sign in faster with an account you already use. You must always keep at least one way to sign in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-md border">
          {[...visible.entries()].map(([id, name]) => {
            const linked = byProvider.get(id);
            const enabled = providers.some((p) => p.id === id);
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {linked
                      ? `Linked${formatDate(linked.linkedAt) ? ` on ${formatDate(linked.linkedAt)}` : ''}${linked.email ? ` · ${linked.email}` : ''}${linked.lastLoginAt ? ` · last used ${formatDate(linked.lastLoginAt)}` : ''}`
                      : 'Not connected'}
                  </p>
                </div>
                {linked ? (
                  confirming === id ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={busy === id} onClick={() => unlink(id)}>
                        {busy === id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Confirm unlink
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" aria-label={`Unlink ${name}`} onClick={() => setConfirming(id)}>Unlink</Button>
                  )
                ) : enabled ? (
                  <Button size="sm" variant="outline" aria-label={`Connect ${name}`} disabled={busy === id} onClick={() => startLink(id)}>
                    {busy === id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Connect
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {reauthFor && (
          <form onSubmit={submitReauth} className="space-y-2 rounded-md border p-3">
            <Label htmlFor="ca-reauth">Confirm your password to connect {PROVIDER_LABELS[reauthFor] ?? reauthFor}</Label>
            <Input id="ca-reauth" type="password" autoComplete="current-password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} required />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy === reauthFor}>Continue</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setReauthFor(null); setReauthPassword(''); }}>Cancel</Button>
            </div>
          </form>
        )}

        {!passwordSet && (
          <form onSubmit={savePassword} className="space-y-2 rounded-md border p-3">
            <Label htmlFor="ca-new-password">Set a password</Label>
            <p className="text-xs text-muted-foreground">Add an email and password sign-in method (at least 12 characters).</p>
            <Input
              id="ca-new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={busy === 'password'}>
              {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default ConnectedAccounts;
