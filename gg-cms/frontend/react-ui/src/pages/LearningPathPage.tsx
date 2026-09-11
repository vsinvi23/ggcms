import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, GraduationCap, CheckCircle2, Circle, PlayCircle } from 'lucide-react';
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

type CourseStatus = 'completed' | 'current' | 'upcoming';

const LearningPathPage = () => {
  const { path: pathId } = useParams<{ path: string }>();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError } = usePublicLearningPathById(pathId ?? '');
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);

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
        <div className="space-y-6 animate-pulse">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !data) {
    return (
      <PublicLayout>
        <div className="text-center py-16">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Learning path not found</h1>
          <p className="text-muted-foreground mb-6">This learning path may have been removed or doesn't exist.</p>
          <Link to="/"><Button>Go Home</Button></Link>
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

  return (
    <PublicLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="p-5 rounded-xl bg-primary/10">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/20 shrink-0">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <div>
              <Badge variant="secondary" className="mb-1">Learning Path</Badge>
              <h1 className="text-2xl font-bold">{data.title}</h1>
            </div>
          </div>
        </div>

        {data.description && (
          <p className="text-muted-foreground max-w-2xl">{data.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-6">
          {courses.length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="h-5 w-5" />
              <span>{courses.length} Course{courses.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <Badge variant="outline">{data.kind === 'INTERVIEW_PREP' ? 'Interview Prep' : 'Learning Plan'}</Badge>
        </div>

        {courses.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Path Curriculum</h2>
            {courses.map((course, index) => {
              const status = getCourseStatus(course.id);
              return (
              <Link key={course.id} to={buildCourseUrl(course)}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {status === 'completed' && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        {status === 'current' && <PlayCircle className="h-5 w-5 text-primary" />}
                        {status === 'upcoming' && <Circle className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                        <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
                          {course.title}
                        </h3>
                        {course.description && (
                          <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{course.description}</p>
                        )}
                        {course.publishedAt && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(course.publishedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-xl">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No courses added to this path yet.</p>
          </div>
        )}

        <div className="pt-4">
          <Button size="lg">{hasProgress ? 'Continue Path' : 'Start Learning Path'}</Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default LearningPathPage;
