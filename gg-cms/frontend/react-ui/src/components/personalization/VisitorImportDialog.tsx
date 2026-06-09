import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OnboardingWizard } from './OnboardingWizard';

interface Props {
  open: boolean;
  onKeep: () => void;
}

export function VisitorImportDialog({ open, onKeep }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <Dialog open={open && !wizardOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-center">Profile preferences imported</DialogTitle>
            <DialogDescription className="text-center">
              We found learning preferences from your previous visit and saved them as your default profile.
              Would you like to keep them or set up a fresh profile?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={onKeep} className="w-full">
              Keep imported preferences
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setWizardOpen(true)}
            >
              Set up a fresh profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Set up your learning profile</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <OnboardingWizard
              mode="api"
              onComplete={() => { setWizardOpen(false); onKeep(); }}
              onSkip={() => { setWizardOpen(false); onKeep(); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
