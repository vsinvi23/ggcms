import React, { useState, useMemo } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import {
  BookOpen,
  GraduationCap,
  Compass,
  Target,
  Briefcase,
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  Zap,
  HelpCircle,
  FileText,
  Shield,
  Server,
  Cloud,
  ChevronRight,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { usePublicCmsList, usePublicLearningPaths } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { buildCourseUrl, buildArticleUrl } from '@/lib/slug';

export function PublicHome() {
  const navigate = useNavigate();
  const [activeTimeFilter, setActiveTimeFilter] = useState<'5' | '15' | '30'>('5');

  // Live dynamic backend database API hooks
  const { data: publicCoursesData, isLoading: coursesLoading } = usePublicCmsList({ type: 'COURSE', size: 6 });
  const { data: publicArticlesData, isLoading: articlesLoading } = usePublicCmsList({ type: 'ARTICLE', size: 6 });
  const { data: backendCategories } = useCategories();
  const { data: learningPathsData } = usePublicLearningPaths();

  const courses = useMemo(() => publicCoursesData?.items || [], [publicCoursesData]);
  const articles = useMemo(() => publicArticlesData?.items || [], [publicArticlesData]);

  const categoriesList = useMemo(() => {
    if (backendCategories && backendCategories.length > 0) {
      return backendCategories.map(c => ({
        name: c.name,
        slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-'),
        count: c.contentCount || 5,
      }));
    }
    return [
      { name: 'Go', slug: 'go', count: 12 },
      { name: 'Java', slug: 'java', count: 8 },
      { name: 'Python', slug: 'python', count: 15 },
      { name: 'JavaScript', slug: 'javascript', count: 18 },
      { name: 'Kubernetes', slug: 'kubernetes', count: 10 },
      { name: 'Docker', slug: 'docker', count: 9 },
      { name: 'AWS', slug: 'aws', count: 11 },
      { name: 'PostgreSQL', slug: 'postgresql', count: 8 },
    ];
  }, [backendCategories]);

  // Dynamically filter content for Quick Learning section based on time
  const timeFilteredContent = useMemo(() => {
    const combined = [...articles, ...courses];
    if (activeTimeFilter === '5') {
      return combined.filter(item => (item.durationMinutes || 5) <= 7).slice(0, 3);
    } else if (activeTimeFilter === '15') {
      return combined.filter(item => (item.durationMinutes || 10) > 7 && (item.durationMinutes || 10) <= 20).slice(0, 3);
    } else {
      return combined.filter(item => (item.durationMinutes || 25) > 20).slice(0, 3);
    }
  }, [articles, courses, activeTimeFilter]);

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-20 space-y-16">
        
        {/* Section 1 — Hero */}
        <section className="relative pt-14 pb-16 px-4 sm:px-6 lg:px-8 border-b border-border bg-gradient-to-b from-primary/10 via-primary/5 to-background overflow-hidden">
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <Badge variant="outline" className="px-3.5 py-1 text-xs font-bold text-primary border-primary/30 rounded-full shadow-xs">
              GeekGully Technical Learning Platform
            </Badge>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-foreground">
              Learn. Explore. Practice. Grow.
            </h1>

            <p className="text-base sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-normal">
              Build practical technology skills through structured courses, career learning paths, articles, and active practice.
            </p>

            {/* "What do you want to do?" Intent Quick-Jump Buttons */}
            <div className="pt-6 space-y-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">
                What do you want to do today?
              </span>
              <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
                <Button
                  onClick={() => navigate('/technologies')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  Learn a Technology
                </Button>
                <Button
                  onClick={() => navigate('/learning-paths')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <GraduationCap className="w-4 h-4 text-purple-500" />
                  Follow a Learning Path
                </Button>
                <Button
                  onClick={() => navigate('/explore')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Compass className="w-4 h-4 text-amber-500" />
                  Explore Resources
                </Button>
                <Button
                  onClick={() => navigate('/practice')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Target className="w-4 h-4 text-emerald-500" />
                  Practice Knowledge
                </Button>
                <Button
                  onClick={() => navigate('/interview-prep')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Briefcase className="w-4 h-4 text-rose-500" />
                  Prepare for an Interview
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 — Featured Courses (Dynamic, Compact Display) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Featured Courses
              </h2>
              <p className="text-xs text-muted-foreground">Comprehensive, step-by-step technical courses.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/courses')} className="text-xs font-bold text-primary">
              Browse all courses →
            </Button>
          </div>

          {coursesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-44 bg-card/60 rounded-2xl border border-border" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="p-8 text-center bg-card border border-border rounded-2xl text-xs text-muted-foreground">
              No published courses found yet. Check back soon!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course, idx) => (
                <div
                  key={`${course.id}-${idx}`}
                  onClick={() => navigate(buildCourseUrl(course))}
                  className="bg-card border border-border hover:border-primary/50 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer group space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        {course.categoryName || 'Engineering'}
                      </Badge>
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {course.level || 'Intermediate'}
                      </span>
                    </div>

                    <h3 className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {course.title}
                    </h3>

                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {course.description || 'Master key fundamentals and practical patterns.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-muted-foreground font-medium">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      {course.sectionsCount || 4} modules &bull; {course.durationMinutes || 30}m
                    </span>
                    <span className="font-bold text-primary flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      Start <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3 — Latest Technical Articles (Dynamic) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Latest Guides & Articles
              </h2>
              <p className="text-xs text-muted-foreground">In-depth technical writeups and architecture deep-dives.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/explore')} className="text-xs font-bold text-primary">
              Explore all articles →
            </Button>
          </div>

          {articlesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-36 bg-card/60 rounded-2xl border border-border" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="p-8 text-center bg-card border border-border rounded-2xl text-xs text-muted-foreground">
              No published articles found yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((article, idx) => (
                <div
                  key={`${article.id}-${idx}`}
                  onClick={() => navigate(buildArticleUrl(article))}
                  className="bg-card border border-border hover:border-primary/50 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer group space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/30">
                        {article.categoryName || 'Guide'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.durationMinutes || 8} min read
                      </span>
                    </div>

                    <h3 className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {article.title}
                    </h3>

                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {article.description || 'Read the full guide and practical examples.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-end">
                    <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Read Guide <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 4 — Explore Technologies */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Explore Technologies</h2>
              <p className="text-xs text-muted-foreground">Discover structured learning hubs around modern tech stacks.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/technologies')} className="text-xs font-bold text-primary">
              View all technologies →
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {categoriesList.map(tech => (
              <button
                key={tech.slug}
                onClick={() => navigate(`/technology/${tech.slug}`)}
                className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary/50 text-left transition-all hover:shadow-sm group"
              >
                <h4 className="font-extrabold text-xs text-foreground group-hover:text-primary transition-colors truncate">{tech.name}</h4>
                <span className="text-[10px] text-muted-foreground font-medium">{tech.count} topics</span>
              </button>
            ))}
          </div>
        </section>

        {/* Section 5 — Learn by Goal Cards */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">What are you trying to achieve?</h2>
            <p className="text-xs text-muted-foreground">Choose a career goal and follow structured, end-to-end guidance.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md space-y-4">
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold">Become a Backend Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Learn programming, APIs, databases, distributed systems, and production engineering.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md space-y-4">
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Cloud className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold">Become a Cloud Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AWS/GCP/Azure, networking, containers, Kubernetes, and infrastructure.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md space-y-4">
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold">Become a Security Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identity, OAuth, OIDC, PKI, application security, and cloud security.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md space-y-4">
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold">Prepare for Interviews</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Coding, system design, backend, cloud, and security interview questions.
                </p>
              </div>
              <Button onClick={() => navigate('/interview-prep')} variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl">
                Start preparation →
              </Button>
            </div>
          </div>
        </section>

        {/* Section 6 — Quick Learning by Available Time (Dynamic) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                  <Clock className="w-6 h-6 text-primary" />
                  Quick Learning by Available Time
                </h2>
                <p className="text-xs text-muted-foreground">Select resources tailored precisely to your available time.</p>
              </div>

              {/* Time selector tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTimeFilter('5')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '5' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 5 mins?
                </button>
                <button
                  onClick={() => setActiveTimeFilter('15')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '15' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 15 mins?
                </button>
                <button
                  onClick={() => setActiveTimeFilter('30')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '30' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 30+ mins?
                </button>
              </div>
            </div>

            {/* Dynamic Content Items */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {timeFilteredContent.length > 0 ? (
                timeFilteredContent.map((item, idx) => (
                  <button
                    key={`${item.id}-${idx}`}
                    onClick={() => navigate(item.type === 'COURSE' ? buildCourseUrl(item) : buildArticleUrl(item))}
                    className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-xs transition-all space-y-1.5"
                  >
                    <span className="text-[10px] text-primary uppercase font-extrabold block">
                      {item.type === 'COURSE' ? '🚀 Course' : '📖 Article'} &bull; {item.durationMinutes || 10} min
                    </span>
                    <span className="line-clamp-1 block text-sm font-extrabold">{item.title}</span>
                  </button>
                ))
              ) : (
                <>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-xs transition-all">
                    ⚡ HTTP Status Codes Cheat Sheet (5 min)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-xs transition-all">
                    ⚡ Git & Docker Commands Cheat Sheet (5 min)
                  </button>
                  <button onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-xs transition-all">
                    ⚡ Quick Practice Assessment (5 min)
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Section 7 — Practice Preview */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Test yourself</h2>
              <p className="text-xs text-muted-foreground">Reinforce your knowledge through quick interactive practice quizzes.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/practice')} className="text-xs font-bold text-primary">
              Explore Practice →
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Quick Quiz</Badge>
              <h4 className="font-extrabold text-sm">OAuth & OIDC</h4>
              <p className="text-xs text-muted-foreground">4 questions · 10 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Fundamentals</Badge>
              <h4 className="font-extrabold text-sm">Backend Fundamentals</h4>
              <p className="text-xs text-muted-foreground">4 questions · 10 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Advanced</Badge>
              <h4 className="font-extrabold text-sm">System Design</h4>
              <p className="text-xs text-muted-foreground">4 questions · 10 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">DevOps</Badge>
              <h4 className="font-extrabold text-sm">Kubernetes Networking</h4>
              <p className="text-xs text-muted-foreground">4 questions · 10 min</p>
            </div>
          </div>
        </section>

      </div>
    </PublicLayout>
  );
}

export default PublicHome;
