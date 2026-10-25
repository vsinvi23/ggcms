import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/api', () => ({ API_BASE_URL: '/api' }));

import {
  CLIENT_ANALYTICS_HEADER,
  clientAnalyticsHeaders,
  flush,
  resetAnalyticsForTests,
  scrollBucket,
  track,
  trackPageView,
  trackSearch,
} from './analytics';
import { storeConsent } from './consent';

interface SentBody {
  consent: boolean;
  events: { visitorId?: string; sessionId?: string; eventType: string; metadata: Record<string, unknown> }[];
}

const setDnt = (value: string | undefined) =>
  Object.defineProperty(navigator, 'doNotTrack', { value, configurable: true });

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = (): SentBody[] => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body) as SentBody);

beforeEach(() => {
  resetAnalyticsForTests();
  localStorage.clear();
  sessionStorage.clear();
  setDnt(undefined);
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
});

describe('analytics client', () => {
  it('sends anonymous events without ids when consent is not given', () => {
    track('search', { result_count: 2 });
    flush();
    const [body] = bodies();
    expect(body.consent).toBe(false);
    expect(body.events[0].visitorId).toBeUndefined();
    expect(body.events[0].sessionId).toBeUndefined();
    expect(localStorage.getItem('gg_vid')).toBeNull();
  });

  it('attaches visitor and session ids only after analytics consent', () => {
    storeConsent({ policyVersion: '2026-01', analytics: true, personalization: false, marketing: false });
    track('search', { result_count: 2 });
    flush();
    const [body] = bodies();
    expect(body.consent).toBe(true);
    expect(body.events[0].visitorId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.events[0].sessionId).toBeTruthy();
  });

  it('removes stored ids when consent is withdrawn', () => {
    storeConsent({ policyVersion: '2026-01', analytics: true, personalization: false, marketing: false });
    track('search', { result_count: 1 });
    expect(localStorage.getItem('gg_vid')).not.toBeNull();
    storeConsent({ policyVersion: '2026-01', analytics: false, personalization: false, marketing: false });
    expect(localStorage.getItem('gg_vid')).toBeNull();
  });

  it('flushes automatically at 20 events and never exceeds 20 per request', () => {
    for (let i = 0; i < 45; i++) track('search', { result_count: i });
    flush();
    const sizes = bodies().map((b) => b.events.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(45);
  });

  it('uses sendBeacon on page hide with fetch keepalive as the fallback', () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    track('search', { result_count: 1 });
    flush(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    beacon.mockReturnValue(false);
    track('search', { result_count: 1 });
    flush(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as { keepalive: boolean }).keepalive).toBe(true);
  });

  it('sends nothing and no header when Do Not Track is on', () => {
    setDnt('1');
    track('search', { result_count: 1 });
    flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clientAnalyticsHeaders()).toEqual({});
  });

  it('sends the double-count header otherwise', () => {
    expect(clientAnalyticsHeaders()).toEqual({ [CLIENT_ANALYTICS_HEADER]: '1' });
  });

  it('counts a page view once per content item', () => {
    trackPageView(5, 'article');
    trackPageView(5, 'article');
    flush();
    expect(bodies()[0].events).toHaveLength(1);
  });

  it('omits search text without consent', () => {
    trackSearch('kubernetes', 0);
    flush();
    expect(bodies()[0].events[0].metadata).toEqual({ result_count: 0 });
  });

  it('stays silent when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    track('search', { result_count: 1 });
    expect(() => flush()).not.toThrow();
  });

  it('buckets scroll depth', () => {
    expect([0, 24, 25, 79, 80, 100].map(scrollBucket)).toEqual([0, 0, 25, 50, 80, 100]);
  });
});
