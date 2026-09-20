export interface QuestionAttempt {
  questionId: string;
  courseSlug: string;
  attemptedText: string;
  lastSavedAt: string;
  status: 'draft' | 'submitted';
}

const STORAGE_KEY_PREFIX = 'gg_interview_attempt_';

export function getAttemptKey(courseSlug: string, questionId: string): string {
  return `${STORAGE_KEY_PREFIX}${courseSlug}_${questionId}`;
}

export function saveQuestionAttempt(courseSlug: string, questionId: string, text: string): QuestionAttempt {
  const key = getAttemptKey(courseSlug, questionId);
  const attempt: QuestionAttempt = {
    questionId,
    courseSlug,
    attemptedText: text,
    lastSavedAt: new Date().toISOString(),
    status: 'draft',
  };
  try {
    localStorage.setItem(key, JSON.stringify(attempt));
  } catch (err) {
    console.error('Failed to save interview attempt to localStorage', err);
  }
  return attempt;
}

export function getQuestionAttempt(courseSlug: string, questionId: string): QuestionAttempt | null {
  const key = getAttemptKey(courseSlug, questionId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read interview attempt from localStorage', err);
  }
  return null;
}

export function clearQuestionAttempt(courseSlug: string, questionId: string): void {
  const key = getAttemptKey(courseSlug, questionId);
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to remove interview attempt from localStorage', err);
  }
}
