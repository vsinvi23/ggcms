import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Clock, FileText, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { SearchCombobox } from '@/components/search/SearchCombobox';
import { usePageMeta } from '@/hooks/usePageMeta';
import { hasSearchCriteria, usePublicSearch, useSearchSuggest } from '@/api/hooks/usePublicSearch';
import { useCategories } from '@/api/hooks/useCategories';
import { useTopics } from '@/api/hooks/useTopics';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { sanitizeMarkHtml } from '@/lib/sanitize';
import { clearRecentSearches, getRecentSearches } from '@/lib/recentSearches';
import { MEDIA_BASE_URL } from '@/config/api';
import type { CategoryResponseDto, SearchHit, SearchLevel, SearchParams, SearchType } from '@/api/types';

const PAGE_SIZE = 10;
const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'All content' },
  { value: 'article', label: 'Articles' },
  { value: 'course', label: 'Courses' },
];
const LEVEL_OPTIONS: SearchLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const BROWSE_LINKS = [
  { to: '/explore', label: 'Explore all content' },
  { to: '/courses', label: 'Courses' },
  { to: '/learning-paths', label: 'Learning paths' },
  { to: '/topics', label: 'Topics' },
  { to: '/technologies', label: 'Technologies' },
];

const flattenCategories = (nodes: CategoryResponseDto[]): { name: string; slug: string }[] =>
  nodes.flatMap((n) => [...(n.isVirtual || !n.slug ? [] : [{ name: n.name, slug: n.slug }]), ...flattenCategories(n.children ?? [])]);

