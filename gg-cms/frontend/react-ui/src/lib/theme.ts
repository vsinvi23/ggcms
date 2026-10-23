import type { ThemePreference } from '@/api/types';

const KEY = 'gg_theme';

export const applyTheme = (theme: ThemePreference): void => {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable
  }
};

export const initTheme = (): void => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  if (stored === 'light' || stored === 'dark' || stored === 'system') applyTheme(stored);
};
