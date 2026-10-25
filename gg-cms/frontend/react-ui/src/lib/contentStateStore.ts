export type ArticleStatus = 'UNREAD' | 'REFERRED' | 'READ';

export interface ArticleReadState {
  articleId: string | number;
  status: ArticleStatus;
  isRead: boolean;
  isReferred: boolean;
  readAt?: string;
  referredAt?: string;
  readProgress?: number;
}

export type CourseStatus = 'NOT_STARTED' | 'REFERRED' | 'COMPLETED';

export interface CourseProgressState {
  courseId: string | number;
  status: CourseStatus;
  isCompleted: boolean;
  isReferred: boolean;
  progress: number;
  completedLessons: number[];
  totalLessons: number;
  lastAccessedAt?: string;
}

const ARTICLE_READ_STATES_KEY = 'ggcms_article_read_states';
const COURSE_PROGRESS_STATES_KEY = 'ggcms_course_progress_states';

export function getArticleReadStates(): Record<string, ArticleReadState> {
  try {
    const raw = localStorage.getItem(ARTICLE_READ_STATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getArticleReadState(articleId: string | number): ArticleReadState | null {
  if (!articleId) return null;
  const states = getArticleReadStates();
  return states[String(articleId)] || null;
}

export function markArticleAsReferred(articleId: string | number): void {
  if (!articleId) return;
  try {
    const states = getArticleReadStates();
    const existing = states[String(articleId)];
    if (existing?.isRead || existing?.status === 'READ') return;

    states[String(articleId)] = {
      articleId,
      status: 'REFERRED',
      isRead: false,
      isReferred: true,
      referredAt: existing?.referredAt || new Date().toISOString(),
    };
    localStorage.setItem(ARTICLE_READ_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.warn('Failed to mark article as referred:', e);
  }
}

export function markArticleAsRead(articleId: string | number, isRead: boolean = true): void {
  if (!articleId) return;
  try {
    const states = getArticleReadStates();
    const existing = states[String(articleId)];
    states[String(articleId)] = {
      articleId,
      status: isRead ? 'READ' : 'UNREAD',
      isRead,
      isReferred: isRead || (existing?.isReferred ?? false),
      readAt: isRead ? new Date().toISOString() : undefined,
      referredAt: existing?.referredAt,
    };
    localStorage.setItem(ARTICLE_READ_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.warn('Failed to save article read state:', e);
  }
}

export function getCourseProgressStates(): Record<string, CourseProgressState> {
  try {
    const raw = localStorage.getItem(COURSE_PROGRESS_STATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCourseProgressState(courseId: string | number): CourseProgressState | null {
  if (!courseId) return null;
  const states = getCourseProgressStates();
  return states[String(courseId)] || null;
}

export function markCourseAsReferred(courseId: string | number): void {
  if (!courseId) return;
  try {
    const states = getCourseProgressStates();
    const existing = states[String(courseId)];
    if (existing?.isCompleted || existing?.status === 'COMPLETED') return;

    states[String(courseId)] = {
      courseId,
      status: 'REFERRED',
      isCompleted: false,
      isReferred: true,
      progress: existing?.progress || 0,
      completedLessons: existing?.completedLessons || [],
      totalLessons: existing?.totalLessons || 0,
      lastAccessedAt: new Date().toISOString(),
    };
    localStorage.setItem(COURSE_PROGRESS_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.warn('Failed to mark course as referred:', e);
  }
}

export function updateCourseProgress(
  courseId: string | number, 
  completedLessonIds: number[], 
  totalLessons: number
): CourseProgressState {
  const states = getCourseProgressStates();
  const validTotal = Math.max(totalLessons, 1);
  const isCompleted = completedLessonIds.length >= validTotal && totalLessons > 0;
  const progressPercent = isCompleted ? 100 : Math.min(99, Math.round((completedLessonIds.length / validTotal) * 100));
  const status: CourseStatus = isCompleted ? 'COMPLETED' : 'REFERRED';

  const newState: CourseProgressState = {
    courseId,
    status,
    isCompleted,
    isReferred: true,
    progress: progressPercent,
    completedLessons: completedLessonIds,
    totalLessons: validTotal,
    lastAccessedAt: new Date().toISOString(),
  };

  try {
    states[String(courseId)] = newState;
    localStorage.setItem(COURSE_PROGRESS_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.warn('Failed to update course progress state:', e);
  }

  return newState;
}

export interface LearningPathResumeState {
  pathSlug: string;
  courseSlug: string;
  courseUrl: string;
  lessonId: number | null;
  savedAt: string;
}

const PATH_RESUME_KEY = 'ggcms_path_resume_states';
const RECENT_PATHS_KEY = 'ggcms_recent_paths';
const COURSE_RESUME_PREFIX = 'ggcms_course_state_';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getPathResumeState(pathSlug: string): LearningPathResumeState | null {
  return readJson<Record<string, LearningPathResumeState>>(PATH_RESUME_KEY, {})[pathSlug] ?? null;
}

export function savePathResumeState(state: LearningPathResumeState): void {
  try {
    const all = readJson<Record<string, LearningPathResumeState>>(PATH_RESUME_KEY, {});
    all[state.pathSlug] = state;
    localStorage.setItem(PATH_RESUME_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to save learning path state:', e);
  }
}

export function getSavedCourseLessonId(courseId: number): number | null {
  const saved = readJson<{ selectedLessonId?: number } | null>(`${COURSE_RESUME_PREFIX}${courseId}`, null);
  return saved?.selectedLessonId ?? null;
}

export function getRecentPathSlugs(): string[] {
  return readJson<string[]>(RECENT_PATHS_KEY, []);
}

export function recordRecentPath(pathSlug: string): void {
  if (!pathSlug) return;
  try {
    const next = [pathSlug, ...getRecentPathSlugs().filter(s => s !== pathSlug)].slice(0, 6);
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

const GUEST_COMPLETED_PREFIX = 'ggcms_completed_lessons_';

export interface GuestProgressItem {
  courseId: number;
  completedLessonIds: number[];
}

export function collectGuestProgress(): GuestProgressItem[] {
  const byCourse = new Map<number, Set<number>>();
  const add = (courseId: number, ids: unknown) => {
    if (!Number.isInteger(courseId) || courseId <= 0 || !Array.isArray(ids)) return;
    const set = byCourse.get(courseId) ?? new Set<number>();
    ids.forEach(id => {
      if (Number.isInteger(id) && id > 0) set.add(id as number);
    });
    if (set.size > 0) byCourse.set(courseId, set);
  };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(GUEST_COMPLETED_PREFIX)) {
        add(Number(key.slice(GUEST_COMPLETED_PREFIX.length)), readJson<unknown>(key, []));
      }
    }
  } catch {
    return [];
  }
  Object.values(getCourseProgressStates()).forEach(state => add(Number(state.courseId), state.completedLessons));
  return Array.from(byCourse, ([courseId, ids]) => ({ courseId, completedLessonIds: Array.from(ids) })).slice(0, 50);
}

export function clearGuestProgress(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(GUEST_COMPLETED_PREFIX) || key?.startsWith(COURSE_RESUME_PREFIX)) keys.push(key);
    }
    keys.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(COURSE_PROGRESS_STATES_KEY);
  } catch {
    // ignore
  }
}

export function saveGuestCompletedLessons(courseId: number, ids: number[]): void {
  try {
    localStorage.setItem(`${GUEST_COMPLETED_PREFIX}${courseId}`, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function getGuestCompletedLessons(courseId: number): number[] {
  const ids = readJson<unknown>(`${GUEST_COMPLETED_PREFIX}${courseId}`, []);
  return Array.isArray(ids) ? ids.filter((n): n is number => Number.isInteger(n)) : [];
}
