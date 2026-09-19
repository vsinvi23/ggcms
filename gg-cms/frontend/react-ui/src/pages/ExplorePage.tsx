import React, { useState, useMemo } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Compass, Clock, ArrowRight, Filter, CheckCircle2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

import { useCategories } from '@/api/hooks/useCategories';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useContentTypes } from '@/api/hooks/useContentTypes';
import { buildArticleUrl } from '@/lib/slug';

interface ExploreCardItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentType: string;
  category: string;
  readingTimeMinutes: number;
  domain: string;
  tags: string[];
  publishedDate: string;
  isTrending?: boolean;
  isFeatured?: boolean;
}

const mockExploreItems: ExploreCardItem[] = [
  {
    id: 'e-1',
    slug: 'oauth-2-explained',
    title: 'OAuth 2.0 & PKCE Flow Explained Simply',
    excerpt: 'OAuth 2.0 is often misunderstood. Learn how authorization flows work, step by step, with code samples and security tokens.',
    contentType: 'Article',
    category: 'Security',
    readingTimeMinutes: 10,
    domain: 'Identity',
    tags: ['OAuth', 'Security', 'Identity', 'PKCE'],
    publishedDate: '2026-03-10',
    isTrending: true,
    isFeatured: true,
  },
  {
    id: 'e-2',
    slug: 'docker-commands-cheat-sheet',
    title: 'Docker & Container Management Cheat Sheet',
    excerpt: 'Essential Docker CLI commands for container lifecycle, volume mounts, networking, inspect, and docker-compose overrides.',
    contentType: 'Cheat Sheet',
    category: 'DevOps',
    readingTimeMinutes: 5,
    domain: 'Infrastructure',
    tags: ['Docker', 'DevOps', 'Containers', 'CLI'],
    publishedDate: '2026-03-12',
    isTrending: true,
  },
  {
    id: 'e-3',
    slug: 'kubernetes-networking-deep-dive',
    title: 'Understanding Kubernetes Networking & Service Mesh',
    excerpt: 'Deep dive into CNI plugins, IPVS, CoreDNS, ingress controllers, and envoy sidecar routing in K8s clusters.',
    contentType: 'Deep Dive',
    category: 'Cloud',
    readingTimeMinutes: 18,
    domain: 'Cloud Infrastructure',
    tags: ['Kubernetes', 'Networking', 'Envoy', 'Ingress'],
    publishedDate: '2026-03-14',
    isTrending: true,
  },
  {
    id: 'e-4',
    slug: 'go-concurrency-patterns-tutorial',
    title: 'Go Concurrency Patterns: Workers, Pipelines & Fan-Out',
    excerpt: 'Master production-grade concurrency patterns using channels, sync.WaitGroup, context cancellation, and worker pools.',
    contentType: 'Tutorial',
    category: 'Engineering',
    readingTimeMinutes: 12,
    domain: 'Backend Architecture',
    tags: ['Go', 'Concurrency', 'Channels', 'Backend'],
    publishedDate: '2026-03-08',
  },
  {
    id: 'e-5',
    slug: 'building-production-go-api-lab',
    title: 'Hands-on Lab: Building a Production Go REST API',
    excerpt: 'Step-by-step practical lab configuring structured logging, PostgreSQL connection pools, JWT auth middleware, and Docker deployment.',
    contentType: 'Lab',
    category: 'Engineering',
    readingTimeMinutes: 30,
    domain: 'Backend Engineering',
    tags: ['Go', 'REST', 'PostgreSQL', 'Lab'],
    publishedDate: '2026-03-01',
    isFeatured: true,
  },
];

