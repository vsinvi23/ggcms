import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PersonalizationFeed } from '@/api/types';
import { RecommendedContent } from './RecommendedContent';
import { feedFixture } from '@/test/fixtures/search';

const trackRecommendation = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackRecommendation: (...a: unknown[]) => trackRecommendation(...a),
  flush: vi.fn(),
  scrollBucket: vi.fn(),
  trackArticleRead: vi.fn(),
  trackPageView: vi.fn(),
  trackSearch: vi.fn(),
}));

let feed: PersonalizationFeed | undefined;
vi.mock('@/api/hooks/useProfile', () => ({
  usePersonalizationFeed: () => ({ data: feed, isLoading: false, isError: !feed, refetch: vi.fn() }),
}));

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { cb: Callback; el: Element }[] = [];

beforeEach(() => {
  observers.length = 0;
  trackRecommendation.mockClear();
  class FakeObserver {
    cb: Callback;
    constructor(cb: Callback) {
      this.cb = cb;
    }
    observe(el: Element) {
      observers.push({ cb: this.cb, el });
    }
    disconnect() {
      return;
    }
    unobserve() {
      return;
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

const setup = () =>
  render(
    <MemoryRouter>
      <RecommendedContent />
    </MemoryRouter>,
  );

describe('RecommendedContent', () => {
  it('shows reason chips and the continue item', () => {
    feed = feedFixture('rec-chips');
    setup();
    expect(screen.getByText('Because you completed Identity basics')).toBeInTheDocument();
    expect(screen.getByText('Continue where you left off')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('link', { name: 'OAuth guide' })).toHaveAttribute('href', '/article/security/oauth-guide');
  });

  it('emits rec_impression once per recId and position, and rec_click on click', async () => {
    feed = feedFixture('rec-once');
    setup();
    const target = observers.filter((o) => o.el.textContent?.includes('OAuth guide') && !o.el.textContent.includes('TLS'));
    expect(target.length).toBeGreaterThan(0);
    act(() => {
      target[0].cb([{ isIntersecting: true }]);
      target[0].cb([{ isIntersecting: true }]);
    });
    const impressions = trackRecommendation.mock.calls.filter((c) => c[0] === 'rec_impression' && c[2] === 11);
    expect(impressions).toHaveLength(1);
    expect(impressions[0]).toEqual(['rec_impression', 'rec-once', 11, 'article', 1, undefined]);

    await userEvent.setup().click(screen.getByRole('link', { name: 'OAuth guide' }));
    expect(trackRecommendation).toHaveBeenCalledWith('rec_click', 'rec-once', 11, 'article', 1, undefined);
  });

  it('shows the cold-start note and an error state', () => {
    feed = feedFixture('rec-cold', true);
    const { unmount } = setup();
    expect(screen.getByText(/Showing what is trending/)).toBeInTheDocument();
    unmount();
    feed = undefined;
    setup();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
