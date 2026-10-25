const KEY = 'gg_recent_searches';
const MAX_RECENT = 6;

export const getRecentSearches = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

export const addRecentSearch = (term: string): string[] => {
  const clean = term.trim();
  if (!clean) return getRecentSearches();
  const next = [clean, ...getRecentSearches().filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
};

export const clearRecentSearches = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    return;
  }
};
