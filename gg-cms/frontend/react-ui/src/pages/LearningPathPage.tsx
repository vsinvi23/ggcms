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

type CourseStatus = 'completed' | 'current' | 'upcoming';

const LearningPathPage = () => {
  const { path: pathId } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Real live backend API hooks (no mock data)
  const { data, isLoading, isError } = usePublicLearningPathById(pathId ?? '');
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

  if (isLoading) {
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

  if (isError || !data) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto text-center py-20 px-6">
          <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Learning path not found</h1>
          <p className="text-muted-foreground mb-6">This learning path may have been removed or doesn't exist.</p>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/explore/paths">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Learning Paths
            </Link>
          </Button>
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
              <Badge variant="outline" className="text-xs">Intermediate</Badge>
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
                <span className="font-semibold text-foreground">{courses.length * 2}</span> hours estimated
              </div>
              <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                <Star className="w-4 h-4 fill-amber-500" />
                <span>4.8</span>
                <span className="text-muted-foreground font-normal text-xs">(320 ratings)</span>
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

          {/* Right Card: Skills You'll Gain (Panel 5 Spec) */}
          <Card className="rounded-2xl border border-border shadow-sm bg-card p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Skills You&apos;ll Gain
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Build secure, high-performance APIs</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Implement OAuth 2.0 / OIDC authentication</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Deploy to production cloud (GCP)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Follow cloud security best practices</span>
              </li>
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

        {/* Curriculum List */}
        {courses.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Path Curriculum ({courses.length} Modules)</h2>
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
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <h3 className="text-base font-bold text-foreground">Curriculum updating</h3>
            <p className="text-sm text-muted-foreground">Courses are being added to this path. Check back soon!</p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default LearningPathPage;
