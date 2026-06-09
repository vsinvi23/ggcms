import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OnboardingWizard } from './OnboardingWizard';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import { isWidgetDismissed } from '@/lib/visitorProfile';

export function FloatingPersonalizationButton() {
  const { isAuthenticated } = useAuth();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);

  // Determine if setup is needed
  const needsSetup = !isAuthenticated
    ? !isWidgetDismissed()
    : !profile?.onboardingCompleted;

  // Don't render for auth-loading phase (profile query not run yet)
  if (isAuthenticated && profile === undefined) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Personalise learning experience"
        className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg ring-2 ring-primary/20 transition-all duration-200 hover:scale-110 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/40"
      >
        <Sparkles className="h-6 w-6 text-primary-foreground" />
        {/* Pulsing badge when setup needed */}
        {needsSetup && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-orange-500" />
          </span>
        )}
        {/* Tooltip on hover */}
        <span className="pointer-events-none absolute right-16 whitespace-nowrap rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100">
          {needsSetup ? 'Personalise experience' : 'Edit learning profile'}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {isAuthenticated ? 'Learning Profile' : 'Personalise your visit'}
            </SheetTitle>
          </SheetHeader>
          {!isAuthenticated && (
            <p className="mt-1 px-1 text-sm text-muted-foreground">
              Preferences saved locally in your browser.{' '}
              <a href="/auth" className="underline underline-offset-2">Sign in</a> to keep them across devices.
            </p>
          )}
          <div className="mt-6">
            <OnboardingWizard
              mode={isAuthenticated ? 'api' : 'visitor'}
              initialExperience={profile?.experienceLevel}
              initialRole={profile?.roleType}
              initialTagIds={profile?.interestedTagIds}
              initialCategoryIds={profile?.preferredCategoryIds}
              initialGoals={profile?.learningGoals ?? ''}
              initialName={profile?.name}
              onComplete={() => setOpen(false)}
              onSkip={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
