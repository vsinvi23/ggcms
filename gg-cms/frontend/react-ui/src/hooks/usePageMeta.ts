import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const SITE_NAME = 'GeekGully';
const JSON_LD_SELECTOR = 'script[type="application/ld+json"]';
const MANAGED_ATTR = 'data-gg-jsonld';

const upsertMeta = (attr: 'name' | 'property', key: string): HTMLMetaElement => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  return el;
};

/**
 * Sets a meta tag's content and returns a restore function. Existing tags
 * (including server-injected ones) are updated in place, never duplicated.
 */
const setMeta = (attr: 'name' | 'property', key: string, content: string): (() => void) => {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const previous = existing ? existing.content : null;
  const el = upsertMeta(attr, key);
  el.content = content;
  return () => {
    if (previous === null) el.remove();
    else el.content = previous;
  };
};

export const usePageMeta = ({ title, description, canonicalPath, noindex, jsonLd }: PageMeta) => {
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const restores: (() => void)[] = [];

    const previousTitle = document.title;
    const fullTitle = title ? `${title} | ${SITE_NAME}` : previousTitle;
    if (title) {
      document.title = fullTitle;
      restores.push(setMeta('property', 'og:title', fullTitle), setMeta('name', 'twitter:title', fullTitle));
    }

    if (description) {
      restores.push(
        setMeta('name', 'description', description),
        setMeta('property', 'og:description', description),
        setMeta('name', 'twitter:description', description),
      );
    }

    if (canonicalPath !== undefined) {
      const href = new URL(canonicalPath, window.location.origin).toString();
      const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      const previousHref = existing?.getAttribute('href') ?? null;
      const linkEl = existing ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
      linkEl.href = href;
      restores.push(() => {
        if (previousHref) linkEl.setAttribute('href', previousHref);
        else linkEl.remove();
      }, setMeta('property', 'og:url', href));
    }

    if (noindex) restores.push(setMeta('name', 'robots', 'noindex, follow'));

    if (jsonLdText) {
      // Adopt a server-injected JSON-LD block when present so the page never ends up with two.
      const existing = Array.from(document.head.querySelectorAll<HTMLScriptElement>(JSON_LD_SELECTOR));
      const script = existing[0] ?? document.head.appendChild(Object.assign(document.createElement('script'), { type: 'application/ld+json' }));
      existing.slice(1).forEach((s) => s.remove());
      script.setAttribute(MANAGED_ATTR, '');
      script.textContent = jsonLdText;
      restores.push(() => script.remove());
    }

    return () => {
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
      document.title = previousTitle;
    };
  }, [title, description, canonicalPath, noindex, jsonLdText]);
};
