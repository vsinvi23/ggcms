import { useEffect, useMemo, useRef } from 'react';
import {
  flush,
  scrollBucket,
  trackArticleRead,
  trackPageView,
  trackRecommendation,
  trackSearch,
  type AnalyticsContentType,
} from '@/lib/analytics';

const MIN_READ_SECONDS = 3;
const seenImpressions = new Set<string>();

export interface Tracker {
  pageView: (contentId: string | number, contentType: AnalyticsContentType) => void;
  search: (query: string, resultCount: number) => void;
  recImpression: (recId: string, contentId: string | number, contentType: AnalyticsContentType, position: number, variant?: string) => void;
  recClick: (recId: string, contentId: string | number, contentType: AnalyticsContentType, position: number, variant?: string) => void;
}

export const useTrack = (): Tracker =>
  useMemo<Tracker>(
    () => ({
      pageView: trackPageView,
      search: trackSearch,
      recImpression: (recId, contentId, contentType, position, variant) => {
        const key = `${recId}:${contentType}:${contentId}`;
        if (seenImpressions.has(key)) return;
        seenImpressions.add(key);
        trackRecommendation('rec_impression', recId, contentId, contentType, position, variant);
      },
      recClick: (recId, contentId, contentType, position, variant) =>
        trackRecommendation('rec_click', recId, contentId, contentType, position, variant),
    }),
    [],
  );

/** Emits one page_view when the content loads and one article_read (visible seconds + scroll bucket) when the reader leaves. */
export const useContentReadTracking = (
  contentId: string | number | undefined,
  contentType: AnalyticsContentType,
): void => {
  const sentRef = useRef(false);

  useEffect(() => {
    if (contentId === undefined || contentId === null || contentId === '') return;
    sentRef.current = false;
    trackPageView(contentId, contentType);

    let seconds = 0;
    let maxScroll = 0;
    let last = document.visibilityState === 'visible' ? Date.now() : 0;

    const accumulate = () => {
      if (last) seconds += (Date.now() - last) / 1000;
      last = 0;
    };
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const pct = scrollable <= 0 ? 100 : ((window.scrollY || doc.scrollTop) / scrollable) * 100;
      maxScroll = Math.max(maxScroll, pct);
    };
    const finish = () => {
      if (sentRef.current) return;
      accumulate();
      if (seconds < MIN_READ_SECONDS) return;
      sentRef.current = true;
      trackArticleRead(contentId, contentType, seconds, scrollBucket(maxScroll));
    };
    const onPageHide = () => {
      finish();
      flush(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        accumulate();
      } else if (!last) {
        last = Date.now();
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      finish();
    };
  }, [contentId, contentType]);
};
