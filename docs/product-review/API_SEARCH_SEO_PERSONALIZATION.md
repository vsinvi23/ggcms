# API: Search, SEO delivery, lesson gating, personalization v2

Backend contract for the frontend wave. All JSON responses use the standard envelope `{ "success": true, "data": ... }` unless noted. Pages are 0-based (`page=0`). Errors: `{ "success": false, "message": "..." }`.

## 1. Search

### `GET /api/public/search`
Public (rate-limited, optional auth). Only `PUBLISHED` content is searched (an item with a pending draft is searched by its published row only if it is still `PUBLISHED`).

| Query | Meaning |
|---|---|
| `q` | Query text. Parsed with `websearch_to_tsquery` (quotes, `-exclude`, `or` work), plus prefix matching on the last word and trigram typo tolerance. Capped at 200 chars. Empty `q` with no filter returns an empty result. |
| `type` | `all` (default) / `article` / `course`. Anything else: 400. |
| `category` | Category slug (matches the category or its direct parent). |
| `topic` | Topic slug. |
| `level` | `beginner` / `intermediate` / `advanced` / `expert`. Anything else: 400. |
| `page`, `size` | 0-based page, size 1..50 (default 10). |

Ranking weights: title > category/topic/tag names > description > body, + typo/prefix similarity, + lesson hits for courses.

```ts
interface SearchResponse { query: string; total: number; page: number; size: number; totalPages: number; hits: SearchHit[] }
interface SearchHit {
  type: 'article' | 'course'; id: number; publicId: string; slug: string;
  path: string;                    // SPA route, e.g. /article/security/oauth-guide
  title: string; titleHtml: string;        // titleHtml: HTML-escaped, matches wrapped in <mark>
  description?: string;
  snippetHtml?: string;            // HTML-escaped fragment with <mark>; safe for dangerouslySetInnerHTML
  thumbnailUrl?: string; category?: { id: number; name: string; slug: string };
  level?: string; subtype?: string;          // articleType / courseType
  publishedAt?: string; matchedLesson?: string;  // course whose lesson matched (title only; body stays gated)
  score: number;
}
```

### `GET /api/public/search/suggest?q=&limit=5`
`q` < 2 chars returns empty lists. `limit` max 8. Cacheable 30s.

```ts
interface SuggestResponse {
  query: string;
  titles:     { type: 'article'|'course'; id: number; title: string; path: string }[];
  topics:     { id: number; name: string; slug: string }[];
  categories: { id: number; name: string; slug: string }[];
  queries:    string[];            // popular prior queries (last 30 days, with results)
}
```

Query logging (server side, automatic, page 0 only): normalised lower-case text (<= 100 chars; queries containing `@` or 6+ digit runs are dropped) goes to `search_query_log` and to analytics as `search { query_text, result_count }`. The frontend must NOT send a second `search` event.

`level` is stored in new nullable `articles.level` / `courses.level` columns (backfilled from `interactive_metadata.difficulty` when present). There is no editor field for it yet; content without a level is returned by all filters except `level`.

Fallback: if `pg_trgm` cannot be created (no privilege) search still works; fuzzy matching degrades to `ILIKE` on titles. Existing `?search=` on `/api/public/articles|courses|cms` now uses the same full-text index.

## 2. SEO delivery

| Route | Behaviour |
|---|---|
| `GET /sitemap.xml` | One `urlset` when total URLs <= 50,000, otherwise a `sitemapindex` pointing at `/sitemaps/<kind>-<n>.xml` (kinds: `static`, `articles`, `courses`, `topics`, `technologies`, `paths`; `n` 1-based). Only PUBLISHED content; `lastmod` = updated date (published date while a draft revision is pending). Cached 15 min in memory; `Cache-Control: public, max-age=3600`, `ETag`/304. |
| `GET /sitemaps/:file` | Chunk (`articles-1.xml`); unknown kind/page: 404. |
| `GET /robots.txt` | Allows `/`, disallows `/api/ /graphql /factory /dashboard /workspace /auth`, includes `Sitemap:`. |
| `/article/*`, `/course/*`, `/learn/:path`, `/topics/:slug`, `/technology/:slug` | The Gin SPA fallback injects, into `dist/index.html`, `<title>`, description, canonical (`PUBLIC_SITE_URL` + canonical path, e.g. `/article/<category-slug>/<slug>`), Open Graph + Twitter tags and JSON-LD (`Article`/`Course` + `BreadcrumbList`, `CollectionPage` for topic/technology/path). Everything is HTML-escaped; JSON-LD is encoded with `<`/`>`/`&` escaped. Headers: `Cache-Control: public, max-age=60, s-maxage=300`. |
| Any request with `?preview=...`, unknown/unpublished slug, other routes | Plain shell, `no-store`; preview adds `X-Robots-Tag: noindex, nofollow`. |

