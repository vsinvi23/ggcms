import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, FileText, Hash, Folder, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useTopics } from '@/api/hooks/useTopics';
import { useCategories } from '@/api/hooks/useCategories';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { CmsResponseDto } from '@/api/types';

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  // Live real backend API hooks (no mock data)
  const { data: cmsData, isLoading: loadingCms } = usePublicCmsList({ size: 100 });
  const { data: topicsData } = useTopics();
  const { data: categoriesData } = useCategories();

  const allItems = useMemo(() => cmsData?.items ?? [], [cmsData]);
  const allTopics = useMemo(() => topicsData ?? [], [topicsData]);
  const allCategories = useMemo(() => categoriesData ?? [], [categoriesData]);

  const searchQuery = query.trim().toLowerCase();

  // Capped strictly at 3 items per section
  const matchingContent = useMemo(() => {
    if (!searchQuery) return allItems.slice(0, 3);
    return allItems
      .filter(item =>
        (item.title ?? '').toLowerCase().includes(searchQuery) ||
        (item.description ?? '').toLowerCase().includes(searchQuery) ||
        (item.categoryName ?? '').toLowerCase().includes(searchQuery),
      )
      .slice(0, 3);
  }, [allItems, searchQuery]);

  const matchingTopics = useMemo(() => {
    if (!searchQuery) return allTopics.slice(0, 3);
    return allTopics
      .filter(topic =>
        (topic.name ?? '').toLowerCase().includes(searchQuery) ||
        (topic.description ?? '').toLowerCase().includes(searchQuery),
      )
      .slice(0, 3);
  }, [allTopics, searchQuery]);

  const matchingCategories = useMemo(() => {
    if (!searchQuery) return allCategories.slice(0, 3);
    return allCategories
      .filter(cat => (cat.name ?? '').toLowerCase().includes(searchQuery))
      .slice(0, 3);
  }, [allCategories, searchQuery]);

  const handleSelectContent = (item: CmsResponseDto) => {
    const isArticle = item.type === 'ARTICLE' || !!item.articleType;
    const url = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);
    onOpenChange(false);
    setQuery('');
    navigate(url);
  };

  const handleSelectTopic = (slug: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(`/explore/articles?topic=${encodeURIComponent(slug)}`);
  };

  const handleSelectCategory = (id: number) => {
    onOpenChange(false);
    setQuery('');
    navigate(`/explore/articles?category=${id}`);
  };

  const handleViewAllResults = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onOpenChange(false);
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl overflow-hidden rounded-2xl border border-border shadow-2xl bg-card">
        {/* Search Input Bar */}
        <form onSubmit={handleViewAllResults} className="border-b border-border px-4 py-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-muted-foreground shrink-0 ml-1" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses, articles, topics, categories..."
            className="border-0 focus-visible:ring-0 text-base h-9 bg-transparent p-0 flex-1 placeholder:text-muted-foreground/60"
            autoFocus
          />
          {query && (
            <Badge
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-muted font-normal"
              onClick={handleViewAllResults}
            >
              Press Enter to see all
            </Badge>
          )}
        </form>

        {/* Results Container - Strictly bounded to 380px max height */}
        <div className="max-h-[380px] overflow-y-auto p-3 space-y-4 divide-y divide-border/40">

          {/* Section 1: Content Matches (Capped at 3) */}
          {matchingContent.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                Courses & Articles
              </p>
              <div className="space-y-1">
                {matchingContent.map(item => {
                  const isArticle = item.type === 'ARTICLE' || !!item.articleType;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectContent(item)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left hover:bg-muted/60 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {isArticle ? <FileText className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors block truncate">
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {item.categoryName ? `${item.categoryName} · ` : ''}{isArticle ? 'Article' : 'Course'}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Topics Matches (Capped at 3) */}
          {matchingTopics.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                Topics & Technologies
              </p>
              <div className="space-y-1">
                {matchingTopics.map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => handleSelectTopic(topic.slug)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left hover:bg-muted/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Hash className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                        {topic.name}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0 font-normal">
                      Topic
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Category Matches (Capped at 3) */}
          {matchingCategories.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                Categories
              </p>
              <div className="space-y-1">
                {matchingCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left hover:bg-muted/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Folder className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                        {cat.name}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0 font-normal">
                      Category
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loadingCms && matchingContent.length === 0 && matchingTopics.length === 0 && matchingCategories.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
