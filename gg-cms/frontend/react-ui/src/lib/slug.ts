import { CmsResponseDto } from '@/api/types';

/**
 * Convert a title string into a URL-friendly slug.
 * Used as a local fallback when the server hasn't provided a slug yet.
 * e.g. "Go Test Article for Programming!" → "go-test-article-for-programming"
 */
export function slugify(title: string | null | undefined): string {
  let result = '';
  let prevDash = true;
  for (const ch of (title ?? 'untitled').toLowerCase()) {
    const isAlNum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlNum) {
      result += ch;
      prevDash = false;
    } else if (!prevDash) {
      result += '-';
      prevDash = true;
    }
  }
  return result.replace(/-+$/, '') || 'untitled';
}

/**
 * Build a public article URL.
 * Format: /article/{categorySlug}/{articleSlug}  (if category is available)
 *      or /article/{articleSlug}                 (no category)
 *
 * Uses the server-provided `slug` when available, falls back to slugifying the title.
 */
export function buildArticleUrl(item: Pick<CmsResponseDto, 'id' | 'slug' | 'title' | 'categoryName'>): string {
  const articleSlug = item.slug || slugify(item.title);
  if (item.categoryName) {
    return `/article/${slugify(item.categoryName)}/${articleSlug}`;
  }
  return `/article/${articleSlug}`;
}

/**
 * Build a public course URL.
 * Format: /course/{categorySlug}/{courseSlug}  (if category is available)
 *      or /course/{courseSlug}                 (no category)
 */
export function buildCourseUrl(item: Pick<CmsResponseDto, 'id' | 'slug' | 'title' | 'categoryName'>): string {
  const courseSlug = item.slug || slugify(item.title);
  if (item.categoryName) {
    return `/course/${slugify(item.categoryName)}/${courseSlug}`;
  }
  return `/course/${courseSlug}`;
}

/**
 * Extract the article/course slug from a React Router wildcard path.
 * The wildcard captures everything after /article/ or /course/, e.g.:
 *   "go-test-article"              → "go-test-article"
 *   "programming/go-test-article"  → "go-test-article"  (category prefix ignored)
 */
export function extractSlugFromPath(wildcardPath: string | undefined): string {
  if (!wildcardPath) return '';
  const parts = wildcardPath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
