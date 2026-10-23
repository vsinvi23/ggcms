import { AiSettingsUpdate, AiSettingsView } from '@/api/types';

export interface AiSettingsForm {
  enabled: boolean;
  editorialEnabled: boolean;
  moderationEnabled: boolean;
  tutorEnabled: boolean;
  quizEnabled: boolean;
  studyPlanEnabled: boolean;
  moderationFailClosed: boolean;
  modelDefault: string;
  modelCheap: string;
  userPerMinute: string;
  globalPerMinute: string;
  userDailyTutor: string;
  userDailyOther: string;
  monthlyBudgetUsd: string;
  perRequestBudgetUsd: string;
}

export type AiSettingsErrors = Partial<Record<keyof AiSettingsForm, string>>;

export const MODEL_RE = /^claude-[a-z0-9][a-z0-9.-]{1,60}$/;

export const toForm = (s: AiSettingsView): AiSettingsForm => ({
  enabled: s.enabled,
  editorialEnabled: s.editorialEnabled,
  moderationEnabled: s.moderationEnabled,
  tutorEnabled: s.tutorEnabled,
  quizEnabled: s.quizEnabled,
  studyPlanEnabled: s.studyPlanEnabled,
  moderationFailClosed: s.moderationFailClosed,
  modelDefault: s.modelDefault,
  modelCheap: s.modelCheap,
  userPerMinute: String(s.userPerMinute),
  globalPerMinute: String(s.globalPerMinute),
  userDailyTutor: String(s.userDailyTutor),
  userDailyOther: String(s.userDailyOther),
  monthlyBudgetUsd: String(s.monthlyBudgetUsd),
  perRequestBudgetUsd: String(s.perRequestBudgetUsd),
});

const INT_FIELDS = ['userPerMinute', 'globalPerMinute', 'userDailyTutor', 'userDailyOther'] as const;
const FLOAT_FIELDS = ['monthlyBudgetUsd', 'perRequestBudgetUsd'] as const;

export function validateAiSettings(f: AiSettingsForm): AiSettingsErrors {
  const e: AiSettingsErrors = {};
  if (!MODEL_RE.test(f.modelDefault.trim())) e.modelDefault = 'Must look like claude-... (lowercase letters, digits, dots, dashes).';
  if (!MODEL_RE.test(f.modelCheap.trim())) e.modelCheap = 'Must look like claude-... (lowercase letters, digits, dots, dashes).';
  for (const k of INT_FIELDS) {
    const raw = f[k].trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < 1 || n > 100000) e[k] = 'Enter a whole number from 1 to 100000.';
  }
  for (const k of FLOAT_FIELDS) {
    const raw = f[k].trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0 || n > 100000) e[k] = 'Enter an amount from 0 to 100000.';
  }
  if (!e.monthlyBudgetUsd && !e.perRequestBudgetUsd && Number(f.perRequestBudgetUsd) > Number(f.monthlyBudgetUsd)) {
    e.perRequestBudgetUsd = 'Per-request budget cannot exceed the monthly budget.';
  }
  return e;
}

export function toUpdate(f: AiSettingsForm): AiSettingsUpdate {
  return {
    'ai.enabled': String(f.enabled),
    'ai.editorial.enabled': String(f.editorialEnabled),
    'ai.moderation.enabled': String(f.moderationEnabled),
    'ai.tutor.enabled': String(f.tutorEnabled),
    'ai.quiz.enabled': String(f.quizEnabled),
    'ai.studyplan.enabled': String(f.studyPlanEnabled),
    'ai.moderation.fail_mode': f.moderationFailClosed ? 'closed' : 'open',
    'ai.model.default': f.modelDefault.trim(),
    'ai.model.cheap': f.modelCheap.trim(),
    'ai.limits.user_per_minute': String(Number(f.userPerMinute)),
    'ai.limits.global_per_minute': String(Number(f.globalPerMinute)),
    'ai.limits.user_daily_tutor': String(Number(f.userDailyTutor)),
    'ai.limits.user_daily_other': String(Number(f.userDailyOther)),
    'ai.budget.monthly_usd': String(Number(f.monthlyBudgetUsd)),
    'ai.budget.per_request_usd': String(Number(f.perRequestBudgetUsd)),
  };
}
