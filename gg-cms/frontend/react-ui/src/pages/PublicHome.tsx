import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecommendedContent } from '@/components/personalization/RecommendedContent';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/api/hooks/useProfile';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import {
  Search, BookOpen, Zap, ChevronRight, Clock, ArrowRight, Sparkles,
  FileText, Play, GraduationCap,
} from 'lucide-react';
import { UserLearningSection } from '@/components/home/UserLearningSection';
import { PublicArticleCard } from '@/components/public/PublicArticleCard';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { EnrollmentDto } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsList, usePublicLearningPaths } from '@/api/hooks/usePublicCms';
import { useTags } from '@/api/hooks/useTags';
import { Skeleton } from '@/components/ui/skeleton';
import { CmsResponseDto } from '@/api/types';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';

// ─── Compact content card ──────────────────────────────────────────────────────

function SmallContentCard({
  item,
  enrollment,
}: {
  item: CmsResponseDto;
  enrollment?: EnrollmentDto | null;
}) {
  const navigate = useNavigate();
  const isArticle = item.type === 'ARTICLE';
  const linkPath  = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);
  const Icon      = isArticle ? FileText : Zap;
  const iconBg    = isArticle ? 'text-violet-500 bg-violet-500/10' : 'text-amber-500 bg-amber-500/10';
  const isEnrolled = !!enrollment;

  return (
    <Link to={linkPath}>
      <Card className="group h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                {item.title || 'Untitled'}
              </h4>
              {item.categoryName && (
                <p className="text-xs text-muted-foreground mt-1">{item.categoryName}</p>
              )}
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {new Date(item.publishedAt ?? item.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            {isArticle ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
            ) : (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(isEnrolled ? `${buildCourseUrl(item)}?learn=true` : buildCourseUrl(item)); }}
                title={isEnrolled ? 'Resume' : 'Enroll'}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 active:scale-95 ${
                  isEnrolled ? 'bg-success text-white' : 'bg-success/15 text-success border border-success/30'
                }`}
              >
                {isEnrolled ? <Play size={11} fill="white" className="ml-0.5" /> : <GraduationCap size={13} />}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

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

// ─── Skeleton grid ─────────────────────────────────────────────────────────────

function SkeletonGrid({ cols = 4 }: { cols?: number }) {
  return (
    <div className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {[...Array(cols)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

const PublicHome = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate   = useNavigate();
  const flags      = useFeatureFlags();
  const { isAuthenticated } = useAuth();
  const { data: profile }   = useProfile();

  const { data: tagsData }        = useTags();
  const { data: apiLearningPaths } = usePublicLearningPaths();

  const popularTags    = (tagsData ?? []).slice(0, 8).map(t => t.name);
  const learningPaths  = apiLearningPaths ?? [];

  const { data: articlesData, isLoading: loadingArticles } = usePublicCmsList({ type: 'ARTICLE', page: 0, size: 8 });
  const { data: coursesData,  isLoading: loadingCourses  } = usePublicCmsList({ type: 'COURSE',  page: 0, size: 8 });

  const articles = articlesData?.items ?? [];
  const courses  = coursesData?.items  ?? [];

  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);
  const enrollmentMap = useMemo(() => {
    const m = new Map<number, EnrollmentDto>();
    (enrollments as EnrollmentDto[]).forEach(e => { if (e.course?.id) m.set(e.course.id, e); });
    return m;
  }, [enrollments]);

  const featuredItems = [...courses, ...articles].slice(0, 8);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <PublicLayout>
      <div>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative bg-gradient-to-b from-muted/60 via-muted/30 to-background px-6 py-14 lg:py-20 text-center overflow-hidden">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-80 h-80 bg-muted rounded-full blur-3xl opacity-60" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-muted rounded-full blur-3xl opacity-40" />
          </div>

          <div className="max-w-3xl mx-auto space-y-7">


            {/* Headline */}
            <div className="space-y-3">
              <h1 className="text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.1] tracking-tight">
                Master new skills
                <br />
                <span className="text-primary">3× faster</span> with expert-led content
              </h1>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
                Structured courses, in-depth articles and hands-on projects —
                designed to make learning engaging, effective and fun.
              </p>
            </div>

            {/* Expanded search bar */}
            <form onSubmit={handleSearch}>
              <div className="relative bg-card rounded-2xl shadow-lg border-2 border-border focus-within:border-primary focus-within:shadow-primary/10 focus-within:shadow-xl transition-all duration-200 p-2">
                <div className="flex items-center gap-3">
                  <Search className="h-6 w-6 text-muted-foreground ml-2 shrink-0" />
                  <Input
                    placeholder="What do you want to learn today? e.g. Go, System Design, React…"
                    className="border-0 focus-visible:ring-0 text-base lg:text-lg h-12 bg-transparent flex-1 placeholder:text-muted-foreground/60"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <Button size="lg" className="rounded-xl px-8 h-11 shrink-0">
                    Search
                  </Button>
                </div>
              </div>
            </form>

            {/* Trending topics */}
            {popularTags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Trending topics
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {popularTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}`)}
                      className="text-sm px-4 py-1.5 rounded-full border border-border bg-background/80 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-150 shadow-sm"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick browse links */}
            <div className="flex flex-wrap justify-center gap-4 pt-1">
              <Link to="/explore/courses"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                <BookOpen className="h-4 w-4" /> Browse Courses <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/explore/articles"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                <FileText className="h-4 w-4" /> Explore Articles <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {flags.learning_paths && (
                <Link to="/explore/paths"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                  <GraduationCap className="h-4 w-4" /> Learning Paths <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* ── Personalised recommendations ─────────────────────────────────── */}
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

        {/* ── User learning dashboard ───────────────────────────────────────── */}
        <UserLearningSection />

        {/* ── Featured ─────────────────────────────────────────────────────── */}
        {(featuredItems.length > 0 || loadingArticles || loadingCourses) && (
          <Section title="On every developer's radar" subtitle="Top picks across courses and articles">
            {loadingArticles && loadingCourses ? <SkeletonGrid /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {featuredItems.map(item =>
                  item.type === 'ARTICLE'
                    ? <PublicArticleCard key={`f-${item.id}`} article={item} />
                    : <SmallContentCard key={`f-${item.id}`} item={item} enrollment={enrollmentMap.get(item.id) ?? null} />
                )}
              </div>
            )}
          </Section>
        )}

        {/* ── Courses ──────────────────────────────────────────────────────── */}
        {(courses.length > 0 || loadingCourses) && (
          <Section title="Courses" subtitle="Structured learning from beginner to advanced"
            viewAllHref="/explore/courses" tinted>
            {loadingCourses ? <SkeletonGrid /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {courses.slice(0, 8).map(c => (
                  <SmallContentCard key={c.id} item={c} enrollment={enrollmentMap.get(c.id) ?? null} />
                ))}
              </div>
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
                  <Card className="group cursor-pointer hover:shadow-md hover:border-primary/30 transition-all h-full border-border/50">
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

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section
          className="px-6 py-14 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0a0b14 0%, #1a1040 50%, #0d1a2e 100%)' }}
        >
          {/* Soft glows */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl"
              style={{ background: 'rgba(124,58,237,0.25)' }} />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 rounded-full blur-3xl"
              style={{ background: 'rgba(37,99,235,0.2)' }} />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full blur-3xl"
              style={{ background: 'rgba(124,58,237,0.15)' }} />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto">
            <h3 className="text-3xl lg:text-4xl font-bold mb-4 text-white">
              Ready to accelerate your learning?
            </h3>
            <p className="mb-8 text-lg" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Join thousands of developers mastering new skills and advancing their careers.
            </p>
            <Button
              size="lg"
              onClick={() => { window.location.href = '/auth'; }}
              className="shadow-lg px-8 font-semibold text-white border-none hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              Get Started — It&apos;s Free
            </Button>
          </div>
        </section>

      </div>
    </PublicLayout>
  );
};

export default PublicHome;
