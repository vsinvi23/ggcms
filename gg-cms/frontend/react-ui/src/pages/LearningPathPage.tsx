import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import {
  BookOpen, Clock, ChevronRight, GraduationCap, CheckCircle2, Circle, PlayCircle, Bookmark, Check, Shield,
  ChevronDown, FileText, Play, HelpCircle, Layers, ArrowRight, History, AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { PublicQuickEditBar } from '@/components/editor/PublicQuickEditBar';
import { usePublicLearningPathById, usePublicLearningPaths } from '@/api/hooks/usePublicCms';
import { sectionKeys } from '@/api/hooks/useSections';
import { sectionService } from '@/api/services/sectionService';
import { useMyEnrollments, useEnroll } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { EnrollmentDto, SectionDto } from '@/api/types';
import { buildCourseUrl } from '@/lib/slug';
import { cn } from '@/lib/utils';
import { CURATED_LEARNING_PATHS } from '@/data/learningPathData';
import {
  getCourseProgressState,
  getPathResumeState,
  getRecentPathSlugs,
  getSavedCourseLessonId,
  recordRecentPath,
  savePathResumeState,
} from '@/lib/contentStateStore';

type CourseStatus = 'completed' | 'current' | 'upcoming';

interface PathCourse {
  id: number;
  title: string;
  slug: string;
  description: string;
  categoryName?: string;
}

const lessonIcon = (type?: string) => (type === 'video' ? Play : type === 'quiz' ? HelpCircle : FileText);

interface CourseModuleCardProps {
  course: PathCourse;
  index: number;
  status: CourseStatus;
  progress: number;
  sections: SectionDto[];
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  launchUrl: (course: PathCourse, lessonId?: number) => string;
}

const CourseModuleCard = ({ course, index, status, progress, sections, isLoading, isExpanded, onToggle, launchUrl }: CourseModuleCardProps) => {
  const lessons = useMemo(() => sections.flatMap(s => s.lessons ?? []), [sections]);
  const minutes = lessons.reduce((acc, l) => acc + (l.duration || 0), 0);

  return (
    <Card className={cn('rounded-2xl border border-border overflow-hidden bg-card transition-all', isExpanded ? 'border-primary/40 shadow-sm' : 'hover:border-primary/30')}>
      <div className="p-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="flex items-start gap-3 min-w-0 flex-1 text-left">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {status === 'completed' && <CheckCircle2 className="h-5 w-5" />}
            {status === 'current' && <PlayCircle className="h-5 w-5" />}
            {status === 'upcoming' && <Circle className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              Module {String(index + 1).padStart(2, '0')}
              {progress > 0 && <span className="text-muted-foreground normal-case font-medium">&bull; {progress}% done</span>}
            </div>
            <h3 className="text-base font-bold text-foreground line-clamp-1">{course.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? 'Loading lessons…' : `${sections.length} sections • ${lessons.length} lessons${minutes ? ` • ${minutes} min` : ''}`}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={launchUrl(course)}>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg gap-1.5 text-xs font-bold h-8">
              <Play className="w-3.5 h-3.5" /> {status === 'upcoming' && progress === 0 ? 'Start' : 'Continue'}
            </Button>
          </Link>
          <button type="button" onClick={onToggle} aria-label="Toggle lessons" className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {course.description && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{course.description}</p>}
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : sections.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Lessons for this module are being prepared. You can still open the module.</p>
          ) : (
            <div className="space-y-2.5">
              {sections.map((sec, sIdx) => (
                <div key={sec.id} className="rounded-xl border border-border/70 bg-card overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 text-xs font-bold text-foreground flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{index + 1}.{sIdx + 1} {sec.title}</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {(sec.lessons ?? []).map(les => {
                      const Icon = lessonIcon(les.type);
                      return (
                        <Link key={les.id} to={launchUrl(course, les.id)} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-primary/5 group">
                          <span className="flex items-center gap-2 min-w-0 text-xs text-foreground group-hover:text-primary">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{les.title}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
                            {les.duration ? `${les.duration}m` : ''}
                            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-primary" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const LearningPathPage = () => {
  const { path: pathId } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({});
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // NOTE: learning-path quick-edit has no backing update API yet — this only
  // toggles the local "viewing pending" UI state, it doesn't persist anything.
  const handleSavePathRevision = async (_revData: { title: string; description: string; body: string; submitForReview: boolean }) => {
    setIsViewingPending(true);
  };

  const { data: apiPath, isLoading } = usePublicLearningPathById(pathId ?? '');
  const { data: allPaths } = usePublicLearningPaths();
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);
  const { mutate: enroll } = useEnroll();

  const enrollmentMap = useMemo(() => {
    const m = new Map<number, EnrollmentDto>();
    enrollments.forEach((e: EnrollmentDto) => {
      if (e.course?.id) m.set(e.course.id, e);
    });
    return m;
  }, [enrollments]);

  const pathSlug = apiPath?.slug || (apiPath ? String(apiPath.id) : '');

  const courses: PathCourse[] = useMemo(
    () =>
      (apiPath?.courses ?? [])
        .filter(c => !!c.slug && (!c.status || c.status === 'PUBLISHED'))
        .map(c => ({
          id: c.courseId,
          title: c.title || `Course #${c.courseId}`,
          slug: c.slug || '',
          description: c.description || '',
          categoryName: c.categoryName,
        })),
    [apiPath],
  );

  const sectionQueries = useQueries({
    queries: courses.map(c => ({
      queryKey: sectionKeys.byCourse(c.id),
      queryFn: () => sectionService.getSectionsByCourse(c.id),
      staleTime: 60_000,
    })),
  });

  useEffect(() => {
    if (pathSlug) recordRecentPath(pathSlug);
  }, [pathSlug]);

  const resume = pathSlug ? getPathResumeState(pathSlug) : null;

  const launchUrl = (course: PathCourse, lessonId?: number) => {
    const params = new URLSearchParams({ path: pathSlug, learn: 'true' });
    if (lessonId) params.set('lesson', String(lessonId));
    return `${buildCourseUrl(course)}?${params.toString()}`;
  };

  const courseProgress = (courseId: number): number => {
    const enrollment = enrollmentMap.get(courseId);
    if (enrollment) return enrollment.status === 'completed' ? 100 : Math.round((enrollment.progress ?? 0) * 100);
    return getCourseProgressState(courseId)?.progress ?? 0;
  };

  const courseStatus = (courseId: number): CourseStatus => {
    const p = courseProgress(courseId);
    if (p >= 100) return 'completed';
    return p > 0 ? 'current' : 'upcoming';
  };

  const hasProgress = courses.some(c => courseProgress(c.id) > 0);
  const isStarted = hasProgress || !!resume;

  const curated = useMemo(
    () => CURATED_LEARNING_PATHS.find(cp => cp.slug === pathSlug),
    [pathSlug],
  );

  const totalMinutes = sectionQueries.reduce(
    (acc, q) => acc + (q.data ?? []).flatMap(s => s.lessons ?? []).reduce((a, l) => a + (l.duration || 0), 0),
    0,
  );
  const totalLessons = sectionQueries.reduce((acc, q) => acc + (q.data ?? []).flatMap(s => s.lessons ?? []).length, 0);
  const hoursText = totalMinutes > 0 ? `${Math.max(1, Math.round(totalMinutes / 60))}h` : curated ? `~${curated.estimatedHours}h` : 'Self-paced';

  const skills = useMemo(() => {
    const list = curated?.skillsGained?.length ? curated.skillsGained : courses.map(c => c.title);
    return list.slice(0, 6);
  }, [curated, courses]);

  const relatedPaths = useMemo(() => (allPaths ?? []).filter(p => p.slug !== pathSlug && p.id !== apiPath?.id).slice(0, 3), [allPaths, apiPath]);
  const recentPaths = useMemo(() => {
    const bySlug = new Map((allPaths ?? []).map(p => [p.slug, p]));
    return getRecentPathSlugs()
      .filter(s => s !== pathSlug)
      .map(s => bySlug.get(s))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, 3);
  }, [allPaths, pathSlug]);

  const handleStartPath = () => {
    if (courses.length === 0) return;
    if (isAuthenticated) {
      courses.filter(c => !enrollmentMap.has(c.id)).forEach(c => enroll(c.id));
    }
    if (resume?.courseUrl) {
      navigate(resume.courseUrl);
      return;
    }
    const inProgress = courses.find(c => courseStatus(c.id) === 'current') ?? courses.find(c => courseStatus(c.id) === 'upcoming') ?? courses[0];
    const savedLesson = getSavedCourseLessonId(inProgress.id);
    navigate(launchUrl(inProgress, savedLesson ?? undefined));
  };

  // Ask to save state when leaving the path (any link outside the path→course flow)
  useEffect(() => {
    if (!isStarted) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('/course/') || href.startsWith('/article/') || href.startsWith('javascript:')) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingUrl(href);
      setShowExitDialog(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isStarted]);

  const confirmExit = () => {
    if (pathSlug && resume) savePathResumeState({ ...resume, savedAt: new Date().toISOString() });
    setShowExitDialog(false);
    if (pendingUrl) navigate(pendingUrl);
    setPendingUrl(null);
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-7xl mx-auto px-6 py-10 space-y-6 animate-pulse">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
            <Skeleton className="lg:col-span-4 h-64 w-full rounded-xl" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!apiPath) {
    return (
      <PublicLayout>
        <div className="max-w-6xl mx-auto px-6 py-16 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Learning Path Not Found</h1>
          <p className="text-muted-foreground max-w-md mx-auto">The learning path requested could not be found.</p>
          <Button onClick={() => navigate('/learning-paths')} className="mt-4">Explore All Learning Paths</Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <PublicQuickEditBar
        contentType="learning_path"
        contentId={apiPath.id}
        currentTitle={apiPath.title || ''}
        currentDescription={apiPath.description || ''}
        currentBody=""
        isViewingPending={isViewingPending}
        onToggleView={setIsViewingPending}
        onSaveRevision={handleSavePathRevision}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/learning-paths" className="hover:text-primary transition-colors">Learning Paths</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium truncate max-w-[240px]">{apiPath.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* MAIN: introduction + curriculum */}
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border border-border bg-card bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <GraduationCap className="w-3.5 h-3.5 mr-1" />
                  {apiPath.kind === 'INTERVIEW_PREP' ? 'Interview Prep Track' : apiPath.kind === 'SECURITY_TRACK' ? 'Security Track' : 'Structured Learning Path'}
                </Badge>
                {curated?.level && <Badge variant="outline" className="text-xs">{curated.level}</Badge>}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">{apiPath.title}</h1>
              {apiPath.description && <p className="text-base text-muted-foreground leading-relaxed">{apiPath.description}</p>}

              <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /><b className="text-foreground">{courses.length}</b> modules</span>
                {totalLessons > 0 && <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><b className="text-foreground">{totalLessons}</b> lessons</span>}
                <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><b className="text-foreground">{hoursText}</b></span>
              </div>

              {skills.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                  {skills.map(skill => (
                    <div key={skill} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span className="line-clamp-1">{skill}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button size="lg" onClick={handleStartPath} disabled={courses.length === 0} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2 px-6 shadow-md">
                  <PlayCircle className="w-5 h-5" />
                  {isStarted ? 'Continue Learning Path' : 'Start Learning Path'}
                </Button>
                <Button variant="outline" size="lg" onClick={() => setIsBookmarked(b => !b)} aria-label="Bookmark path"
                  className={cn('rounded-xl border-border', isBookmarked && 'text-primary border-primary bg-primary/10')}>
                  <Bookmark className={cn('w-4 h-4', isBookmarked && 'fill-primary')} />
                </Button>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" /> Curriculum
                </h2>
                <span className="text-xs text-muted-foreground">Open a module to see its lessons and start from any of them</span>
              </div>

              {courses.length > 0 ? (
                <div className="space-y-3">
                  {courses.map((course, index) => (
                    <CourseModuleCard
                      key={course.id}
                      course={course}
                      index={index}
                      status={courseStatus(course.id)}
                      progress={courseProgress(course.id)}
                      sections={sectionQueries[index]?.data ?? []}
                      isLoading={!!sectionQueries[index]?.isLoading}
                      isExpanded={expandedModules[course.id] ?? index === 0}
                      onToggle={() => setExpandedModules(prev => ({ ...prev, [course.id]: !(prev[course.id] ?? index === 0) }))}
                      launchUrl={launchUrl}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-14 border border-dashed rounded-2xl space-y-2">
                  <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <h3 className="text-base font-bold text-foreground">Curriculum updating</h3>
                  <p className="text-sm text-muted-foreground">Courses are being added to this path. Check back soon!</p>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT RAIL: compact related + recent */}
          <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
            <Card className="rounded-2xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Related Paths</h3>
              {relatedPaths.length > 0 ? (
                <ul className="space-y-1.5">
                  {relatedPaths.map(rp => (
                    <li key={rp.id}>
                      <Link to={`/learn/${rp.slug || rp.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-primary/5 group">
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-foreground group-hover:text-primary line-clamp-1">{rp.title}</span>
                          <span className="block text-[11px] text-muted-foreground">{rp.courseCount ?? rp.courses?.length ?? 0} modules</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No other paths yet.</p>
              )}
              <Link to="/learning-paths" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">All paths <ArrowRight className="w-3 h-3" /></Link>
            </Card>

            {recentPaths.length > 0 && (
              <Card className="rounded-2xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Recently Viewed</h3>
                <ul className="space-y-1.5">
                  {recentPaths.map(rp => (
                    <li key={rp.id}>
                      <Link to={`/learn/${rp.slug || rp.id}`} className="block rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-primary/5 hover:text-primary line-clamp-1">
                        {rp.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Leave this learning path?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Save your progress and current position so you can resume this path later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => setPendingUrl(null)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              Save &amp; Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PublicLayout>
  );
};

export default LearningPathPage;
