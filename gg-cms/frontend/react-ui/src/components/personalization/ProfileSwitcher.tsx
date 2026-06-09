import { useState } from 'react';
import { Check, ChevronDown, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OnboardingWizard } from './OnboardingWizard';
import { useProfiles, useSetActiveProfile, useCreateProfile } from '@/api/hooks/useProfile';
import { ROLE_PRESETS } from '@/lib/rolePresets';
import type { ExperienceLevel, RoleType } from '@/api/types';
import { toast } from 'sonner';

export function ProfileSwitcher() {
  const { data: profiles = [], isLoading } = useProfiles();
  const setActive = useSetActiveProfile();
  const createProfile = useCreateProfile();

  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<{ experienceLevel: ExperienceLevel; roleType: RoleType; learningGoals: string } | null>(null);

  const activeProfile = profiles.find((p) => p.isDefault);

  const handleActivate = async (id: number) => {
    try {
      await setActive.mutateAsync(id);
      toast.success('Profile switched');
    } catch {
      toast.error('Failed to switch profile');
    }
  };

  const handleCreateQuick = async () => {
    if (!newName.trim()) return;
    try {
      await createProfile.mutateAsync({
        name: newName.trim(),
        experienceLevel: (selectedPreset?.experienceLevel ?? 'beginner') as ExperienceLevel,
        roleType: (selectedPreset?.roleType ?? 'learner') as RoleType,
        learningGoals: selectedPreset?.learningGoals ?? null,
        interestedTagIds: [],
        preferredCategoryIds: [],
      });
      toast.success(`Profile "${newName.trim()}" created`);
      setCreateOpen(false);
      setNewName('');
      setSelectedPreset(null);
    } catch {
      toast.error('Failed to create profile');
    }
  };

  if (isLoading) return null;

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">Active profile</p>
        <p className="font-semibold">{activeProfile?.name ?? 'Default'}</p>
        {activeProfile && (
          <p className="text-xs text-muted-foreground capitalize">
            {activeProfile.roleType} · {activeProfile.experienceLevel}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {/* Switch profile dropdown */}
        {profiles.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                Switch <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {profiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => !p.isDefault && handleActivate(p.id)}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.roleType} · {p.experienceLevel}</p>
                  </div>
                  {p.isDefault && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> New profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* New profile (shown when only one profile exists) */}
        {profiles.length <= 1 && (
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New profile
          </Button>
        )}
      </div>

      {/* Quick-create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create a new profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Profile name</Label>
              <Input
                id="profile-name"
                placeholder="e.g. Manager mode, Weekend learning…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Start with a preset (optional)</p>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_PRESETS.map((preset) => (
                  <button
                    key={preset.roleType}
                    onClick={() => setSelectedPreset(preset)}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-center text-xs transition-colors ${
                      selectedPreset?.roleType === preset.roleType
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-primary/40'
                    }`}
                  >
                    <span className="text-lg">{preset.icon}</span>
                    <span className="font-medium">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Want to set interests and categories?{' '}
              <button className="underline" onClick={() => { setCreateOpen(false); setWizardOpen(true); }}>
                Use full wizard
              </button>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateQuick} disabled={!newName.trim() || createProfile.isPending}>
              {createProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full wizard sheet */}
      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New profile — full setup</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <OnboardingWizard
              mode="api"
              initialName={newName || 'New Profile'}
              onComplete={() => setWizardOpen(false)}
              onSkip={() => setWizardOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
