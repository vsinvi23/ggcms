export interface LearningGroup {
  id: string;
  title: string;
  description: string;
  targetObjective: string;
  categories: string[];
  skills: string[];
  createdAt: string;
}

const STORAGE_KEY = 'gg_custom_learning_groups';

export function getLearningGroups(): LearningGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse learning groups from localStorage', err);
  }
  return [];
}

export function saveLearningGroup(group: Omit<LearningGroup, 'id' | 'createdAt'>): LearningGroup {
  const newGroup: LearningGroup = {
    ...group,
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const current = getLearningGroups();
  const updated = [...current, newGroup];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save learning group to localStorage', err);
  }
  return newGroup;
}

export function deleteLearningGroup(id: string): void {
  const current = getLearningGroups();
  const updated = current.filter(g => g.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete learning group from localStorage', err);
  }
}
