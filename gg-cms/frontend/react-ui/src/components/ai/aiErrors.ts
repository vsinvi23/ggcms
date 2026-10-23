export interface AiErrorInfo {
  code: string;
  message: string;
  hint?: string;
  unavailable: boolean;
}

const MAP: Record<string, { message: string; hint?: string; unavailable?: boolean }> = {
  AI_RATE_LIMITED: { message: 'You are asking too quickly.', hint: 'Wait a minute and try again.' },
  AI_DAILY_LIMIT: { message: 'You have reached your daily AI limit.', hint: 'It resets within 24 hours.' },
  AI_BUDGET_EXCEEDED: { message: 'AI assistance is paused for this month.', hint: 'Please try again later.' },
  AI_REQUEST_TOO_LARGE: { message: 'This request is too large for the AI assistant.', hint: 'Try a shorter question or smaller content.' },
  AI_INVALID_INPUT: { message: 'That input was not accepted.', hint: 'Check the length and try again.' },
  AI_NOT_FOUND: { message: 'We could not find that item, or you do not have access to it.' },
  AI_REFUSED: { message: 'The assistant declined to answer that.', hint: 'Try rephrasing your request.' },
  AI_UPSTREAM_ERROR: { message: 'The AI service had a problem.', hint: 'Please try again in a moment.' },
  AI_BAD_OUTPUT: { message: 'The AI returned an unusable answer.', hint: 'Please try again.' },
  AI_DISABLED: { message: 'AI features are currently turned off.', unavailable: true },
  AI_FEATURE_DISABLED: { message: 'This AI feature is currently turned off.', unavailable: true },
  AI_NOT_CONFIGURED: { message: 'AI features are not available right now.', unavailable: true },
};

export function aiErrorInfo(err: unknown): AiErrorInfo {
  const resp = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
  const code = resp?.data?.code ?? '';
  const known = MAP[code];
  if (known) return { code, message: known.message, hint: known.hint, unavailable: !!known.unavailable };
  if (resp?.status === 403) return { code: 'FORBIDDEN', message: 'You do not have permission to do that, or your email is not verified.', unavailable: false };
  if (resp?.status === 401) return { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.', unavailable: false };
  if (resp?.status === 429) return { code: 'AI_RATE_LIMITED', ...MAP.AI_RATE_LIMITED, unavailable: false };
  return { code: code || 'UNKNOWN', message: 'Something went wrong with the AI assistant.', hint: 'Please try again.', unavailable: false };
}

export const aiErrorText = (err: unknown): string => {
  const i = aiErrorInfo(err);
  return i.hint ? `${i.message} ${i.hint}` : i.message;
};

/**
 * The backend returns guessed citation urls (/articles|/courses/<slug>#anchor); the SPA routes are
 * /article/<slug> and /course/<slug> (see buildArticleUrl / buildCourseUrl in lib/slug.ts, which add an
 * optional category segment that citations do not carry). Returns '' for anything that is not a same-origin path.
 */
export function normalizeCitationUrl(url: string, contentType: 'article' | 'course'): string {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return '';
  const hashIdx = url.indexOf('#');
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const path = (hashIdx >= 0 ? url.slice(0, hashIdx) : url).split('?')[0];
  const segs = path.split('/').filter(Boolean);
  const slug = segs[segs.length - 1] ?? '';
  if (!slug) return '';
  const anchor = /^#[A-Za-z0-9_-]{1,100}$/.test(hash) ? hash : '';
  return `${contentType === 'course' ? '/course' : '/article'}/${encodeURIComponent(slug)}${anchor}`;
}
