import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/api/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { oauthErrorMessage, safeRedirectPath } from '@/components/auth/oauthMessages';
import { Loader2 } from 'lucide-react';

type View =
  | { kind: 'loading' }
  | { kind: 'link_required'; ticket: string; redirect: string }
  | { kind: 'email_needed'; ticket: string }
  | { kind: 'notice'; title: string; message: string }
  | { kind: 'error'; message: string };

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>
);

/**
 * Landing page for every redirect back from the backend:
 *   /auth/callback?status=ok|linked|link_required|email_needed|verify[&ticket|token|redirect|new]
 *   /auth/callback?error=<fixed code>
 * Session cookies are already set by the backend; this page only hydrates the
 * AuthContext and handles the follow-up steps. Query secrets are removed from the URL immediately.
 */
const OAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginWithToken } = useAuth();
  const handled = useRef(false);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const finishSignIn = async (redirect: string) => {
    const { error } = await loginWithToken();
    if (error) {
      navigate(`/auth?oauthError=server_error`, { replace: true });
      return;
    }
    navigate(redirect, { replace: true });
  };

  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const status = params.get('status');
    const ticket = params.get('ticket') ?? '';
    const token = params.get('token') ?? '';
    const redirect = safeRedirectPath(params.get('redirect'));
    window.history.replaceState(null, '', window.location.pathname);

    if (error) {
      navigate(`/auth?oauthError=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (status === 'ok') {
      void finishSignIn(redirect);
    } else if (status === 'linked') {
      toast({ title: 'Account linked', description: 'The sign-in method was added to your account.' });
      navigate(safeRedirectPath(params.get('redirect'), '/account-settings'), { replace: true });
    } else if (status === 'link_required' && ticket) {
      setView({ kind: 'link_required', ticket, redirect });
    } else if (status === 'email_needed' && ticket) {
      setView({ kind: 'email_needed', ticket });
    } else if (status === 'verify' && token) {
      authService
        .verifyEmail(token)
        .then(async (result) => {
          if (result.status === 'verified') {
            toast({ title: 'Email verified', description: 'Thanks, your email address is confirmed.' });
            navigate('/dashboard', { replace: true });
          } else {
            await finishSignIn('/dashboard');
          }
        })
        .catch((e: unknown) => {
          setView({ kind: 'error', message: e instanceof Error ? e.message : oauthErrorMessage(null) });
        });
    } else {
      setView({ kind: 'error', message: oauthErrorMessage(null) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (view.kind !== 'link_required') return;
    setBusy(true);
    try {
      await authService.confirmLinkWithPassword(view.ticket, password);
      await finishSignIn(view.redirect);
    } catch (err: unknown) {
      toast({ title: 'Could not confirm', description: err instanceof Error ? err.message : oauthErrorMessage(null), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const sendLinkEmail = async () => {
    if (view.kind !== 'link_required') return;
    setBusy(true);
    try {
      await authService.sendLinkEmail(view.ticket);
      setView({ kind: 'notice', title: 'Check your email', message: 'If the account exists, we sent a confirmation link to its email address. Open it to finish linking.' });
    } catch (err: unknown) {
      toast({ title: 'Could not send email', description: err instanceof Error ? err.message : oauthErrorMessage(null), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (view.kind !== 'email_needed') return;
    setBusy(true);
    try {
      await authService.submitSocialEmail(view.ticket, email);
      setView({ kind: 'notice', title: 'Check your email', message: 'If the address can be used, we sent a verification link. Open it to finish signing in.' });
    } catch (err: unknown) {
      toast({ title: 'Could not send email', description: err instanceof Error ? err.message : oauthErrorMessage(null), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (view.kind === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Signing you in…</p>
        </div>
      </Shell>
    );
  }

  if (view.kind === 'link_required') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Confirm it&apos;s you</CardTitle>
            <CardDescription>
              An account with this email already exists. Enter its password to link your sign-in method, or get a confirmation link by email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={confirmWithPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-password">Account password</Label>
                <Input
                  id="link-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm and link
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={sendLinkEmail}>
                Email me a confirmation link
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link to="/auth">Cancel</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (view.kind === 'email_needed') {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>We need a verified email</CardTitle>
            <CardDescription>
              The provider did not share a verified email address. Enter the address you want to use and we will send a verification link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="social-email">Email</Label>
                <Input
                  id="social-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send verification link
              </Button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const isError = view.kind === 'error';
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isError ? 'Something went wrong' : view.title}</CardTitle>
          <CardDescription role={isError ? 'alert' : 'status'}>{view.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
};

export default OAuthCallback;
