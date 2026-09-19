import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, ChevronRight, GraduationCap, CheckCircle2, Circle, PlayCircle, Star, Bookmark, Check, Shield, ArrowLeft,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicLearningPathById } from '@/api/hooks/usePublicCms';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { EnrollmentDto } from '@/api/types';
import { buildCourseUrl } from '@/lib/slug';
import { cn } from '@/lib/utils';

import { CURATED_LEARNING_PATHS } from '@/data/learningPathData';

type CourseStatus = 'completed' | 'current' | 'upcoming';

type CourseStatus = 'completed' | 'current' | 'upcoming';

const LearningPathPage = () => {
  const { path: pathId } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Real live backend API hooks with fallback to curated data
  const { data: apiData, isLoading } = usePublicLearningPathById(pathId ?? '');
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);

  const [activeTab, setActiveTab] = useState<'overview' | 'curriculum' | 'related'>('overview');
  const [isBookmarked, setIsBookmarked] = useState(false);

  const enrollmentMap = useMemo(() => {
    const m = new Map<number, EnrollmentDto>();
    enrollments.forEach((e: EnrollmentDto) => {
      if (e.course?.id) m.set(e.course.id, e);
    });
    return m;
  }, [enrollments]);

  // Fallback data resolution
  const data = useMemo(() => {
    if (apiData && apiData.title) return apiData;
    const q = pathId?.toLowerCase() ?? '';
    const curated = CURATED_LEARNING_PATHS.find(
      p => p.id.toString() === pathId || p.slug === q || q.includes(p.slug) || p.slug.includes(q)
    ) || CURATED_LEARNING_PATHS[0];

    return {
      id: curated.id,
      kind: curated.kind,
      title: curated.title,
      description: curated.description,
      estimatedHours: curated.estimatedHours,
      rating: curated.rating,
      ratingCount: curated.ratingCount,
      level: curated.level,
      skillsGained: curated.skillsGained,
      courses: curated.modules.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        type: 'COURSE' as const,
        categoryId: 1,
        createdBy: 1,
        status: 'PUBLISHED' as const,
        blockCount: m.lessonCount,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        publishedAt: new Date().toISOString(),
        bodyLocation: null, bodyName: null, bodyType: null, bodySize: null,
        contentLocation: null, contentName: null, contentType: null, contentSize: null,
        thumbnailLocation: null, thumbnailName: null, thumbnailType: null, thumbnailSize: null,
        attachments: null,
      })),
    };
  }, [apiData, pathId]);

  if (isLoading && !data) {
    return (
      <PublicLayout>
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-6 animate-pulse">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-6 w-1/2" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  const courses = data.courses ?? [];
  const hasProgress = courses.some(course => {
    const enrollment = enrollmentMap.get(course.id);
    return enrollment && (enrollment.status === 'completed' || enrollment.progress > 0);
  });

  const getCourseStatus = (courseId: number): CourseStatus => {
    const enrollment = enrollmentMap.get(courseId);
    if (!enrollment) return 'upcoming';
    if (enrollment.status === 'completed') return 'completed';
    if (enrollment.status === 'active' && enrollment.progress > 0) return 'current';
    return 'upcoming';
  };

  const handleStartPath = () => {
    if (courses.length > 0) {
      const firstCourse = courses[0];
      navigate(`${buildCourseUrl(firstCourse)}?learn=true`);
    }
  };

  // Dynamic Skills Gained derivation
  const skillsList = useMemo(() => {
    if (data.skillsGained && data.skillsGained.length > 0) {
      return data.skillsGained;
    }
    if (courses.length > 0) {
      return courses.map(c => `Master ${c.title}`);
    }
    return [
      'Architect production-grade scalable web software',
      'Design RESTful & gRPC backend APIs',
      'Implement enterprise security, OAuth 2.0 & identity controls',
      'Deploy containerized services to Cloud Run & Kubernetes',
    ];
  }, [data.skillsGained, courses]);

  // Dynamic Related Paths
  const relatedPaths = useMemo(() => {
    return CURATED_LEARNING_PATHS.filter(
      p => p.id.toString() !== String(data.id) && p.slug !== pathId
    );
  }, [data.id, pathId]);

  const estimatedHours = data.estimatedHours || (courses.length ? courses.length * 4 : 24);
  const rating = data.rating || 4.9;
  const ratingCount = data.ratingCount || 180;
  const levelText = data.level || 'Intermediate';

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/explore/paths" className="hover:text-primary transition-colors">Learning Paths</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium truncate max-w-[240px]">{data.title}</span>
        </nav>

        {/* Hero Header Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <GraduationCap className="w-3.5 h-3.5 mr-1" />
                {data.kind === 'INTERVIEW_PREP' ? 'Interview Prep Track' : 'Structured Learning Path'}
              </Badge>
              <Badge variant="outline" className="text-xs">{levelText}</Badge>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
              {data.title}
            </h1>

            {data.description && (
              <p className="text-base text-muted-foreground leading-relaxed">
                {data.description}
              </p>
            )}

            {/* Path Stats */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground pt-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">{courses.length}</span> modules
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">{estimatedHours}</span> hours estimated
              </div>
              <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                <Star className="w-4 h-4 fill-amber-500" />
                <span>{rating}</span>
                <span className="text-muted-foreground font-normal text-xs">({ratingCount} ratings)</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3 pt-3">
              <Button size="lg" onClick={handleStartPath} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 px-6 shadow-md">
                <PlayCircle className="w-5 h-5" />
                {hasProgress ? 'Continue Learning Path' : 'Start Learning Path'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setIsBookmarked(prev => !prev)}
                className={cn('rounded-xl border-border', isBookmarked && 'text-emerald-600 border-emerald-500 bg-emerald-500/10')}
              >
                <Bookmark className={cn('w-4 h-4', isBookmarked && 'fill-emerald-600')} />
              </Button>
            </div>
          </div>

          {/* Right Card: Dynamic Skills You'll Gain */}
          <Card className="rounded-2xl border border-border shadow-sm bg-card p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Skills You&apos;ll Gain
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {skillsList.map((skill, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Sub-tabs bar */}
        <div className="border-b border-border">
          <div className="flex gap-8">
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'curriculum', label: 'Curriculum' },
                { id: 'related', label: 'Related Paths' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'pb-3 text-sm font-semibold border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Curriculum Scope</div>
                    <div className="text-base font-bold">{courses.length} Structured Modules</div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Time Commitment</div>
                    <div className="text-base font-bold">~{estimatedHours} Total Hours</div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Difficulty Level</div>
                    <div className="text-base font-bold">{levelText}</div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-foreground">Path Overview & Learning Goals</h2>
              <p className="text-muted-foreground leading-relaxed">
                {data.description} This learning path is structured to guide software professionals from fundamental principles to production engineering mastery.
              </p>
            </div>

            {/* Path Key Highlights */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-foreground">Key Outcomes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {skillsList.map((skill, index) => (
                  <div key={index} className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-sm font-medium text-foreground">{skill}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border">
              <p className="text-sm text-muted-foreground">Ready to start? Begin with Module 01 in the curriculum.</p>
              <Button onClick={() => setActiveTab('curriculum')} variant="outline" className="rounded-xl gap-2">
                View Curriculum <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'curriculum' && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Path Curriculum ({courses.length} Modules)</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Step-by-step module breakdown designed by industry authors.</p>
              </div>
              <Badge variant="outline">{estimatedHours} Total Hours</Badge>
            </div>

            {courses.length > 0 ? (
              <div className="space-y-3">
                {courses.map((course, index) => {
                  const status = getCourseStatus(course.id);
                  return (
                    <Link key={course.id} to={buildCourseUrl(course)}>
                      <Card className="hover:shadow-md hover:border-emerald-500/40 transition-all cursor-pointer group rounded-xl border border-border">
                        <CardContent className="p-5 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-4 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                              {status === 'completed' && <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                              {status === 'current' && <PlayCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                              {status === 'upcoming' && <Circle className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Module {String(index + 1).padStart(2, '0')}
                              </span>
                              <h3 className="text-base font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                                {course.title}
                              </h3>
                              {course.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                  {course.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <h3 className="text-base font-bold text-foreground">Curriculum updating</h3>
                <p className="text-sm text-muted-foreground">Courses are being added to this path. Check back soon!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'related' && (
          <div className="space-y-6 pt-2">
            <div>
              <h2 className="text-xl font-bold text-foreground">Related Learning Paths</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Explore recommended paths to complement your skills.</p>
            </div>

            {relatedPaths.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPaths.map(rp => (
                  <Card key={rp.id} className="p-6 rounded-2xl border border-border hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {rp.kind === 'INTERVIEW_PREP' ? 'Interview Prep' : 'Structured Path'}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-semibold">{rp.level}</span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground line-clamp-1">{rp.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{rp.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {rp.modules.length} Modules
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {rp.estimatedHours} Hours
                        </span>
                        <span className="flex items-center gap-1 text-amber-500 font-semibold">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          {rp.rating}
                        </span>
                      </div>
                    </div>

                    <Link to={`/learn/${rp.slug}`}>
                      <Button variant="outline" className="w-full rounded-xl gap-2 hover:bg-emerald-500/10 hover:text-emerald-600">
                        View Path <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <h3 className="text-base font-bold text-foreground">No related paths found</h3>
                <p className="text-sm text-muted-foreground">Check back as new learning paths are added.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </PublicLayout>
  );
};

export default LearningPathPage;
