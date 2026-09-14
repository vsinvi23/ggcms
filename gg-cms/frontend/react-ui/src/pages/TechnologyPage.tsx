import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, Search, ChevronRight, Layers, ArrowRight,
  Code2, Cloud, ShieldCheck, Database, Cpu, Lock, Globe, KeyRound, Compass,
  Sparkles, GraduationCap, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useCategories } from '@/api/hooks/useCategories';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useTopics } from '@/api/hooks/useTopics';
import { TopicChip } from '@/components/public/TopicChip';
import { CmsResponseDto } from '@/api/types';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { PublicArticleCard } from '@/components/public/PublicArticleCard';
import { ExploreContentCard } from '@/components/public/ExploreContentCard';
import { cn } from '@/lib/utils';

// Helper to choose a domain/category icon
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
  const [searchQuery, setSearchQuery] = useState('');

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: topicsData } = useTopics();

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

    // Fallback category object for known category slugs if not in API list yet
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
      description: `Comprehensive hands-on courses, in-depth technical guides, tutorials, and real-world architectures for ${name}.`,
    };
  }, [categories, slug]);

  // Fetch articles and courses for this category from live CMS API
  const { data: articlesData, isLoading: articlesLoading } = usePublicCmsList({ type: 'ARTICLE', size: 100 });
  const { data: coursesData, isLoading: coursesLoading } = usePublicCmsList({ type: 'COURSE', size: 100 });

  const allArticles: CmsResponseDto[] = useMemo(() => articlesData?.items ?? [], [articlesData]);
  const allCourses: CmsResponseDto[] = useMemo(() => coursesData?.items ?? [], [coursesData]);

  // Filter items belonging to this category or matching category name/slug
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

  // Filtered by local search query inside this category landing page
  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return categoryArticles;
    const q = searchQuery.toLowerCase();
    return categoryArticles.filter(a => a.title?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
  }, [categoryArticles, searchQuery]);

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return categoryCourses;
    const q = searchQuery.toLowerCase();
    return categoryCourses.filter(c => c.title?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [categoryCourses, searchQuery]);

  // Related knowledge-graph topics for this category
  const relatedTopics = useMemo(() => {
    if (!topicsData || !category) return [];
    return topicsData.filter(t => {
      const text = `${t.name} ${t.description ?? ''}`.toLowerCase();
      return text.includes(category.name.toLowerCase()) || (slug && text.includes(slug.toLowerCase()));
    }).slice(0, 10);
  }, [topicsData, category, slug]);

  const isLoading = catLoading || articlesLoading || coursesLoading;
  const CategoryIcon = getCategoryIcon(category?.name ?? slug ?? '');

  if (!catLoading && !category && slug) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto text-center py-20 px-6">
          <Layers className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Category not found</h1>
          <p className="text-muted-foreground mb-6">This category could not be located in our catalog.</p>
          <Button onClick={() => navigate('/explore/articles')}>Browse Catalog</Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/explore/articles" className="hover:text-primary transition-colors">Explore</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{category?.name ?? slug}</span>
        </nav>

        {/* Hero Header Card */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 text-white p-8 sm:p-10 border border-primary/20 shadow-xl space-y-6">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 text-primary-foreground flex items-center justify-center shrink-0">
                  <CategoryIcon className="w-6 h-6" />
                </div>
                <Badge variant="secondary" className="bg-primary/20 text-white border-primary/30">
                  <Sparkles className="w-3 h-3 mr-1 text-primary-foreground" /> Technology Hub
                </Badge>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                {category?.name ?? slug}
              </h1>

              <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
                {category?.description || `Explore comprehensive resources, deep-dive articles, and courses on ${category?.name}.`}
              </p>

              {/* Stat Counters */}
              <div className="flex items-center gap-6 pt-2 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary-foreground" />
                  <span className="font-bold text-white">{categoryCourses.length}</span> Courses
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary-foreground" />
                  <span className="font-bold text-white">{categoryArticles.length}</span> Articles
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-primary-foreground" />
                  <span className="font-bold text-white">Structured Track</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="shrink-0 space-y-3">
              <Button onClick={() => navigate('/explore/courses')} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2 shadow-md">
                <BookOpen className="w-4 h-4" /> Browse All Courses
              </Button>
              <Button onClick={() => navigate('/explore/paths')} variant="outline" className="w-full text-slate-200 border-slate-700 hover:bg-slate-800 rounded-xl gap-2">
                <Compass className="w-4 h-4" /> View Learning Paths
              </Button>
            </div>
          </div>

          {/* Search inside Category */}
          <div className="relative pt-4 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search topics in ${category?.name ?? 'this category'}...`}
              className="pl-10 h-11 rounded-xl bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-400 focus:border-primary text-sm"
            />
          </div>
        </section>

        {/* Knowledge Graph Topics Banner */}
        {relatedTopics.length > 0 && (
          <section className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Related Topics in Knowledge Graph
            </h3>
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map(topic => (
                <TopicChip key={topic.id} name={topic.name} slug={topic.slug} />
              ))}
            </div>
          </section>
        )}

        {/* Content Tabs (Overview | Courses | Articles) */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/60 p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg font-semibold">Overview</TabsTrigger>
            <TabsTrigger value="courses" className="rounded-lg font-semibold flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> Courses ({categoryCourses.length})
            </TabsTrigger>
            <TabsTrigger value="articles" className="rounded-lg font-semibold flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Articles ({categoryArticles.length})
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-8">
            {/* Key Learning Outcomes */}
            <section className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                What You&apos;ll Learn in {category?.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>In-depth architectural patterns & best practices</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>Production-ready security & compliance guidelines</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>Hands-on implementation code walkthroughs</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>Real-world case studies and interview capsules</span>
                </div>
              </div>
            </section>

            {/* Featured Courses */}
            {categoryCourses.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    Courses in {category?.name}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {categoryCourses.slice(0, 4).map(course => (
                    <ExploreContentCard key={course.id} item={course} />
                  ))}
                </div>
              </section>
            )}

            {/* Featured Articles */}
            {categoryArticles.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Articles & Guides
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {categoryArticles.slice(0, 4).map(article => (
                    <PublicArticleCard key={article.id} article={article} />
                  ))}
                </div>
              </section>
            )}
          </TabsContent>

          {/* COURSES TAB */}
          <TabsContent value="courses" className="space-y-4">
            {isLoading ? (
              <LoadingGrid count={4} />
            ) : filteredCourses.length === 0 ? (
              <EmptyState message={`No courses found matching "${searchQuery || category?.name}".`} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCourses.map(course => (
                  <ExploreContentCard key={course.id} item={course} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ARTICLES TAB */}
          <TabsContent value="articles" className="space-y-4">
            {isLoading ? (
              <LoadingGrid count={4} />
            ) : filteredArticles.length === 0 ? (
              <EmptyState message={`No articles found matching "${searchQuery || category?.name}".`} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredArticles.map(article => (
                  <PublicArticleCard key={article.id} article={article} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
};

function LoadingGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 bg-card rounded-2xl border border-border p-8 space-y-3">
      <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto" />
      <h3 className="text-lg font-bold text-foreground">No resources yet</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default TechnologyPage;
