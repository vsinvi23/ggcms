import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  BookOpen, FileText, Search, X, Check, ChevronsUpDown, Tag, Clock,
  SlidersHorizontal, ChevronRight, Play, GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { useTags } from '@/api/hooks/useTags';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { CmsResponseDto, TagDto, EnrollmentDto } from '@/api/types';
import { cn } from '@/lib/utils';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { PublicArticleCard } from '@/components/public/PublicArticleCard';

// ─── Category slug → courseType ───────────────────────────────────────────────

const SLUG_TO_COURSE_TYPE: Record<string, string> = {
  bytes:     'BYTE',
  interview: 'CAPSULE',
  targeted:  'STANDARD',
  paths:     'LEARNING_PLAN',
};

// ─── Type options ─────────────────────────────────────────────────────────────

const COURSE_TYPE_OPTIONS = [
  { value: 'BYTE',          label: 'Byte',          description: 'Quick focused module' },
  { value: 'STANDARD',      label: 'Standard',      description: 'Full course' },
  { value: 'LEARNING_PLAN', label: 'Learning Plan',  description: 'Multi-course track' },
  { value: 'CAPSULE',       label: 'Capsule',        description: 'Interview focused' },
];

const ARTICLE_TYPE_OPTIONS = [
  { value: 'BLOG',       label: 'Blog',        description: 'Opinion & insights' },
  { value: 'TUTORIAL',   label: 'Tutorial',    description: 'Step-by-step guide' },
  { value: 'GUIDE',      label: 'Guide',       description: 'Reference guide' },
  { value: 'NEWS',       label: 'News',        description: 'Industry news' },
  { value: 'CASE_STUDY', label: 'Case Study',  description: 'Real-world analysis' },
];

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function CategoryDropdown({
  categories, selectedId, onSelect,
}: {
  categories: { id: number; name: string }[];
  selectedId: number | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find(c => c.id === selectedId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-sm font-normal px-3">
          <span className="truncate">{selected?.name ?? 'All Categories'}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search category…" className="h-9" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => { onSelect(undefined); setOpen(false); }}>
                <Check className={cn('mr-2 h-4 w-4', selectedId === undefined ? 'opacity-100' : 'opacity-0')} />
                All Categories
              </CommandItem>
              {categories.map(cat => (
                <CommandItem key={cat.id} value={cat.name}
                  onSelect={() => { onSelect(selectedId === cat.id ? undefined : cat.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', selectedId === cat.id ? 'opacity-100' : 'opacity-0')} />
                  {cat.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagsDropdown({
  tags, selectedIds, onToggle, onClear,
}: {
  tags: TagDto[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-sm font-normal px-3">
          <span className="flex items-center gap-1.5 truncate">
            <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
            {selectedIds.length === 0 ? <span className="text-muted-foreground">Select tags…</span>
              : <span>{selectedIds.length} selected</span>}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags…" className="h-9" />
          <CommandList className="max-h-48">
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {tags.map(tag => (
                <CommandItem key={tag.id} value={tag.name} onSelect={() => onToggle(tag.id)}>
                  <div className={cn('mr-2 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                    selectedIds.includes(tag.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {selectedIds.includes(tag.id) && <Check className="h-2.5 w-2.5" />}
                  </div>
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Card result (icon + title + description, like Backup & Restore UI) ───────

function ExploreCard({
  item,
  isArticle,
  enrollment,
}: {
  item: CmsResponseDto;
  isArticle: boolean;
  enrollment?: EnrollmentDto | null;
}) {
  const navigate = useNavigate();
  const to = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);
  const blockCount = item.blockCount ?? 0;
  const readMin  = Math.max(1, blockCount > 0 ? blockCount * 2 : 3);
  const typeLabel = isArticle ? (item.articleType ?? 'Article') : (item.courseType ?? 'Course');
  const meta = [
    item.categoryName,
    isArticle ? `${readMin} min read` : blockCount > 0 ? `${blockCount} lessons` : null,
    item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : null,
  ].filter(Boolean).join(' · ');

  const isEnrolled = !!enrollment;

  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(isEnrolled ? `${buildCourseUrl(item)}?learn=true` : buildCourseUrl(item));
  };

  return (
    <Link to={to}>
      <div className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 h-full min-h-[90px] cursor-pointer">
        {/* Thumbnail / icon */}
        <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover rounded-lg" />
          ) : isArticle ? (
            <FileText className="w-5 h-5 text-primary/60" />
          ) : (
            <BookOpen className="w-5 h-5 text-primary/60" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
              {item.title ?? 'Untitled'}
            </h3>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0 font-normal mt-0.5">
              {typeLabel}
            </Badge>
          </div>
          {item.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          ) : meta ? (
            <p className="text-xs text-muted-foreground">{meta}</p>
          ) : null}
          {item.description && meta && (
            <p className="text-[10px] text-muted-foreground/70 mt-1">{meta}</p>
          )}
        </div>

        {/* Round action button — courses only */}
        {!isArticle && (
          <button
            onClick={handleAction}
            title={isEnrolled ? 'Resume Learning' : 'Enroll'}
            className={cn(
              'shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 active:scale-95',
              isEnrolled
                ? 'bg-success text-white hover:bg-success/90'
                : 'bg-success/15 text-success hover:bg-success/25 border border-success/30',
            )}
          >
            {isEnrolled
              ? <Play size={11} fill="white" className="ml-0.5" />
              : <GraduationCap size={13} />}
          </button>
        )}
      </div>
    </Link>
  );
}

// ─── Main list page ───────────────────────────────────────────────────────────

function ApiContentList({ type, initialCourseType }: { type: 'ARTICLE' | 'COURSE'; initialCourseType?: string }) {
  const isArticle = type === 'ARTICLE';
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated && !isArticle);

  // Build a fast lookup: courseId → EnrollmentDto
  const enrollmentMap = useMemo(() => {
    const m = new Map<number, EnrollmentDto>();
    enrollments.forEach((e: EnrollmentDto) => {
      if (e.course?.id) m.set(e.course.id, e);
    });
    return m;
  }, [enrollments]);

  const [searchQuery, setSearchQuery]               = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes]           = useState<string[]>(initialCourseType ? [initialCourseType] : []);
  const [selectedTagIds, setSelectedTagIds]         = useState<number[]>([]);
  const [sortBy, setSortBy]                         = useState<'newest' | 'oldest' | 'az'>('newest');
  const [tagsExpanded, setTagsExpanded]             = useState(false);
  const [catsExpanded, setCatsExpanded]             = useState(false);

  const TAGS_VISIBLE = 10;
  const CATS_VISIBLE = 8;

  const { data, isLoading }  = usePublicCmsList({ type, size: 200, courseType: initialCourseType });
  const { data: categories } = useCategories();
  const { data: tagsData }   = useTags();

  const allItems    = data?.items ?? [];
  const allTags     = tagsData ?? [];
  const typeOptions = isArticle ? ARTICLE_TYPE_OPTIONS : COURSE_TYPE_OPTIONS;

  const flatCategories = useMemo(() => {
    if (!categories) return [];
    const flatten = (cats: typeof categories): typeof categories =>
      cats.flatMap(c => [c, ...flatten(c.children ?? [])]);
    return flatten(categories);
  }, [categories]);

  const filteredItems = useMemo(() => {
    let result = allItems;
    if (selectedCategoryIds.length > 0)
      result = result.filter(item => item.categoryId !== null && selectedCategoryIds.includes(item.categoryId!));
    if (selectedTypes.length > 0)
      result = result.filter(item => {
        const t = isArticle ? item.articleType : item.courseType;
        return t && selectedTypes.includes(t);
      });
    if (selectedTagIds.length > 0) {
      const tagNames = allTags
        .filter(t => selectedTagIds.includes(t.id))
        .map(t => t.name.toLowerCase());
      result = result.filter(item => {
        const text = `${item.title ?? ''} ${item.description ?? ''} ${item.categoryName ?? ''}`.toLowerCase();
        return tagNames.some(n => text.includes(n));
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.categoryName?.toLowerCase().includes(q),
      );
    }
    const sorted = [...result];
    if (sortBy === 'newest') sorted.sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime());
    else if (sortBy === 'oldest') sorted.sort((a, b) => new Date(a.publishedAt ?? a.createdAt).getTime() - new Date(b.publishedAt ?? b.createdAt).getTime());
    else sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    return sorted;
  }, [allItems, selectedCategoryIds, selectedTypes, selectedTagIds, allTags, searchQuery, sortBy, isArticle]);

  const toggleCategory = (id: number) =>
    setSelectedCategoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const hasActiveFilters = selectedCategoryIds.length > 0 ||
    selectedTagIds.length > 0 ||
    selectedTypes.some(t => t !== initialCourseType) ||
    sortBy !== 'newest';

  const toggleType = (t: string) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleTag = (id: number) =>
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const clearAll = () => {
    setSelectedCategoryIds([]);
    setSelectedTypes(initialCourseType ? [initialCourseType] : []);
    setSelectedTagIds([]);
    setSortBy('newest');
    setSearchQuery('');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const activeChips: { label: string; onRemove: () => void }[] = [
    ...flatCategories.filter(c => selectedCategoryIds.includes(c.id)).map(c => ({ label: c.name, onRemove: () => toggleCategory(c.id) })),
    ...allTags.filter(t => selectedTagIds.includes(t.id)).map(t => ({ label: t.name, onRemove: () => toggleTag(t.id) })),
    ...selectedTypes.filter(t => t !== initialCourseType).map(t => ({
      label: typeOptions.find(o => o.value === t)?.label ?? t,
      onRemove: () => toggleType(t),
    })),
    ...(sortBy !== 'newest' ? [{ label: sortBy === 'oldest' ? 'Oldest first' : 'A → Z', onRemove: () => setSortBy('newest') }] : []),
  ];

  // Pill style helper
  const pill = (active: boolean) => cn(
    'px-3.5 py-1 rounded-full text-sm border transition-colors cursor-pointer',
    active
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  );

  const tagPill = (active: boolean) => cn(
    'px-3 py-0.5 rounded-full text-xs border transition-colors cursor-pointer',
    active
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  );

  const visibleCats = catsExpanded ? flatCategories : flatCategories.slice(0, CATS_VISIBLE);
  const visibleTags = tagsExpanded ? allTags : allTags.slice(0, TAGS_VISIBLE);

  return (
    <PublicLayout hideSearch>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Filter section ────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-3 space-y-2.5">

          {/* Row 1 — Search bar full width */}
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isArticle ? 'Search articles by title, topic or keyword…' : 'Search courses by title, topic or keyword…'}
                className="pl-10 pr-24 h-9 rounded-xl border border-border bg-background shadow-sm focus:border-primary transition-colors text-sm"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')}
                    className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <Button type="submit" size="sm" className="h-7 px-3 text-xs rounded-lg">Search</Button>
              </div>
            </div>
          </form>

          {/* Row 2 — Type (left half) | Category (right half) */}
          <div className="flex divide-x divide-border/60 min-h-0">
            {/* Left: Type */}
            <div className="flex items-start gap-2 pr-4 flex-1 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-10 shrink-0 pt-1">
                Type
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setSelectedTypes(initialCourseType ? [initialCourseType] : [])}
                  className={pill(!selectedTypes.some(t => t !== initialCourseType))}>All</button>
                {typeOptions.filter(o => o.value !== initialCourseType).map(opt => (
                  <button key={opt.value} onClick={() => toggleType(opt.value)}
                    className={pill(selectedTypes.includes(opt.value))}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Category */}
            {flatCategories.length > 0 && (
              <div className="flex items-start gap-2 pl-4 flex-1 min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-14 shrink-0 pt-1">
                  Category
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                  {visibleCats.map(cat => (
                    <button key={cat.id} onClick={() => toggleCategory(cat.id)}
                      className={tagPill(selectedCategoryIds.includes(cat.id))}>
                      {cat.name}
                    </button>
                  ))}
                  {flatCategories.length > CATS_VISIBLE && (
                    <button onClick={() => setCatsExpanded(v => !v)}
                      className="text-xs text-primary hover:underline font-medium whitespace-nowrap">
                      {catsExpanded ? 'less ↑' : `+${flatCategories.length - CATS_VISIBLE} ↓`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Row 3 — Topics full width, expand button pinned right */}
          {allTags.length > 0 && (
            <div className="flex items-start gap-2 border-t border-border/60 pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-10 shrink-0 pt-1">
                Topics
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                {visibleTags.map(tag => (
                  <button key={tag.id} onClick={() => toggleTag(tag.id)}
                    className={tagPill(selectedTagIds.includes(tag.id))}>
                    {tag.name}
                  </button>
                ))}
              </div>
              {allTags.length > TAGS_VISIBLE && (
                <button onClick={() => setTagsExpanded(v => !v)}
                  className="text-xs text-primary hover:underline font-medium whitespace-nowrap shrink-0 pt-1 ml-2">
                  {tagsExpanded ? 'less ↑' : `+${allTags.length - TAGS_VISIBLE} ↓`}
                </button>
              )}
            </div>
          )}

          {/* Row 4 — Active chips (only when filters applied) */}
          {activeChips.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 border-t border-border/60 pt-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Active:</span>
              {activeChips.map((chip, i) => (
                <span key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] rounded-full font-medium">
                  {chip.label}
                  <button onClick={chip.onRemove} aria-label={`Remove ${chip.label}`}
                    className="hover:text-primary/60"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button onClick={clearAll}
                className="text-[11px] text-muted-foreground hover:text-foreground underline ml-auto">
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── Results ───────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-4 py-3">

          {/* Result count + sort inline */}
          <div className="flex items-center justify-between mb-3">
            {isLoading ? (
              <span className="inline-block h-4 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filteredItems.length}</span>
                {filteredItems.length !== allItems.length && <> of {allItems.length}</>}
                {' '}{isArticle ? 'article' : 'course'}{filteredItems.length !== 1 ? 's' : ''}
              </span>
            )}
            <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 w-36 text-sm border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="az">A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                  <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  {!isArticle && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <Search className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h2 className="text-lg font-semibold mb-2">
                {hasActiveFilters || searchQuery
                  ? 'No results match your search'
                  : `No ${isArticle ? 'articles' : 'courses'} published yet`}
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                {hasActiveFilters || searchQuery
                  ? 'Try different keywords or clear your filters.'
                  : 'Check back soon for new content.'}
              </p>
              {(hasActiveFilters || searchQuery)
                ? <Button variant="outline" size="sm" onClick={clearAll}>Clear all</Button>
                : <Button asChild variant="outline" size="sm"><Link to="/">Back to Home</Link></Button>}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map(item =>
                isArticle ? (
                  <PublicArticleCard key={item.id} article={item} />
                ) : (
                  <ExploreCard
                    key={item.id}
                    item={item}
                    isArticle={false}
                    enrollment={enrollmentMap.get(item.id) ?? null}
                  />
                ),
              )}
            </div>
          )}
        </main>
      </div>
    </PublicLayout>
  );
}

// ─── Route dispatcher ─────────────────────────────────────────────────────────

const CourseCategoryPage = () => {
  const { category } = useParams<{ category: string }>();

  if (category === 'articles') return <ApiContentList type="ARTICLE" />;
  if (category === 'courses')  return <ApiContentList type="COURSE" />;

  const courseType = category ? SLUG_TO_COURSE_TYPE[category] : undefined;

  if (!courseType) {
    return (
      <PublicLayout>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-4">Category not found</h1>
          <Link to="/"><Button>Go Home</Button></Link>
        </div>
      </PublicLayout>
    );
  }

  return <ApiContentList type="COURSE" initialCourseType={courseType} />;
};

export default CourseCategoryPage;
