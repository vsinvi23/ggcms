import { useState } from 'react';
import { Sparkles, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecommendedContent } from './RecommendedContent';
import { OnboardingWizard } from './OnboardingWizard';
import { ROLE_PRESETS } from '@/lib/rolePresets';
import { isWidgetDismissed, dismissWidget } from '@/lib/visitorProfile';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import type { RecommendedItem } from '@/api/types';
import { useNavigate } from 'react-router-dom';

interface Props {
  onItemClick?: (item: RecommendedItem) => void;
}

export function HomePersonalizationWidget({ onItemClick }: Props) {
  const { isAuthenticated } = useAuth();
  const { data: profile } = useProfile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => isWidgetDismissed());
  const navigate = useNavigate();

  const handleDismiss = () => {
    dismissWidget();
    setDismissed(true);
  };

  // Mode C — logged in, profile complete: show recommendations inline
  if (isAuthenticated && profile?.onboardingCompleted) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Recommended for You</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={() => setSheetOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Edit preferences
          </Button>
        </div>
        <RecommendedContent limit={6} onItemClick={onItemClick} />

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Learning Profile</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <OnboardingWizard
                mode="api"
                initialExperience={profile?.experienceLevel}
                initialRole={profile?.roleType}
                initialTagIds={profile?.interestedTagIds}
                initialCategoryIds={profile?.preferredCategoryIds}
                initialGoals={profile?.learningGoals ?? ''}
                initialName={profile?.name}
                onComplete={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Mode B — logged in, profile not completed: completion banner
  if (isAuthenticated && !profile?.onboardingCompleted) {
    return (
      <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-5">
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Personalise your learning experience</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us your role and interests — we'll surface the most relevant content for you.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.roleType}
                  onClick={() => setSheetOpen(true)}
                  className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                >
                  <span>{preset.icon}</span>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setSheetOpen(true)}>
                Set up my profile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/profile')}>
                Full profile →
              </Button>
            </div>
          </div>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Set up your learning profile</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <OnboardingWizard
                mode="api"
                onComplete={() => setSheetOpen(false)}
                onSkip={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Mode A — visitor (not logged in)
  if (dismissed) return null;

  return (
    <div className="relative rounded-xl border border-border bg-card p-5 shadow-sm">
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Personalise your learning</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your role and we'll tailor content to your goals — no account needed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ROLE_PRESETS.map((preset) => (
              <button
                key={preset.roleType}
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
              >
                <span>{preset.icon}</span>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              Customise experience
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Skip
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Personalise your visit</SheetTitle>
          </SheetHeader>
          <p className="mt-1 px-1 text-sm text-muted-foreground">
            Preferences are saved locally in your browser.{' '}
            <a href="/auth" className="underline underline-offset-2">Sign in</a> to save them permanently.
          </p>
          <div className="mt-6">
            <OnboardingWizard
              mode="visitor"
              onComplete={() => setSheetOpen(false)}
              onSkip={() => { setSheetOpen(false); handleDismiss(); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
