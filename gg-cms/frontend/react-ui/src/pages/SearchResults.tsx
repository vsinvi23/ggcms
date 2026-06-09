import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  X,
  BookOpen,
  FileText,
  LayoutGrid,
  ChevronDown,
  Check,
  ChevronsUpDown,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { useTags } from '@/api/hooks/useTags';
import { CmsResponseDto, TagDto } from '@/api/types';
import { ExploreContentCard } from '@/components/public/ExploreContentCard';
import { ArticleExploreCard } from '@/components/public/ArticleExploreCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSE_TYPE_OPTIONS = [
  { value: 'BYTE', label: 'Byte', description: 'Quick focused module' },
  { value: 'STANDARD', label: 'Standard', description: 'Full course' },
  { value: 'LEARNING_PLAN', label: 'Learning Plan', description: 'Multi-course track' },
  { value: 'CAPSULE', label: 'Capsule', description: 'Interview focused' },
];

const ARTICLE_TYPE_OPTIONS = [
  { value: 'BLOG', label: 'Blog', description: 'Opinion & insights' },
  { value: 'TUTORIAL', label: 'Tutorial', description: 'Step-by-step guide' },
  { value: 'GUIDE', label: 'Guide', description: 'Reference guide' },
  { value: 'NEWS', label: 'News', description: 'Industry news' },
  { value: 'CASE_STUDY', label: 'Case Study', description: 'Real-world analysis' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'A → Z' },
];

// ─── Small helpers ─────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 hover:text-primary/70"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-40 w-full rounded-t-lg rounded-b-none" />
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Category searchable dropdown ─────────────────────────────────────────────

