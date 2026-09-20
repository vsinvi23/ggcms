import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, Search, ChevronRight, Layers, ArrowRight, X, Tag, SlidersHorizontal,
  Code2, Cloud, ShieldCheck, Database, Cpu, Lock, Globe, KeyRound, FolderTree,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useCategories } from '@/api/hooks/useCategories';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useTopics } from '@/api/hooks/useTopics';
import { useTags } from '@/api/hooks/useTags';
import { CmsResponseDto } from '@/api/types';
import { PublicArticleCard } from '@/components/public/PublicArticleCard';
import { ExploreContentCard } from '@/components/public/ExploreContentCard';
import { cn } from '@/lib/utils';

// Helper to choose category icon based on name
function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('oauth') || lower.includes('auth') || lower.includes('identity')) return KeyRound;
  if (lower.includes('pki') || lower.includes('crypto') || lower.includes('security')) return Lock;
  if (lower.includes('software') || lower.includes('code') || lower.includes('app')) return Code2;
  if (lower.includes('cloud') || lower.includes('network') || lower.includes('infra')) return Cloud;
  if (lower.includes('data') || lower.includes('sql') || lower.includes('database')) return Database;
  if (lower.includes('ai') || lower.includes('machine') || lower.includes('llm')) return Cpu;
  if (lower.includes('web') || lower.includes('global')) return Globe;
  return ShieldCheck;
}

const TechnologyPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [contentType, setContentType] = useState<'ALL' | 'ARTICLE' | 'COURSE'>('ALL');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az'>('newest');

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: topicsData } = useTopics();
  const { data: tagsData = [] } = useTags();

  // Match category by slug, ID, or normalized name slug
  const category = useMemo(() => {
    if (!slug) return null;
    const q = slug.toLowerCase();

    const found = (categories ?? []).find(
      (c) =>
        c.slug?.toLowerCase() === q ||
        c.id.toString() === q ||
        c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === q ||
        c.name.toLowerCase() === q
    );
    if (found) return found;

    // Fallback category object for known category slugs
    const categoryNamesMap: Record<string, string> = {
      'identity-access': 'Identity & Access',
      'identity-and-access': 'Identity & Access',
      'identity': 'Identity & Access',
      'pki-cryptography': 'PKI & Cryptography',
      'pki': 'PKI & Cryptography',
      'software-engineering': 'Software Engineering',
      'cloud-infrastructure': 'Cloud Infrastructure',
      'cloud': 'Cloud Infrastructure',
      'cybersecurity': 'Cybersecurity',
      'security': 'Cybersecurity',
      'data': 'Data Engineering',
      'ai-machine-learning': 'AI & Machine Learning',
    };

    const name = categoryNamesMap[q] || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      id: 999,
      name,
      slug: q,
      description: `In-depth technical articles, tutorials, guides, and engineering architectures for ${name}.`,
    };
  }, [categories, slug]);

  // Fetch articles and courses for this category from live CMS API
  const { data: articlesData, isLoading: articlesLoading } = usePublicCmsList({ type: 'ARTICLE', size: 100 });
  const { data: coursesData, isLoading: coursesLoading } = usePublicCmsList({ type: 'COURSE', size: 100 });

  const allArticles: CmsResponseDto[] = useMemo(() => articlesData?.items ?? [], [articlesData]);
  const allCourses: CmsResponseDto[] = useMemo(() => coursesData?.items ?? [], [coursesData]);

  // Items belonging to this category
  const categoryArticles = useMemo(() => {
    if (!category) return [];
    return allArticles.filter(item => {
      if (category.id !== 999 && item.categoryId === category.id) return true;
      const text = `${item.categoryName ?? ''} ${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
      return text.includes(category.name.toLowerCase()) || (slug && text.includes(slug.toLowerCase()));
    });
  }, [allArticles, category, slug]);

  const categoryCourses = useMemo(() => {
    if (!category) return [];
    return allCourses.filter(item => {
      if (category.id !== 999 && item.categoryId === category.id) return true;
      const text = `${item.categoryName ?? ''} ${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
      return text.includes(category.name.toLowerCase()) || (slug && text.includes(slug.toLowerCase()));
    });
  }, [allCourses, category, slug]);

  // Relevant tags for this category
  const categoryTags = useMemo(() => {
    if (!category) return [];
    if (tagsData && tagsData.length > 0) return tagsData;
    return (topicsData ?? [])
      .map(t => ({ id: t.id, name: t.name, slug: t.slug }))
      .slice(0, 10);
  }, [tagsData, topicsData, category]);

  // All combined content items in this category
  const categoryContent = useMemo(() => {
    const map = new Map<string, CmsResponseDto & { contentType: 'ARTICLE' | 'COURSE' }>();
    categoryArticles.forEach(a => map.set(`article-${a.id}`, { ...a, contentType: 'ARTICLE' }));
    categoryCourses.forEach(c => map.set(`course-${c.id}`, { ...c, contentType: 'COURSE' }));
    return Array.from(map.values());
  }, [categoryArticles, categoryCourses]);

  // Filter & sort final displayed items
  const filteredItems = useMemo(() => {
    let list = categoryContent;

    // Filter by type
    if (contentType === 'ARTICLE') {
      list = list.filter(item => item.contentType === 'ARTICLE');
    } else if (contentType === 'COURSE') {
      list = list.filter(item => item.contentType === 'COURSE');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item =>
        (item.title ?? '').toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.categoryName ?? '').toLowerCase().includes(q)
      );
    }

    // Filter by selected tag
    if (selectedTag) {
      const tagLower = selectedTag.toLowerCase();
      list = list.filter(item =>
        `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase().includes(tagLower)
      );
    }

    // Sort items
    list = [...list].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      }
      if (sortBy === 'az') {
        return (a.title ?? '').localeCompare(b.title ?? '');
      }
      // Newest first (default)
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });

    return list;
  }, [categoryContent, contentType, searchQuery, selectedTag, sortBy]);

  const isLoading = catLoading || articlesLoading || coursesLoading;
  const CategoryIcon = getCategoryIcon(category?.name ?? slug ?? '');

  if (!catLoading && !category && slug) {
    // If exact category DB record is absent, render TechnologyPage using slug as title
    const formattedTitle = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const fallbackCategory = { id: 0, name: formattedTitle, slug };
    return (
      <PublicLayout>
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/articles" className="hover:text-primary transition-colors">Articles</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">{formattedTitle}</span>
          </nav>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <CategoryIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{formattedTitle}</h1>
              <p className="text-xs text-muted-foreground">Curated guides and courses tagged with {formattedTitle}</p>
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/explore/categories" className="hover:text-primary transition-colors">Categories</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{category?.name ?? slug}</span>
        </nav>

        {/* Clean, Space-Efficient Category Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <CategoryIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                  {category?.name ?? slug}
                </h1>
                <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border-primary/20">
                  {categoryArticles.length} Articles · {categoryCourses.length} Courses
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mt-0.5 max-w-3xl line-clamp-1">
                {category?.description || `Technical articles, guides, and courses on ${category?.name}.`}
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar & Type Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Integrated Search Input with Tag Autocomplete Suggestions */}
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search articles, topics or #tags in ${category?.name ?? 'category'}...`}
              className="pl-10 pr-9 h-10 rounded-xl bg-card border-border shadow-xs text-sm focus:border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Tag Typeahead Suggestions Dropdown on Typing */}
            {searchQuery.trim().length > 0 && (() => {
              const qClean = searchQuery.trim().replace(/^#/, '').toLowerCase();
              const matchingTags = categoryTags.filter(t => t.name.toLowerCase().includes(qClean));
              if (matchingTags.length === 0) return null;

              return (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg p-2 max-h-48 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-muted-foreground px-2 py-1 flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-primary" />
                    Matching Tag Suggestions:
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-1">
                    {matchingTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          setSelectedTag(tag.name);
                          setSearchQuery('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer flex items-center gap-1"
                      >
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Active Tag Filter Chip if tag filter selected */}
            {selectedTag && (
              <Badge className="h-9 px-3 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 shadow-xs">
                <Tag className="w-3 h-3" /> #{selectedTag}
                <button
                  onClick={() => setSelectedTag(null)}
                  className="hover:opacity-80 transition-opacity ml-1"
                  title="Clear tag filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {/* Content Type Filter Buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border">
              {(
                [
                  { id: 'ALL', label: `All (${categoryContent.length})` },
                  { id: 'ARTICLE', label: `Articles (${categoryArticles.length})` },
                  { id: 'COURSE', label: `Courses (${categoryCourses.length})` },
                ] as const
              ).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setContentType(tab.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                    contentType === tab.id
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sort Select */}
            <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-10 w-36 text-xs border-border bg-card rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="az">A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main Article & Resource Grid Listing */}
        <main className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredItems.length}</span> resources in {category?.name ?? 'category'}
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl border border-border" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-border p-8 space-y-3">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <h3 className="text-lg font-bold text-foreground">No resources found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                No content matches your search query or selected tag in {category?.name}.
              </p>
              {(searchQuery || selectedTag) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTag(null);
                  }}
                  className="mt-2 rounded-xl"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map(item =>
                item.contentType === 'ARTICLE' ? (
                  <PublicArticleCard key={item.id} article={item} />
                ) : (
                  <ExploreContentCard key={item.id} item={item} />
                )
              )}
            </div>
          )}
        </main>
      </div>
    </PublicLayout>
  );
};

export default TechnologyPage;
