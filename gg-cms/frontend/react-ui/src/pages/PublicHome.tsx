import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecommendedContent } from '@/components/personalization/RecommendedContent';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import {
  Search, BookOpen, ChevronRight, ArrowRight,
  FileText, Cloud, ShieldCheck, Database, Brain, Code2,
  Sparkles, Zap, Target, Award, CheckCircle2, Flame, GraduationCap,
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
import { cn } from '@/lib/utils';

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, subtitle, viewAllHref, viewAllLabel = 'View All', tinted = false, children,
}: {
  title: string; subtitle?: string; viewAllHref?: string;
  viewAllLabel?: string; tinted?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-border py-12 px-6 ${tinted ? 'bg-muted/20' : 'bg-background'}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {viewAllHref && (
            <Button variant="ghost" size="sm" asChild className="text-primary font-semibold shrink-0">
              <Link to={viewAllHref}>{viewAllLabel} <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
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
      <Card className="group h-full cursor-pointer transition-all border-border/80 hover:border-primary/40 hover:shadow-md rounded-2xl">
        <CardContent className="p-5 flex flex-col gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 w-fit text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-foreground leading-snug group-hover:text-primary transition-colors">{domain.name}</h3>
          {count > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium group-hover:text-primary transition-colors">
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

  const trendingTags   = (tagsData ?? []).slice(0, 6).map(t => t.name);
  const learningPaths  = apiLearningPaths ?? [];
  const popularTopics  = (topics ?? []).slice(0, 10);

  const { data: latestData, isLoading: loadingLatest } = usePublicCmsList({ type: 'ARTICLE', page: 0, size: 6 });
  const latestItems = latestData?.items ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <PublicLayout>
      <div className="space-y-0">

        {/* ── Guest Hero Banner (Catchy & High-Converting) ──────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background border-b border-border py-16 lg:py-24 px-6 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
          <div className="max-w-4xl mx-auto space-y-8 relative z-10">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary shadow-2xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Learn Smarter, Grow Faster with GeekGully</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight leading-[1.12]">
                Master Tech Skills. <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-primary via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
                  Simple, Guided &amp; Production-Ready.
                </span>
              </h1>
              <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-normal">
                Explore hand-crafted articles, interactive courses, and role-based learning tracks built for modern engineers.
              </p>
            </div>

            {/* Global Search Bar */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="relative bg-card rounded-2xl border border-border shadow-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all p-2">
                <div className="flex items-center gap-3">
                  <Search className="h-5 w-5 text-muted-foreground ml-3 shrink-0" />
                  <Input
                    placeholder="Search topics, courses, or guides (e.g., #Docker, #OAuth, #Go)..."
                    className="border-0 focus-visible:ring-0 text-base h-11 bg-transparent flex-1 placeholder:text-muted-foreground/60"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <Button className="rounded-xl px-6 h-11 shrink-0 font-bold text-sm shadow-xs">
                    Search
                  </Button>
                </div>
              </div>
            </form>

            {/* Trending tags */}
            {trendingTags.length > 0 && (
              <div className="flex flex-wrap justify-center items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Trending Tags:</span>
                {trendingTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}`)}
                    className="px-3 py-1 rounded-full border border-border/80 bg-card text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all font-medium cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* Quick Action Buttons for Guest Users */}
            {!isAuthenticated && (
              <div className="pt-2 flex items-center justify-center gap-4 flex-wrap">
                <Button size="lg" asChild className="rounded-xl px-8 h-12 font-bold text-sm shadow-sm gap-2">
                  <Link to="/explore/courses">
                    Explore Courses <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="rounded-xl px-8 h-12 font-bold text-sm">
                  <Link to="/explore/paths">
                    View Learning Paths
                  </Link>
                </Button>
              </div>
            )}

          </div>
        </section>

        {/* ── 4-Step Value Feature Grid ("How Simple It Is to Learn") ──────── */}
        <section className="py-14 px-6 bg-background border-b border-border">
          <div className="max-w-7xl mx-auto space-y-10">
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary uppercase tracking-wider">
                Why Engineers Choose GeekGully
              </Badge>
              <h2 className="text-3xl font-extrabold text-foreground tracking-tight">
                Designed to Make Learning Effortless
              </h2>
              <p className="text-sm text-muted-foreground">
                No fluff. Structured knowledge tailored for software, cloud, and security pros.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-2xl border border-border/80 bg-card/60 hover:border-cyan-500/40 transition-all space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-extrabold text-lg">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-foreground">1. Pick Your Domain</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Focus on Software Engineering, Cloud Architecture, Cybersecurity, Data, or AI/LLMs.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/80 bg-card/60 hover:border-amber-500/40 transition-all space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-extrabold text-lg">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-foreground">2. Step-by-Step Tracks</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Bite-sized modules, interactive notes, and clear diagrams with zero ambiguity.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/80 bg-card/60 hover:border-indigo-500/40 transition-all space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-extrabold text-lg">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-foreground">3. Career &amp; Role Prep</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Targeted interview preparation paths for DevOps, Fullstack, and Security engineers.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/80 bg-card/60 hover:border-emerald-500/40 transition-all space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-extrabold text-lg">
                  <Award className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-foreground">4. Track &amp; Retain</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Save personal highlights, track progress meters, and review key takeaways anytime.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Explore by Domain ────────────────────────────────────────────── */}
        {domains && domains.length > 0 && (
          <Section title="Explore Tech Domains" subtitle="Discover structured content across core engineering disciplines" tinted>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {domains.map(domain => <DomainCard key={domain.id} domain={domain} />)}
            </div>
          </Section>
        )}

        {/* ── Continue Learning (authenticated only) ──────────────────────── */}
        {isAuthenticated && (
          <div className="pt-6">
            <UserLearningSection />
          </div>
        )}

        {/* ── Recommended for You (authenticated only) ─────────────────────── */}
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

        {/* ── Popular Topics ───────────────────────────────────────────────── */}
        {popularTopics.length > 0 && (
          <Section title="Popular Technology Topics" subtitle="Trending technical topics and skill tags">
            <div className="flex flex-wrap gap-2.5">
              {popularTopics.map(topic => (
                <TopicChip key={topic.id} name={topic.name} slug={topic.slug} />
              ))}
            </div>
          </Section>
        )}

        {/* ── New & Updated Articles ───────────────────────────────────────── */}
        {(latestItems.length > 0 || loadingLatest) && (
          <Section title="New &amp; Featured Articles" subtitle="Fresh production guides and deep reads" tinted viewAllHref="/explore/articles">
            {loadingLatest ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {latestItems.map(item => {
                  const isArticle = item.type === 'ARTICLE';
                  const linkPath  = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);
                  const readMin   = Math.max(1, (item.blockCount ?? 0) * 2 || 5);
                  return (
                    <Link key={item.id} to={linkPath} className="group">
                      <Card className="h-full rounded-2xl border-border/80 hover:border-primary/40 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {item.categoryName || 'Article'}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-primary/70" /> {readMin} min read
                            </span>
                          </div>
                          <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {item.title || 'Untitled Article'}
                          </h3>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs font-semibold text-primary">
                          <span>Read Article</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* ── Learning Paths ────────────────────────────────────────────────── */}
        {flags.learning_paths && learningPaths.length > 0 && (
          <Section title="Career Learning Paths" subtitle="Structured multi-course roadmaps designed for role advancement" viewAllHref="/explore/paths">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {learningPaths.slice(0, 6).map(path => (
                <Link key={path.id} to={`/learn/${path.id}`}>
                  <Card className="group cursor-pointer hover:border-primary/40 hover:shadow-md transition-all h-full border-border/80 rounded-2xl">
                    <CardContent className="p-5 flex gap-4 items-start">
                      <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {path.title}
                        </h4>
                        {path.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{path.description}</p>
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

        {/* ── Guest Bottom CTA Banner ───────────────────────────────────────── */}
        {!isAuthenticated && (
          <section className="py-16 px-6 bg-gradient-to-r from-primary/10 via-card to-cyan-500/10 border-t border-border text-center">
            <div className="max-w-3xl mx-auto space-y-6">
              <Badge variant="outline" className="text-xs font-bold border-primary/30 text-primary uppercase tracking-wider">
                Start Learning Today
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                Ready to Upgrade Your Engineering Knowledge?
              </h2>
              <p className="text-muted-foreground text-base max-w-xl mx-auto leading-relaxed">
                Join thousands of developers mastering cloud, software engineering, and cybersecurity on GeekGully.
              </p>
              <div className="flex justify-center gap-4 flex-wrap pt-2">
                <Button size="lg" asChild className="rounded-xl px-8 h-12 font-bold text-sm shadow-sm gap-2">
                  <Link to="/explore/articles">
                    Start Browsing Free <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        )}

      </div>
    </PublicLayout>
  );
};

export default PublicHome;