function CategoryDropdown({
  categories,
  selectedId,
  onSelect,
}: {
  categories: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find(c => c.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 text-sm font-normal px-3"
        >
          <span className="truncate text-left">{selected ? selected.name : 'All Categories'}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search category…" className="h-9" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => { onSelect(null); setOpen(false); }}>
                <Check className={cn('mr-2 h-4 w-4', selectedId === null ? 'opacity-100' : 'opacity-0')} />
                All Categories
              </CommandItem>
              {categories.map(cat => (
                <CommandItem
                  key={cat.id}
                  value={cat.name}
                  onSelect={() => { onSelect(selectedId === cat.id ? null : cat.id); setOpen(false); }}
                >
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

// ─── Tags multi-select dropdown ────────────────────────────────────────────────

function TagsMultiSelect({
  tags,
  selectedIds,
  onToggle,
  onClear,
}: {
  tags: TagDto[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedTags = tags.filter(t => selectedIds.includes(t.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal px-3"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {selectedIds.length === 0
                ? <span className="text-muted-foreground">Select tags…</span>
                : <span>{selectedIds.length} tag{selectedIds.length > 1 ? 's' : ''} selected</span>}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags…" className="h-9" />
            <CommandList className="max-h-56">
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {tags.map(tag => (
                  <CommandItem key={tag.id} value={tag.name} onSelect={() => onToggle(tag.id)}>
                    <div className={cn(
                      'mr-2 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                      selectedIds.includes(tag.id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}>
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

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map(tag => (
            <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">
              {tag.name}
              <button onClick={() => onToggle(tag.id)} aria-label={`Remove ${tag.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedTags.length > 1 && (
            <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline self-center">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SearchResults = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').replace(/^["']+|["']+$/g, '').trim();
  const [searchInput, setSearchInput] = useState(query);

  const [contentFilter, setContentFilter] = useState<'all' | 'courses' | 'articles'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az'>('newest');

  const { data: articlesData, isLoading: articlesLoading } = usePublicCmsList({
    type: 'ARTICLE',
    size: 200,
    ...(query ? { search: query } : {}),
  });
  const { data: coursesData, isLoading: coursesLoading } = usePublicCmsList({
    type: 'COURSE',
    size: 200,
    ...(query ? { search: query } : {}),
  });
  const { data: categoriesData } = useCategories();
  const { data: tagsData } = useTags();

  const allArticles: CmsResponseDto[] = articlesData?.items ?? [];
  const allCourses: CmsResponseDto[] = coursesData?.items ?? [];
  const categories = categoriesData ?? [];
  const allTags = tagsData ?? [];
  const isLoading = articlesLoading || coursesLoading;

  const applyFilters = (items: CmsResponseDto[], kind: 'course' | 'article'): CmsResponseDto[] => {
    let out = items;
    // Text search is handled server-side; only apply local filters here.
    if (selectedCategoryId !== null) {
      out = out.filter((item) => item.categoryId === selectedCategoryId);
    }
    if (selectedTypes.length > 0) {
      out = out.filter((item) => {
        const val = kind === 'course' ? item.courseType : item.articleType;
        return val && selectedTypes.includes(val);
      });
    }
    if (selectedTagIds.length > 0) {
      const tagNames = allTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name.toLowerCase());
      out = out.filter(item => {
        const text = `${item.title ?? ''} ${item.description ?? ''} ${item.categoryName ?? ''}`.toLowerCase();
        return tagNames.some(n => text.includes(n));
      });
    }
    return [...out].sort((a, b) => {
      if (sortBy === 'az') return (a.title ?? '').localeCompare(b.title ?? '');
      const da = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
      const db = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
      return sortBy === 'newest' ? db - da : da - db;
    });
  };

  const filteredCourses = useMemo(
    () => applyFilters(allCourses, 'course'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCourses, query, selectedCategoryId, selectedTypes, selectedTagIds, allTags, sortBy]
  );
  const filteredArticles = useMemo(
    () => applyFilters(allArticles, 'article'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allArticles, query, selectedCategoryId, selectedTypes, selectedTagIds, allTags, sortBy]
  );

  const totalResults = filteredCourses.length + filteredArticles.length;
  const activeFilterCount =
    (selectedCategoryId !== null ? 1 : 0) + selectedTypes.length + (selectedTagIds.length > 0 ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0);

  const typeOptions =
    contentFilter === 'courses'
      ? COURSE_TYPE_OPTIONS
      : contentFilter === 'articles'
      ? ARTICLE_TYPE_OPTIONS
      : [];

  const toggleType = (val: string) =>
    setSelectedTypes((prev) => (prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]));
  const toggleTag = (id: number) =>
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clearAllFilters = () => {
    setSelectedCategoryId(null);
    setSelectedTypes([]);
    setSelectedTagIds([]);
    setSortBy('newest');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(searchInput.trim() ? { q: searchInput.trim() } : {});
  };

  const renderCourseGrid = (courses: CmsResponseDto[], limit?: number) => {
    const items = limit ? courses.slice(0, limit) : courses;
    if (items.length === 0) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {items.map((c) => <ExploreContentCard key={c.id} item={c} />)}
      </div>
    );
  };

  const renderArticleGrid = (articles: CmsResponseDto[], limit?: number) => {
    const items = limit ? articles.slice(0, limit) : articles;
    if (items.length === 0) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {items.map((a) => <ArticleExploreCard key={a.id} item={a} />)}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PublicLayout>
      <div className="flex flex-col gap-0 h-full">

        {/* ━━━━ TOP SEGMENT — search bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="border-b border-border bg-card px-6 py-4">
          <form onSubmit={handleSearch}>
            <div className="flex gap-3 items-center">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search courses, articles, tutorials..."
                  className="pl-12 h-11 text-base rounded-lg border-muted focus:border-primary"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

              {/* Advanced search popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 gap-2 shrink-0">
                    <SlidersHorizontal className="h-4 w-4" />
                    Advanced Search
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-5" align="end">
                  <div className="space-y-5">
                    <h4 className="font-semibold text-sm">Advanced Search</h4>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Content Type
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { value: 'all', label: 'All' },
                            { value: 'courses', label: 'Courses' },
                            { value: 'articles', label: 'Articles' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { setContentFilter(opt.value); setSelectedTypes([]); }}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-sm border transition-colors',
                              contentFilter === opt.value
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border hover:bg-muted'
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {typeOptions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {contentFilter === 'courses' ? 'Course Type' : 'Article Type'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {typeOptions.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => toggleType(opt.value)}
                              className={cn(
                                'px-3 py-1.5 rounded-md text-sm border transition-colors text-left',
                                selectedTypes.includes(opt.value)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:bg-muted'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Sort By
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSortBy(opt.value as typeof sortBy)}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-sm border transition-colors text-left',
                              sortBy === opt.value
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border hover:bg-muted'
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Button type="submit" size="lg" className="shrink-0">
                Search
              </Button>
            </div>
          </form>
        </div>

        {/* ━━━━ BOTTOM — left sidebar + center results ━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT SEGMENT — filters ──────────────────────────────────────── */}
          <aside className="w-56 shrink-0 border-r border-border bg-card overflow-y-auto">
            <div className="p-4 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <Separator />

              {/* Content Type */}
              <SidebarSection title="Content Type">
                <div className="space-y-0.5">
                  {(
                    [
                      { value: 'all', label: 'All', icon: LayoutGrid, count: totalResults },
                      { value: 'courses', label: 'Courses', icon: BookOpen, count: filteredCourses.length },
                      { value: 'articles', label: 'Articles', icon: FileText, count: filteredArticles.length },
                    ] as const
                  ).map(({ value, label, icon: Icon, count }) => (
                    <button
                      key={value}
                      onClick={() => { setContentFilter(value); setSelectedTypes([]); }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                        contentFilter === value
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full tabular-nums',
                        contentFilter === value
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {isLoading ? '…' : count}
                      </span>
                    </button>
                  ))}
                </div>
              </SidebarSection>

              <Separator />

              {/* Sort */}
              <SidebarSection title="Sort By">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-full h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarSection>

              <Separator />

              {/* Category */}
              {categories.length > 0 && (
                <SidebarSection title="Category">
                  <CategoryDropdown
                    categories={categories}
                    selectedId={selectedCategoryId}
                    onSelect={setSelectedCategoryId}
                  />
                </SidebarSection>
              )}

              <Separator />

              {/* Tags */}
              {allTags.length > 0 && (
                <SidebarSection title="Tags">
                  <TagsMultiSelect
                    tags={allTags}
                    selectedIds={selectedTagIds}
                    onToggle={toggleTag}
                    onClear={() => setSelectedTagIds([])}
                  />
                </SidebarSection>
              )}

              {/* Type (context-aware) */}
              {typeOptions.length > 0 && (
                <>
                  <Separator />
                  <SidebarSection title={contentFilter === 'courses' ? 'Course Type' : 'Article Type'}>
                    <div className="space-y-0.5">
                      {typeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => toggleType(opt.value)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                            selectedTypes.includes(opt.value)
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </SidebarSection>
                </>
              )}
            </div>
          </aside>

          {/* ── CENTER SEGMENT — results ─────────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">

              {/* Results header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-baseline gap-2">
                  {query ? (
                    <>
                      <h1 className="text-xl font-bold">Results for &quot;{query}&quot;</h1>
                      {isLoading ? (
                        <Skeleton className="h-4 w-20" />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {totalResults} result{totalResults !== 1 ? 's' : ''}
                        </span>
                      )}
                    </>
                  ) : (
                    <h1 className="text-xl font-bold text-muted-foreground">Browse all content</h1>
                  )}
                </div>

                {/* Active filter chips */}
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {selectedCategoryId !== null && (
                      <FilterChip
                        label={categories.find((c) => c.id === selectedCategoryId)?.name ?? 'Category'}
                        onRemove={() => setSelectedCategoryId(null)}
                      />
                    )}
                    {selectedTagIds.map((id) => {
                      const tag = allTags.find(t => t.id === id);
                      return tag ? <FilterChip key={id} label={tag.name} onRemove={() => toggleTag(id)} /> : null;
                    })}
                    {selectedTypes.map((t) => {
                      const opt = [...COURSE_TYPE_OPTIONS, ...ARTICLE_TYPE_OPTIONS].find((o) => o.value === t);
                      return (
                        <FilterChip
                          key={t}
                          label={opt?.label ?? t}
                          onRemove={() => setSelectedTypes((prev) => prev.filter((x) => x !== t))}
                        />
                      );
                    })}
                    {sortBy !== 'newest' && (
                      <FilterChip
                        label={SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy}
                        onRemove={() => setSortBy('newest')}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              {isLoading ? (
                <LoadingGrid />
              ) : (
                <>
                  {/* ALL */}
                  {contentFilter === 'all' && (
                    <div className="space-y-10">
                      {filteredCourses.length > 0 && (
                        <section>
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-semibold flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-primary" />
                              Courses
                              <Badge variant="secondary">{filteredCourses.length}</Badge>
                            </h2>
                            {filteredCourses.length > 6 && (
                              <button
                                onClick={() => setContentFilter('courses')}
                                className="text-sm text-primary hover:underline font-medium"
                              >
                                View all {filteredCourses.length} &rarr;
                              </button>
                            )}
                          </div>
                          {renderCourseGrid(filteredCourses, 6)}
                        </section>
                      )}

                      {filteredArticles.length > 0 && (
                        <section>
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-semibold flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              Articles
                              <Badge variant="secondary">{filteredArticles.length}</Badge>
                            </h2>
                            {filteredArticles.length > 6 && (
                              <button
                                onClick={() => setContentFilter('articles')}
                                className="text-sm text-primary hover:underline font-medium"
                              >
                                View all {filteredArticles.length} &rarr;
                              </button>
                            )}
                          </div>
                          {renderArticleGrid(filteredArticles, 6)}
                        </section>
                      )}

                      {totalResults === 0 && (
                        <div className="text-center py-20">
                          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                          <h2 className="text-lg font-semibold mb-2">
                            {query ? 'No results found' : 'Search for anything'}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {query ? (
                              <>
                                Try different keywords or{' '}
                                <button onClick={clearAllFilters} className="text-primary underline">
                                  clear filters
                                </button>
                              </>
                            ) : (
                              'Type a keyword in the search bar above'
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* COURSES */}
                  {contentFilter === 'courses' && (
                    filteredCourses.length === 0 ? (
                      <div className="text-center py-20">
                        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                        <h2 className="text-lg font-semibold mb-2">No courses found</h2>
                        <p className="text-sm text-muted-foreground">
                          Try adjusting your filters or{' '}
                          <button onClick={clearAllFilters} className="text-primary underline">clear all</button>
                        </p>
                      </div>
                    ) : renderCourseGrid(filteredCourses)
                  )}

                  {/* ARTICLES */}
                  {contentFilter === 'articles' && (
                    filteredArticles.length === 0 ? (
                      <div className="text-center py-20">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                        <h2 className="text-lg font-semibold mb-2">No articles found</h2>
                        <p className="text-sm text-muted-foreground">
                          Try adjusting your filters or{' '}
                          <button onClick={clearAllFilters} className="text-primary underline">clear all</button>
                        </p>
                      </div>
                    ) : renderArticleGrid(filteredArticles)
                  )}
                </>
              )}
            </div>
          </main>

        </div>
      </div>
    </PublicLayout>
  );
};

export default SearchResults;
