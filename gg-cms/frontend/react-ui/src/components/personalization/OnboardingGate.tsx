import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import { isOnboardingSkipped } from '@/lib/onboardingSkip';

const PROMPTED_KEY = 'gg_onboarding_prompted';
const EXCLUDED_PREFIXES = ['/onboarding', '/auth', '/forgot-password', '/reset-password', '/dashboard', '/workspace', '/unsubscribe', '/privacy'];

/** Sends a signed-in user without a completed profile to /onboarding once per browser session. */
export function OnboardingGate() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: profile, isSuccess } = useProfile(isAuthenticated);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const needsOnboarding = isAuthenticated && !isLoading && isSuccess && !!user && !profile.onboardingCompleted;

  useEffect(() => {
    if (!needsOnboarding || !user || excluded || isOnboardingSkipped(user.id)) return;
    try {
      if (sessionStorage.getItem(PROMPTED_KEY) === user.id.toString()) return;
      sessionStorage.setItem(PROMPTED_KEY, user.id.toString());
    } catch {
      return;
    }
    navigate(`/onboarding?next=${encodeURIComponent(pathname + search)}`);
  }, [needsOnboarding, user, excluded, pathname, search, navigate]);

  return null;
}
