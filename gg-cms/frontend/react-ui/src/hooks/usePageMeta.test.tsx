import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { usePageMeta } from './usePageMeta';

function Page({ noindex = false, withLd = true }: { noindex?: boolean; withLd?: boolean }) {
  usePageMeta({
    title: 'Topic',
    description: 'desc',
    canonicalPath: '/topics/x',
    noindex,
    jsonLd: withLd ? { '@context': 'https://schema.org', '@type': 'WebSite' } : undefined,
  });
  return null;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('usePageMeta', () => {
  it('updates server-injected tags in place instead of duplicating them', () => {
    document.head.innerHTML =
      '<link rel="canonical" href="https://x.test/old"><meta name="description" content="old"><meta property="og:title" content="old">' +
      '<script type="application/ld+json">{"@type":"Article"}</script>';
    const { unmount } = render(<Page />);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(document.head.querySelector('script[type="application/ld+json"]')?.textContent).toContain('WebSite');
    expect(document.title).toBe('Topic | GeekGully');
    unmount();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://x.test/old');
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
  });

  it('adds and removes robots noindex', () => {
    const { unmount } = render(<Page noindex withLd={false} />);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