const parseType = (v: string | null): SearchType => (v === 'article' || v === 'course' ? v : 'all');
const parseLevel = (v: string | null): SearchLevel | undefined => LEVEL_OPTIONS.find((l) => l === v);
const parsePage = (v: string | null): number => {
  const n = Number.parseInt(v ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const hitUrl = (hit: SearchHit): string => {
  const ref = { slug: hit.slug, title: hit.title, categoryName: hit.category?.slug };
  return hit.type === 'course' ? buildCourseUrl(ref) : buildArticleUrl(ref);
};

const thumb = (url: string): string => (url.startsWith('http') ? url : `${MEDIA_BASE_URL}${url}`);

function Highlighted({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeMarkHtml(html) }} />;
}

function ResultCard({ hit }: { hit: SearchHit }) {
  const Icon = hit.type === 'course' ? BookOpen : FileText;
  return (
    <li>
      <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
        {hit.thumbnailUrl && (
          <img src={thumb(hit.thumbnailUrl)} alt="" loading="lazy" className="hidden h-20 w-32 shrink-0 rounded-lg object-cover sm:block" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 text-[10px] font-bold uppercase">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {hit.type}
            </Badge>
            {hit.subtype && <span>{hit.subtype}</span>}
            {hit.category && <span>{hit.category.name}</span>}
            {hit.level && <span className="capitalize">{hit.level}</span>}
          </div>
          <h3 className="text-base font-bold leading-snug">
            <Link to={hitUrl(hit)} className="hover:text-primary hover:underline focus-visible:underline">
              <Highlighted html={hit.titleHtml || hit.title} className="[&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground" />
            </Link>
          </h3>
          {hit.snippetHtml ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              <Highlighted html={hit.snippetHtml} className="[&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground" />
            </p>
          ) : (
            hit.description && <p className="line-clamp-2 text-sm text-muted-foreground">{hit.description}</p>
          )}
          {hit.matchedLesson && <p className="text-xs text-muted-foreground">Matches lesson: {hit.matchedLesson}</p>}
        </div>
      </article>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function ZeroResults({ q, onPick, hasFilters, onReset }: { q: string; onPick: (q: string) => void; hasFilters: boolean; onReset: () => void }) {
  const { data } = useSearchSuggest(q, 5);
  const alternatives = data?.queries.filter((s) => s.toLowerCase() !== q.toLowerCase()) ?? [];
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <SearchX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
      <h2 className="text-lg font-bold">{q ? `No results for “${q}”` : 'No results match these filters'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Check the spelling, try fewer or more general words, or remove filters.</p>
      {hasFilters && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
          Clear all filters
        </Button>
      )}
      {alternatives.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Did you mean</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {alternatives.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => onPick(s)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && (data.topics.length > 0 || data.categories.length > 0) && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Related topics and categories</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {data.topics.map((t) => (
              <li key={`t-${t.id}`}>
                <Link to={`/topics/${encodeURIComponent(t.slug)}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">
                  {t.name}
                </Link>
              </li>
            ))}
            {data.categories.map((c) => (
              <li key={`c-${c.id}`}>
                <Link to={`/search?category=${encodeURIComponent(c.slug)}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <BrowseLinks />
    </div>
  );
}

function BrowseLinks() {
  return (
    <nav aria-label="Browse content" className="mt-6">
      <p className="text-sm font-semibold">Or browse</p>
      <ul className="mt-2 flex flex-wrap justify-center gap-2">
        {BROWSE_LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-primary/10 hover:text-primary">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function RecentSearchesPanel({ onPick, onChanged }: { onPick: (q: string) => void; onChanged: () => void }) {
  const recent = getRecentSearches();
  if (recent.length === 0) return null;
  return (
    <section aria-label="Recent searches" className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-4 w-4" aria-hidden="true" /> Recent searches
        </h2>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            clearRecentSearches();
            onChanged();
          }}
        >
          Clear recent searches
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {recent.map((r) => (
          <li key={r}>
            <button type="button" onClick={() => onPick(r)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">
              {r}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SELECT_CLASS = 'h-9 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const type = parseType(searchParams.get('type'));
  const category = searchParams.get('category') ?? '';
  const topic = searchParams.get('topic') ?? '';
  const level = parseLevel(searchParams.get('level'));
  const page = parsePage(searchParams.get('page'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [, setRecentVersion] = useState(0);

  const params = useMemo<SearchParams>(
    () => ({ q: q || undefined, type, category: category || undefined, topic: topic || undefined, level, page: page - 1, size: PAGE_SIZE }),
    [q, type, category, topic, level, page],
  );
  const hasFilters = type !== 'all' || !!category || !!topic || !!level;
  const searching = hasSearchCriteria(params);

  usePageMeta({
    title: q ? `Search results for ${q}` : 'Search',
    description: 'Search GeekGully courses, articles, topics and learning paths.',
    canonicalPath: '/search',
    noindex: true,
  });

  const { data, isLoading, isError, isFetching, refetch } = usePublicSearch(params);
  const { data: categoriesTree } = useCategories();
  const { data: topics } = useTopics();
  const categories = useMemo(() => flattenCategories(categoriesTree ?? []), [categoriesTree]);

  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    setSearchParams(next);
  };

  const resetFilters = () => update({ type: undefined, category: undefined, topic: undefined, level: undefined });
  const goToPage = (p: number) => {
    update({ page: p > 1 ? String(p) : undefined }, true);
    headingRef.current?.focus();
  };

  const totalPages = data?.totalPages ?? 0;
  const summary = data ? `${data.total.toLocaleString()} ${data.total === 1 ? 'result' : 'results'}${q ? ` for “${q}”` : ''}` : '';

  return (
    <PublicLayout hideSearch>
      <div className="mx-auto min-h-screen w-full max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Search</h1>
        <SearchCombobox
          initialValue={q}
          label="Search courses and articles"
          placeholder="Search courses, articles, topics..."
          onSearch={(next) => update({ q: next })}
          inputClassName="h-11 text-base"
        />

        <form role="search" aria-label="Filter results" className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => e.preventDefault()}>
          <label className="sr-only" htmlFor="search-type">Content type</label>
          <select id="search-type" className={SELECT_CLASS} value={type} onChange={(e) => update({ type: e.target.value === 'all' ? undefined : e.target.value })}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="search-category">Category</label>
          <select id="search-category" className={SELECT_CLASS} value={category} onChange={(e) => update({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
            {category && !categories.some((c) => c.slug === category) && <option value={category}>{category}</option>}
          </select>
          <label className="sr-only" htmlFor="search-topic">Topic</label>
          <select id="search-topic" className={SELECT_CLASS} value={topic} onChange={(e) => update({ topic: e.target.value || undefined })}>
            <option value="">All topics</option>
            {(topics ?? []).map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
            {topic && !(topics ?? []).some((t) => t.slug === topic) && <option value={topic}>{topic}</option>}
          </select>
          <label className="sr-only" htmlFor="search-level">Level</label>
          <select id="search-level" className={`${SELECT_CLASS} capitalize`} value={level ?? ''} onChange={(e) => update({ level: e.target.value || undefined })}>
            <option value="">Any level</option>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </form>

        <div className="mt-6" aria-busy={isFetching}>
          <div role="status" aria-live="polite" className="sr-only">
            {isLoading ? 'Searching' : data ? summary : ''}
          </div>

          {!searching && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <h2 className="text-lg font-bold">What do you want to learn?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Search by title, topic or keyword. Use quotes for exact phrases and a minus sign to exclude words.</p>
              <BrowseLinks />
              <RecentSearchesPanel onPick={(r) => update({ q: r })} onChanged={() => setRecentVersion((v) => v + 1)} />
            </div>
          )}

          {searching && isLoading && <ResultsSkeleton />}

          {searching && isError && !data && (
            <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
              <p className="font-semibold">Search is unavailable right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p>
              <Button className="mt-3" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {searching && data && data.total === 0 && (
            <ZeroResults q={q} hasFilters={hasFilters} onReset={resetFilters} onPick={(s) => update({ q: s })} />
          )}

          {searching && data && data.total > 0 && (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="mb-3 text-sm font-semibold text-muted-foreground outline-none">
                {summary}
                {totalPages > 1 && <span> &middot; page {data.page + 1} of {totalPages}</span>}
              </h2>
              <ul className="space-y-3">
                {data.hits.map((hit) => (
                  <ResultCard key={`${hit.type}-${hit.id}`} hit={hit} />
                ))}
              </ul>
              {totalPages > 1 && (
                <nav aria-label="Search pagination" className="mt-6 flex items-center justify-between">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

export default SearchResults;
