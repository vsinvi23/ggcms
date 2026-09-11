import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecommendedContent } from '@/components/personalization/RecommendedContent';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import {
  Search, BookOpen, ChevronRight, ArrowRight,
  FileText, Cloud, ShieldCheck, Database, Brain, Code2,
} from 'lucide-react';
import { UserLearningSection } from '@/components/home/UserLearningSection';
import { useDomains } from '@/api/hooks/useDomains';
import { useTopics } from '@/api/hooks/useTopics';
import { TopicChip } from '@/components/public/TopicChip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsList, usePublicLearningPaths } from '@/api/hooks/usePublicCms';
import { useTags } from '@/api/hooks/useTags';
import { Skeleton } from '@/components/ui/skeleton';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { DomainDto } from '@/api/types';

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, subtitle, viewAllHref, viewAllLabel = 'View All', tinted = false, children,
}: {
  title: string; subtitle?: string; viewAllHref?: string;
  viewAllLabel?: string; tinted?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-border py-10 px-6 ${tinted ? 'bg-muted/20' : 'bg-background'}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {viewAllHref && (
            <Button variant="ghost" size="sm" asChild className="text-primary shrink-0">
              <Link to={viewAllHref}>{viewAllLabel} <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Link>
            </Button>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

// ─── Domain discovery ──────────────────────────────────────────────────────────

const DOMAIN_ICONS: Record<string, React.ElementType> = {
  'software-engineering': Code2,
  'cloud-infrastructure': Cloud,
  'cybersecurity': ShieldCheck,
  'data': Database,
  'ai-machine-learning': Brain,
};

function DomainCard({ domain }: { domain: DomainDto }) {
  const Icon = DOMAIN_ICONS[domain.slug] ?? BookOpen;
  const count = (domain.articleCount ?? 0) + (domain.courseCount ?? 0);

  return (
    <Link to={`/explore/courses?domain=${domain.slug}`}>
      <Card className="group h-full cursor-pointer transition-colors border-border/60 hover:border-primary/40">
        <CardContent className="p-4 flex flex-col gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 w-fit text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-sm text-foreground leading-snug">{domain.name}</h3>
          {count > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
              {count}+ resources <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

const PublicHome = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate   = useNavigate();
  const flags      = useFeatureFlags();
  const { isAuthenticated } = useAuth();
  const { data: profile }   = useProfile();

  const { data: tagsData }         = useTags();
  const { data: apiLearningPaths } = usePublicLearningPaths();
  const { data: domains }          = useDomains();
  const { data: topics }           = useTopics();

  const trendingTags   = (tagsData ?? []).slice(0, 5).map(t => t.name);
  const learningPaths  = apiLearningPaths ?? [];
  const popularTopics  = (topics ?? []).slice(0, 8);

  const { data: latestData, isLoading: loadingLatest } = usePublicCmsList({ type: 'ARTICLE', page: 0, size: 6 });
  const latestItems = latestData?.items ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <PublicLayout>
      <div>

        {/* ── Hero (compact) ──────────────────────────────────────────────── */}
        <section className="bg-muted/20 px-6 py-12 lg:py-16 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl lg:text-5xl font-extrabold text-foreground leading-[1.15] tracking-tight">
                Build Better. <span className="text-primary">Learn Deeper.</span>
              </h1>
              <p className="text-muted-foreground text-base max-w-lg mx-auto">
                Practical, in-depth learning for modern developers.
              </p>
            </div>

            <form onSubmit={handleSearch}>
              <div className="relative bg-card rounded-xl border border-border focus-within:border-primary transition-colors p-1.5">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
                  <Input
                    placeholder="What do you want to learn today?"
                    className="border-0 focus-visible:ring-0 text-base h-10 bg-transparent flex-1 placeholder:text-muted-foreground/60"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <Button className="rounded-lg px-6 h-9 shrink-0">Search</Button>
                </div>
              </div>
            </form>

            {trendingTags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {trendingTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}`)}
                    className="text-sm px-3.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Continue Learning (authenticated only) ──────────────────────── */}
        {isAuthenticated && (
          <div className="pt-10">
            <UserLearningSection />
          </div>
        )}

        {/* ── Recommended for You ──────────────────────────────────────────── */}
        {isAuthenticated && profile?.onboardingCompleted && (
          <section className="border-t border-border py-10 px-6 bg-background">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2 mb-6">
                <h2 className="text-xl font-bold">Recommended for You</h2>
                <Badge variant="secondary" className="text-xs">Personalised</Badge>
              </div>
              <RecommendedContent
                limit={6}
                onItemClick={item =>
                  navigate(item.contentType === 'course' ? `/course/${item.publicId}` : `/article/${item.publicId}`)
                }
              />
            </div>
          </section>
        )}

        {/* ── Explore by Domain ────────────────────────────────────────────── */}
        {domains && domains.length > 0 && (
          <Section title="Explore by Domain" tinted>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {domains.map(domain => <DomainCard key={domain.id} domain={domain} />)}
            </div>
          </Section>
        )}

        {/* ── Popular Topics ───────────────────────────────────────────────── */}
        {popularTopics.length > 0 && (
          <Section title="Popular Topics" viewAllHref="/topics">
            <div className="flex flex-wrap gap-2">
              {popularTopics.map(topic => (
                <TopicChip key={topic.id} name={topic.name} slug={topic.slug} />
              ))}
            </div>
          </Section>
        )}

        {/* ── New & Updated ────────────────────────────────────────────────── */}
        {(latestItems.length > 0 || loadingLatest) && (
          <Section title="New & Updated" subtitle="Latest" tinted>
            {loadingLatest ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {latestItems.map(item => {
                  const isArticle = item.type === 'ARTICLE';
                  const linkPath  = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);
                  const readMin   = Math.max(1, (item.blockCount ?? 0) * 2 || 5);
                  return (
                    <li key={item.id}>
                      <Link
                        to={linkPath}
                        className="group flex items-center justify-between gap-4 py-3 hover:text-primary transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground group-hover:text-primary truncate">
                            {item.title || 'Untitled'}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">{readMin} min</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {/* ── Learning Paths ────────────────────────────────────────────────── */}
        {flags.learning_paths && learningPaths.length > 0 && (
          <Section title="Learning Paths" subtitle="Comprehensive tracks designed for your career"
            viewAllHref="/explore/paths">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {learningPaths.slice(0, 6).map(path => (
                <Link key={path.id} to={`/learn/${path.id}`}>
                  <Card className="group cursor-pointer hover:border-primary/30 transition-colors h-full border-border/50">
                    <CardContent className="p-5 flex gap-4 items-start">
                      <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {path.title}
                        </h4>
                        {path.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{path.description}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </Section>
        )}

      </div>
    </PublicLayout>
  );
};

export default PublicHome;