export function ExplorePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Live backend categories API hook
  const { data: backendCategories } = useCategories();
  // Live backend published CMS articles API hook
  const { data: publicCmsData } = usePublicCmsList({ type: 'ARTICLE', size: 50 });
  // Live backend content format types API hook
  const { data: backendArticleTypes } = useContentTypes('article');

  const contentTypes = useMemo(() => {
    const fetched = (backendArticleTypes ?? []).map(t => t.label).filter(Boolean);
    if (fetched.length > 0) {
      return ['All', ...Array.from(new Set(fetched))];
    }
    return ['All', 'Articles', 'Guides', 'Tutorials', 'Deep Dives', 'Cheat Sheets', 'References', 'Labs', 'Projects'];
  }, [backendArticleTypes]);

  const backendExploreItems = useMemo(() => {
    if (!publicCmsData?.items || publicCmsData.items.length === 0) return [];
    return publicCmsData.items.map(item => ({
      id: String(item.id),
      slug: item.slug || buildArticleUrl(item),
      title: item.title,
      excerpt: item.description || '',
      contentType: (item.articleType as any) || 'Article',
      category: item.categoryName || 'Engineering',
      readingTimeMinutes: item.readingTimeMinutes || 10,
      domain: item.categoryName || 'General',
      tags: item.tags || ['Article', 'Tech'],
      publishedDate: item.publishedAt || '2026-03-15',
      isTrending: true,
      isFeatured: false,
    }));
  }, [publicCmsData]);

  const allExploreItems = useMemo(() => {
    if (backendExploreItems.length > 0) return backendExploreItems;
    return mockExploreItems;
  }, [backendExploreItems]);

  const categories = useMemo(() => {
    const fetchedNames = (backendCategories ?? []).map(c => c.name).filter(Boolean);
    if (fetchedNames.length > 0) {
      return ['All', ...Array.from(new Set(fetchedNames))];
    }
    return ['All', 'Security', 'DevOps', 'Cloud', 'Engineering'];
  }, [backendCategories]);

  const filteredItems = useMemo(() => {
    return allExploreItems.filter(item => {
      const matchesSearch = searchQuery === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesType = true;
      if (selectedType !== 'All') {
        const singularType = selectedType.replace(/s$/, '').replace(/ies$/, 'y');
        matchesType = item.contentType.toLowerCase().includes(singularType.toLowerCase());
      }

      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;

      return matchesSearch && matchesType && matchesCat;
    });
  }, [searchQuery, selectedType, selectedCategory]);

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        
        {/* Clean Sub-Header Bar — Title Left, Centered Search Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Explore
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Knowledge & articles</p>
              </div>
            </div>

            {/* Centered Search Bar */}
            <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search articles, cheat sheets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border shadow-2xs w-full"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Spacer */}
            <div className="hidden sm:block sm:w-1/4"></div>
          </div>
        </div>

        {/* 2-Column Space-Optimized Layout */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left-Aligned Compact Filter Panel */}
            <div className="md:col-span-1 space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Filter className="w-3 h-3 text-primary" />
                  Format & Domain
                </span>
                {(selectedType !== 'All' || selectedCategory !== 'All' || searchQuery !== '') && (
                  <button onClick={() => { setSelectedType('All'); setSelectedCategory('All'); setSearchQuery(''); }} className="text-[11px] text-primary hover:underline font-semibold">
                    Reset
                  </button>
                )}
              </div>

              {/* Content Format */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Format</label>
                <div className="flex flex-wrap gap-1">
                  {contentTypes.map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedType(t)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedType === t
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain Category */}
              <div className="space-y-1 pt-1.5 border-t border-border/50">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Domain</label>
                <div className="flex flex-wrap gap-1">
                  {categories.map(c => (
                    <button
                      key={c}
                      onClick={() => setSelectedCategory(c)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedCategory === c
                          ? 'bg-primary/10 text-primary font-bold border border-primary/30'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — Cards Grid immediately visible */}
            <div className="md:col-span-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md group cursor-pointer"
                    onClick={() => navigate(`/article/${item.slug}`)}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] font-bold">
                          {item.contentType}
                        </Badge>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {item.readingTimeMinutes} min read
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.excerpt}
                      </p>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {item.tags.map(t => (
                          <span key={t} className="text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/60 mt-4 flex items-center justify-between text-xs font-bold text-primary">
                      <span>Read Resource</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default ExplorePage;
