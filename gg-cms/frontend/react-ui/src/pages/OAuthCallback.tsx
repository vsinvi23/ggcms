import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Landing page for the OAuth2 redirect flow.
 *
 * The backend's /api/auth/{provider}/callback handler exchanges the
 * authorization code, creates / finds the local user, generates a JWT,
 * then does a 302 redirect to:
 *
 *   {FRONTEND_URL}/auth/callback?token=<jwt>
 *   {FRONTEND_URL}/auth/callback?error=<message>
 *
 * This page reads those query params, hydrates the AuthContext, and
 * navigates to /dashboard on success or back to /auth on failure.
 */
const OAuthCallback = () => {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      const friendly = decodeURIComponent(error).replace(/_/g, ' ');
      navigate(`/auth?oauthError=${encodeURIComponent(friendly)}`, { replace: true });
      return;
    }

    if (!token) {
      navigate('/auth?oauthError=Sign-in+failed.+Please+try+again.', { replace: true });
      return;
    }

    loginWithToken(token).then(({ error: loginErr }) => {
      if (loginErr) {
        navigate(`/auth?oauthError=${encodeURIComponent(loginErr)}`, { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    });
  }, [loginWithToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