Frontend implications: keep client-side `<title>`/canonical updates in sync with the canonical path above; links must be `/article/<category-slug>/<slug>` and `/course/<category-slug>/<slug>` (category slug, not display name). Existing tags (`title`, `description`, `og:*`, `twitter:title|description|image|card`, canonical) in `index.html` are replaced, `twitter:site` is kept.

## 3. Lesson body gating (`PUBLIC_LESSON_PREVIEW`)

`first` (default) | `none` | `all`. Applies to anonymous callers only; any authenticated user gets everything.

* `GET /api/sections?filters[course][id][$eq]=<id>` (now with optional auth): anonymous callers get a locked lesson as `{ id, title, type, duration, order, sectionId, locked: true }` with no `content`. With `first`, only the first lesson in traversal order (section lessons, then child sections) keeps its `content`.
* Anonymous callers also get 404 for sections of a course that is not publicly visible (previously draft lesson bodies were readable).
* `GET /api/public/courses/:id`, `/api/public/cms/:id?type=COURSE`, and course lists: `publishedChaptersSnapshot` (which embeds lesson bodies) is redacted with the same rule (`locked: true`, no `content`); `reviewBaselineChapters` is no longer returned publicly. Owner/reviewer/admin `?preview=true` is unaffected.
* Frontend: render `lesson.locked` as the login prompt; after login re-fetch sections.

## 4. Personalization v2

### `GET /api/personalization/feed?limit=10` (auth)
```ts
interface Feed {
  recId: string;                 // impression id for this batch
  coldStart: boolean;            // no behaviour and no profile preferences: trending fallback
  partial?: boolean;             // some signal source failed; result is still usable (not cached)
  generatedAt: string;
  continue?: ContinueItem;       // "continue next in path" / resume
  items: RecommendedItem[];
}
interface ContinueItem {
  kind: 'path_next' | 'in_progress'; reasonCode: 'NEXT_IN_PATH' | 'CONTINUE_COURSE'; reason: string;
  courseId: number; courseSlug: string; courseTitle: string; progress: number;
  pathId?: number; pathSlug?: string; pathTitle?: string; pathCompleted?: number; pathTotal?: number; recId: string;
}
interface RecommendedItem {
  id: number; publicId: string; slug: string; title: string; description?: string; thumbnailUrl?: string;
  categoryId?: number; categoryName?: string; contentType: 'article' | 'course';
  score: number; reasonCode: ReasonCode; reason: string; position: number /* 1-based */; recId: string;
}
type ReasonCode = 'NEXT_STEP' | 'TOPIC_AFFINITY' | 'CATEGORY_PREFERENCE' | 'TAG_INTEREST' | 'TRENDING' | 'NEW'
                | 'NEXT_IN_PATH' | 'CONTINUE_COURSE'    // continue item
                | 'PREREQUISITE' | 'RELATED_TOPIC' | 'SAME_CATEGORY'; // related mode only
```
Signals: enrollments (status, progress, recency), favourites, reactions and views (popularity prior), declared profile (categories, tags, level), level match, topic affinity, prerequisite graph next steps, freshness; completed/enrolled/favourited items are excluded; category/type diversity re-ranking. Cached per user for 60 s and invalidated on enrollment/progress events and profile changes. `Cache-Control: private, max-age=30`.

### `GET /api/personalization/recommendations`
* `content_id` + `content_type` (`ARTICLE`|`COURSE`) (+ `mode=related|next`): content-based response `{ content_id, rec_id, partial?, recommendations: [{ content_id, content_type, title, slug, description?, thumbnail_url?, score, reason_code, reason, position }] }`. Unpublished items are no longer returned. Generator failures are logged and flagged `partial`.
* without `content_id`: `data` is `RecommendedItem[]` (same items as the feed; shape change from earlier `score` int to float and added fields).

### Impression / click events
Use the existing analytics ingest (public events): `rec_impression` and `rec_click` with `contentId` = recommended item id (`contentType` article|course) and metadata `{ rec_id: <recId>, position: <position>, variant?: string }`. Send one impression per visible item (dedupe client side by `recId`+`position`; cached feeds reuse the same `recId` for up to 60 s).

## 5. Configuration

| Env | Default | Purpose |
|---|---|---|
| `PUBLIC_SITE_URL` | `FRONTEND_URL`, else `https://geekgully.com` | Absolute base for sitemap, canonical, OG URLs |
| `PUBLIC_LESSON_PREVIEW` | `first` | `first` / `none` / `all` |

Migration `005_search.sql`: `pg_trgm` (guarded), `level` columns, generated `search_vector` columns (articles, courses, sections, lessons) with GIN indexes, trigram indexes, `search_query_log`. Applying it rewrites the four tables once (generated columns); run during a low-traffic window.
