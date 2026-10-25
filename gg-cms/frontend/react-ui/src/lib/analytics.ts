import { API_BASE_URL } from '@/config/api';
import { CONSENT_EVENT, getStoredConsent } from '@/lib/consent';

export type AnalyticsEventType = 'page_view' | 'article_read' | 'search' | 'rec_impression' | 'rec_click';
export type AnalyticsContentType = 'article' | 'course' | 'lesson' | 'path';

interface AnalyticsEvent {
  schemaVersion: 1;
  eventId: string;
  eventType: AnalyticsEventType;
  visitorId?: string;
  sessionId?: string;
  contentId?: string;
  contentType?: AnalyticsContentType;
  clientTs: string;
  metadata: Record<string, string | number>;
}

export const CLIENT_ANALYTICS_HEADER = 'X-GG-Client-Analytics';
export const MAX_BATCH = 20;
export const FLUSH_INTERVAL_MS = 10_000;

const VISITOR_KEY = 'gg_vid';
const SESSION_KEY = 'gg_sid';
const endpoint = (): string => `${API_BASE_URL}/analytics/events`;

let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let listening = false;
const seenPageViews = new Set<string>();

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined') crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const isTrackingBlocked = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return (
    nav.doNotTrack === '1' ||
    nav.msDoNotTrack === '1' ||
    win.doNotTrack === '1' ||
    nav.globalPrivacyControl === true
  );
};

export const hasAnalyticsConsent = (): boolean => !isTrackingBlocked() && getStoredConsent()?.analytics === true;

const ensureId = (store: Storage, key: string): string | undefined => {
  try {
    const existing = store.getItem(key);
    if (existing) return existing;
    const id = randomId();
    store.setItem(key, id);
    return id;
  } catch {
    return undefined;
  }
};

export const clearAnalyticsIds = (): void => {
  try {
    localStorage.removeItem(VISITOR_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};

const send = (events: AnalyticsEvent[], useBeacon: boolean): void => {
  const body = JSON.stringify({ consent: events.some((e) => e.visitorId), events });
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(endpoint(), new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'include',
    }).catch(() => undefined);
  } catch {
    // analytics must never surface errors
  }
};

export const flush = (useBeacon = false): void => {
  if (queue.length === 0) return;
  const pending = queue;
  queue = [];
  const identified = pending.filter((e) => e.visitorId);
  const anonymous = pending.filter((e) => !e.visitorId);
  for (const group of [identified, anonymous]) {
    for (let i = 0; i < group.length; i += MAX_BATCH) send(group.slice(i, i + MAX_BATCH), useBeacon);
  }
};

const startListeners = (): void => {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  timer = setInterval(() => flush(), FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener(CONSENT_EVENT, () => {
    flush();
    if (!hasAnalyticsConsent()) clearAnalyticsIds();
  });
};

export const track = (
  eventType: AnalyticsEventType,
  metadata: Record<string, string | number | undefined>,
  content?: { id: string | number; type: AnalyticsContentType },
): void => {
  if (isTrackingBlocked()) return;
  try {
    startListeners();
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(metadata)) if (v !== undefined) clean[k] = v;
    const event: AnalyticsEvent = {
      schemaVersion: 1,
      eventId: randomId(),
      eventType,
      clientTs: new Date().toISOString(),
      metadata: clean,
    };
    if (content) {
      event.contentId = String(content.id);
      event.contentType = content.type;
    }
    if (hasAnalyticsConsent()) {
      event.visitorId = ensureId(localStorage, VISITOR_KEY);
      event.sessionId = ensureId(sessionStorage, SESSION_KEY);
    }
    queue.push(event);
    if (queue.length >= MAX_BATCH) flush();
  } catch {
    // ignore
  }
};

export const trackPageView = (contentId: string | number, contentType: AnalyticsContentType): void => {
  const key = `${contentType}:${contentId}`;
  if (seenPageViews.has(key)) return;
  seenPageViews.add(key);
  let referrerHost: string | undefined;
  try {
    referrerHost = document.referrer ? new URL(document.referrer).host : undefined;
  } catch {
    referrerHost = undefined;
  }
  track('page_view', { referrer_host: referrerHost, path: window.location.pathname }, { id: contentId, type: contentType });
};

export const trackArticleRead = (
  contentId: string | number,
  contentType: AnalyticsContentType,
  readSeconds: number,
  scrollPct: number,
): void => {
  track(
    'article_read',
    {
      read_seconds: Math.min(86400, Math.max(0, Math.round(readSeconds))),
      scroll_pct: Math.min(100, Math.max(0, Math.round(scrollPct))),
    },
    { id: contentId, type: contentType },
  );
};

export const trackSearch = (query: string, resultCount: number): void => {
  const metadata: Record<string, string | number> = { result_count: Math.max(0, Math.round(resultCount)) };
  if (hasAnalyticsConsent()) metadata.query_text = query.trim().slice(0, 100);
  track('search', metadata);
};

export const trackRecommendation = (
  kind: 'rec_impression' | 'rec_click',
  recId: string,
  contentId: string | number,
  contentType: AnalyticsContentType,
  position: number,
  variant?: string,
): void => {
  track(kind, { rec_id: recId, position, variant }, { id: contentId, type: contentType });
};

export const clientAnalyticsHeaders = (): Record<string, string> =>
  isTrackingBlocked() ? {} : { [CLIENT_ANALYTICS_HEADER]: '1' };

export const scrollBucket = (pct: number): number => [100, 80, 50, 25, 0].find((b) => pct >= b) ?? 0;

export const resetAnalyticsForTests = (): void => {
  queue = [];
  seenPageViews.clear();
  if (timer) clearInterval(timer);
  timer = null;
  listening = false;
};
