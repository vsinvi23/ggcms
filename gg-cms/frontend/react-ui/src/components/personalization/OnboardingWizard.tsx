import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useTags } from '@/api/hooks/useTags';
import { useCategories } from '@/api/hooks/useCategories';
import { useUpsertProfile } from '@/api/hooks/useProfile';
import { setVisitorProfile } from '@/lib/visitorProfile';
import { ROLE_PRESETS, type RolePreset } from '@/lib/rolePresets';
import type { ExperienceLevel, RoleType } from '@/api/types';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; desc: string }[] = [
  { value: 'beginner',     label: 'Beginner',     desc: 'New to this field' },
  { value: 'intermediate', label: 'Intermediate', desc: '1–3 years experience' },
  { value: 'advanced',     label: 'Advanced',     desc: '3–7 years experience' },
  { value: 'expert',       label: 'Expert',       desc: '7+ years, deep expertise' },
];

interface Props {
  mode?: 'api' | 'visitor';
  initialExperience?: ExperienceLevel;
  initialRole?: RoleType;
  initialTagIds?: number[];
  initialCategoryIds?: number[];
  initialGoals?: string;
  initialName?: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

interface FlatCat { id: number; name: string; isVirtual?: boolean }

function flattenTree(nodes: { id: number; name: string; isVirtual?: boolean; children?: unknown[] }[]): FlatCat[] {
  const result: FlatCat[] = [];
  const visit = (list: typeof nodes) => {
    for (const n of list) {
      result.push({ id: n.id, name: n.name, isVirtual: n.isVirtual });
      if (n.children && Array.isArray(n.children)) visit(n.children as typeof nodes);
    }
  };
  visit(nodes);
  return result;
}

export function OnboardingWizard({
  mode = 'api',
  initialExperience = 'beginner',
  initialRole = 'learner',
  initialTagIds = [],
  initialCategoryIds = [],
  initialGoals = '',
  initialName = 'Default',
  onComplete,
  onSkip,
}: Props) {
  const [step, setStep] = useState(0); // step 0 = preset picker
  const [experience, setExperience] = useState<ExperienceLevel>(initialExperience);
  const [role, setRole] = useState<RoleType>(initialRole);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(initialTagIds);
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>(initialCategoryIds);
  const [goals, setGoals] = useState(initialGoals);
  const [profileName] = useState(initialName);

  const { data: tags = [] } = useTags();
  const { data: categoriesTree = [] } = useCategories();
  const upsertProfile = useUpsertProfile();

  const flatCategories = flattenTree(categoriesTree).filter((c) => !c.isVirtual);

  const applyPreset = (preset: RolePreset) => {
    setExperience(preset.experienceLevel);
    setRole(preset.roleType);
    setGoals(preset.learningGoals);
    setStep(1);
  };

  const toggleTag = (id: number) =>
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const toggleCat = (id: number) =>
    setSelectedCatIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleSave = async () => {
    const payload = {
      experienceLevel: experience,
      roleType: role,
      learningGoals: goals || null,
      interestedTagIds: selectedTagIds,
      preferredCategoryIds: selectedCatIds,
    };

    if (mode === 'visitor') {
      setVisitorProfile(payload);
      toast.success('Preferences saved for your visit');
      onComplete?.();
      return;
    }

    try {
      await upsertProfile.mutateAsync({
        ...payload,
        name: profileName,
        onboardingCompleted: true,
      });
      toast.success('Learning profile saved');
      onComplete?.();
    } catch {
      toast.error('Failed to save profile');
    }
  };

  // Step 0 — Preset picker
  const presetStep = (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Quick start with a preset</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the role that best describes you — we'll pre-fill your profile. You can customise every detail next.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ROLE_PRESETS.map((preset) => (
          <button
            key={preset.roleType}
            onClick={() => applyPreset(preset)}
            className="flex flex-col items-start gap-1 rounded-lg border-2 border-muted p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="text-2xl">{preset.icon}</span>
            <span className="font-semibold text-sm">{preset.label}</span>
            <span className="text-xs text-muted-foreground leading-snug">{preset.description}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        {onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Skip personalisation
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setStep(1)} className="ml-auto">
          Customise from scratch
        </Button>
      </div>
    </div>
  );

  // Steps 1-4 — detail customisation
  const detailSteps = [
    {
      title: 'Your experience level',
      subtitle: 'We use this to surface the right depth of content for you.',
      content: (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EXPERIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setExperience(opt.value)}
              className={`flex items-start justify-between rounded-lg border-2 p-4 text-left transition-colors ${
                experience === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/40'
              }`}
            >
              <div>
                <p className="font-semibold">{opt.label}</p>
                <p className="text-sm text-muted-foreground">{opt.desc}</p>
              </div>
              {experience === opt.value && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'Interested topics',
      subtitle: 'Select tags from your content library. Used to score recommendations.',
      content: (
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags configured yet — add them in Settings → Tags.</p>
          )}
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
              className="cursor-pointer select-none px-3 py-1.5 text-sm"
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      title: 'Preferred categories',
      subtitle: 'Pick content areas to prioritise in recommendations.',
      content: (
        <div className="flex flex-wrap gap-2">
          {flatCategories.length === 0 && (
            <p className="text-sm text-muted-foreground">No categories available yet.</p>
          )}
          {flatCategories.map((cat) => (
            <Badge
              key={cat.id}
              variant={selectedCatIds.includes(cat.id) ? 'default' : 'outline'}
              className="cursor-pointer select-none px-3 py-1.5 text-sm"
              onClick={() => toggleCat(cat.id)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      title: 'Learning goals',
      subtitle: 'Optional — describe what you want to achieve.',
      content: (
        <Textarea
          placeholder="e.g. Learn system design to prepare for senior engineering interviews"
          className="min-h-[120px]"
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
        />
      ),
    },
  ];

  if (step === 0) return presetStep;

  const detailIndex = step - 1;
  const current = detailSteps[detailIndex];
  const isLast = detailIndex === detailSteps.length - 1;
  const totalDetailSteps = detailSteps.length;

  return (
    <div className="space-y-6">
      {/* Progress bar across detail steps */}
      <div className="flex items-center gap-2">
        {detailSteps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= detailIndex ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Step {detailIndex + 1} of {totalDetailSteps}</p>

      <div>
        <h3 className="text-lg font-semibold">{current.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{current.subtitle}</p>
      </div>

      <div>{current.content}</div>

      <div className="flex justify-between pt-2">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </Button>
        {isLast ? (
          <Button onClick={handleSave} disabled={upsertProfile.isPending}>
            {upsertProfile.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
        )}
      </div>
    </div>
  );
}
