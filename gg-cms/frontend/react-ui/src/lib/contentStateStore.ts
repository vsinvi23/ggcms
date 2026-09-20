export interface PracticeAttempt {
  quizId: string;
  selectedAnswers: Record<number, number>;
  isSubmitted: boolean;
  score: number;
  totalQuestions: number;
  correctCount: number;
  submittedAt: string;
}

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

const PRACTICE_ATTEMPTS_KEY = 'ggcms_practice_attempts';
const ARTICLE_READ_STATES_KEY = 'ggcms_article_read_states';
const COURSE_PROGRESS_STATES_KEY = 'ggcms_course_progress_states';

export function getPracticeAttempts(): Record<string, PracticeAttempt> {
  try {
    const raw = localStorage.getItem(PRACTICE_ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getPracticeAttempt(quizId: string | number): PracticeAttempt | null {
  if (!quizId) return null;
  const attempts = getPracticeAttempts();
  return attempts[String(quizId)] || null;
}

export function savePracticeAttempt(attempt: PracticeAttempt): void {
  try {
    const attempts = getPracticeAttempts();
    attempts[String(attempt.quizId)] = attempt;
    localStorage.setItem(PRACTICE_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (e) {
    console.warn('Failed to save practice attempt to localStorage:', e);
  }
}

export function clearPracticeAttempt(quizId: string | number): void {
  try {
    const attempts = getPracticeAttempts();
    delete attempts[String(quizId)];
    localStorage.setItem(PRACTICE_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (e) {
    console.warn('Failed to clear practice attempt in localStorage:', e);
  }
}

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
