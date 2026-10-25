import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { OnboardingWizard } from '@/components/personalization/OnboardingWizard';
import { markOnboardingSkipped } from '@/lib/onboardingSkip';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';

const safeNext = (raw: string | null): string => (raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/');

export function Onboarding() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  usePageMeta({ title: 'Set up your learning profile', canonicalPath: '/onboarding', noindex: true });

  if (!isLoading && !isAuthenticated) return <Navigate to="/auth" replace />;

  return (
    <PublicLayout hideSearch>
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          Welcome to GeekGully
        </h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          Tell us about your role and interests so we can recommend what to learn next. You can skip this and change it later from your profile.
        </p>
        <OnboardingWizard
          mode="api"
          onComplete={() => navigate(next, { replace: true })}
          onSkip={() => {
            if (user) markOnboardingSkipped(user.id);
            navigate(next, { replace: true });
          }}
        />
      </div>
    </PublicLayout>
  );
}

export default Onboarding;
