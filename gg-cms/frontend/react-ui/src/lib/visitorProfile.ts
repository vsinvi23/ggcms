import type { ExperienceLevel, RoleType } from '@/api/types';

const KEY = 'cms_visitor_profile';
const DISMISSED_KEY = 'cms_visitor_widget_dismissed';

export interface VisitorProfile {
  experienceLevel: ExperienceLevel;
  roleType: RoleType;
  interestedTagIds: number[];
  preferredCategoryIds: number[];
  learningGoals?: string;
}

// Use sessionStorage (cleared on tab close) instead of localStorage so the
// visitor profile is not persistently readable by an XSS payload across sessions.
export const getVisitorProfile = (): VisitorProfile | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitorProfile) : null;
  } catch {
    return null;
  }
};

export const setVisitorProfile = (p: VisitorProfile): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable — silently ignore
  }
};

export const clearVisitorProfile = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

export const isWidgetDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const dismissWidget = (): void => {
  try {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // ignore
  }
};
