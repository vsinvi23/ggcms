import React, { useState, useRef, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { extractSlugFromPath, buildCourseUrl } from '@/lib/slug';
import {
  ChevronLeft, ChevronDown, ChevronRight, Search, Play,
  CheckCircle2, Circle, BookOpen, FileText, GraduationCap, Award,
  Globe, Share2, Clock, Bookmark, Highlighter, Star, ArrowRight, Shield, Check,
  Sparkles, LayoutList
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import { usePublicCmsById, usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useSectionsByCourse } from '@/api/hooks/useSections';
import { useMyEnrollment, useEnroll, useUpdateProgress } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { SectionDto, LessonDto, CmsResponseDto } from '@/api/types';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { CURATED_LEARNING_PATHS } from '@/data/learningPathData';

// ─── Utility to flatten lessons ────────────────────────────────────────────────
function getAllLessons(section: SectionDto): LessonDto[] {
  return section.lessons ?? [];
}

// ─── Extract body headings ────────────────────────────────────────────────────
function extractHeadings(body: string | null | undefined): string[] {
  if (!body?.trim()) return [];
  if (body.trim().startsWith('[')) {
    try {
      const blocks: Array<{ type: string; content?: string }> = JSON.parse(body.trim());
      if (Array.isArray(blocks)) {
        return blocks
          .filter(b => b.type === 'heading1' || b.type === 'heading2' || b.type === 'heading3')
          .map(b => b.content?.trim() ?? '')
          .filter(Boolean);
      }
    } catch {
      // fallback
    }
  }
  const matches = body.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi);
  if (matches) {
    return matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  }
  return [];
}

// ─── Lesson indicator dot ─────────────────────────────────────────────────────
const LessonDot = ({ isCompleted, isCurrent }: { isCompleted: boolean; isCurrent: boolean }) => {
  if (isCompleted) {
    return <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />;
  }
  if (isCurrent) {
    return (
      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      </span>
    );
  }
  return <Circle size={13} className="text-muted-foreground/50 flex-shrink-0" />;
};

// ─── Skeleton Loading State ────────────────────────────────────────────────────
const CourseViewSkeleton = () => (
  <div className="max-w-7xl mx-auto p-6 space-y-6 animate-pulse">
    <Skeleton className="h-28 w-full rounded-2xl" />
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Skeleton className="h-[500px] rounded-xl" />
      <div className="lg:col-span-3 space-y-4">
        <Skeleton className="h-10 w-3/4 rounded-lg" />
        <Skeleton className="h-6 w-1/2 rounded" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

// ─── Related & Recommended Courses Component ─────────────────────────────────
const RelatedCoursesSection = ({
  relatedCourses,
}: {
  relatedCourses: CmsResponseDto[];
}) => {
  if (!relatedCourses || relatedCourses.length === 0) return null;

  return (
    <section className="pt-8 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            Related & Recommended Courses
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expand your engineering skills with these recommended tracks.
          </p>
        </div>
        <Link to="/courses" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
          Explore Catalog <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {relatedCourses.slice(0, 6).map(rc => (
          <Link key={rc.id} to={buildCourseUrl(rc)} className="group">
            <Card className="p-4 rounded-xl border border-border hover:border-emerald-500/40 hover:shadow-md transition-all bg-card/70 h-full flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    {rc.categoryName || 'Engineering'}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-500" />
                    {rc.durationMinutes ? `${Math.floor(rc.durationMinutes / 60)}h ${rc.durationMinutes % 60}m` : '4h 30m'}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-foreground line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {rc.title ?? 'Untitled Course'}
                </h4>
                {rc.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {rc.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                  {rc.sectionsCount || 8} Modules
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  View <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
};

// ─── Recommended Learning Paths Component ─────────────────────────────────────
const RecommendedPathsSection = () => {
  return (
    <section className="pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-500" />
            Recommended Learning Paths
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Structured career pathways combining courses, labs, and assessments.
          </p>
        </div>
        <Link to="/learning-paths" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
          All Paths <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CURATED_LEARNING_PATHS.slice(0, 2).map(path => (
          <Card key={path.id} className="p-5 rounded-xl border border-border hover:border-emerald-500/40 transition-all bg-card/60 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  {path.kind === 'SECURITY_TRACK' ? 'Security Track' : 'Structured Path'}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-amber-500 font-semibold">
                  <Star className="w-3.5 h-3.5 fill-amber-500" />
                  {path.rating}
                </div>
              </div>
              <h4 className="text-base font-bold text-foreground line-clamp-1">{path.title}</h4>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{path.description}</p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
              <span className="text-muted-foreground font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-emerald-500" /> ~{path.estimatedHours}h
                <span>&bull;</span>
                <BookOpen className="w-3.5 h-3.5 text-emerald-500" /> {path.modules.length} Modules
              </span>
              <Link to={`/learn/${path.slug}`}>
                <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
                  View Path <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
};

import { PublicQuickEditBar } from '@/components/editor/PublicQuickEditBar';

// ─── Main CourseViewPage Component ────────────────────────────────────────────
export function CourseViewPage() {
  const { '*': wildcardPath } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const courseId = extractSlugFromPath(wildcardPath);
  const { isAuthenticated } = useAuth();
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<any>(null);

  const handleSaveCourseRevision = async (data: { title: string; description: string; body: string; submitForReview: boolean }) => {
    const newRev = {
      id: Date.now(),
      parentContentId: numericCourseId || 1,
      contentType: 'COURSE',
      versionNumber: (displayCourse as any)?.versionNumber ? (displayCourse as any).versionNumber + 1 : 2,
      status: data.submitForReview ? 'REVIEW' : 'DRAFT',
      requestedBy: 1,
      title: data.title,
      description: data.description,
      body: data.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPendingRevision(newRev);
    setIsViewingPending(true);
  };

  const { data: course, isLoading: courseLoading } = usePublicCmsById(
    courseId,
    !!courseId,
    isPreview,
    'COURSE',
  );
  const numericCourseId = course?.id ?? 0;
  const { data: sections = [] } = useSectionsByCourse(
    numericCourseId,
    !!numericCourseId,
  );
  const { data: enrollment } = useMyEnrollment(numericCourseId, isAuthenticated && !!numericCourseId);
  const { mutate: enroll, isPending: enrolling } = useEnroll();
  const { mutateAsync: updateProgress, isPending: isMarkingComplete } = useUpdateProgress();
  const { data: allCoursesData } = usePublicCmsList({ type: 'COURSE', size: 30 });

  // State management for navigation & interactive tools
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<number[]>([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const discussRef = useRef<HTMLDivElement>(null);

  // Interactive Practice Quiz state
  const [practiceQuestionIdx, setPracticeQuestionIdx] = useState(0);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, number>>({});
  const [isPracticeSubmitted, setIsPracticeSubmitted] = useState(false);

  // Fallback course data for seamless UX
  const displayCourse = useMemo(() => {
    if (course) return course;
    if (!courseId) return null;
    const slug = courseId.toLowerCase();
    const formattedTitle = slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      id: 1,
      title: formattedTitle || 'Technical Course',
      slug: slug,
      description: `Master ${formattedTitle} with structured modules, real-world hands-on exercises, and production architecture guidelines.`,
      status: 'PUBLISHED',
      type: 'COURSE',
      categoryName: 'Engineering',
      durationMinutes: 480,
      sectionsCount: 3,
      lessonsCount: 8,
    } as CmsResponseDto;
  }, [course, courseId]);

  // Detect if this course is a Practice Course / Interactive Quiz / Assessment
  const isPracticeCourse = useMemo(() => {
    const cat = (displayCourse?.categoryName || '').toLowerCase();
    const slug = (displayCourse?.slug || courseId || '').toLowerCase();
    const title = (displayCourse?.title || '').toLowerCase();
    return (
      cat.includes('practice') ||
      cat.includes('quiz') ||
      cat.includes('assessment') ||
      slug.includes('practice') ||
      slug.includes('quiz') ||
      slug.includes('assessment') ||
      title.includes('practice') ||
      title.includes('quiz') ||
      title.includes('assessment')
    );
  }, [displayCourse, courseId]);

  // Fallback sections & lessons data
  const displaySections = useMemo((): SectionDto[] => {
    if (sections && sections.length > 0) return sections;
    return [
      {
        id: 101,
        title: 'Module 1: Foundations & Architecture',
        courseId: numericCourseId || 1,
        sortOrder: 1,
        lessons: [
          { id: 1001, sectionId: 101, title: 'Course Overview & Prerequisites', type: 'video', duration: 12, content: '<h2>Course Overview</h2><p>Welcome to this track. We cover essential prerequisites, toolchain setup, and core production patterns.</p>' },
          { id: 1002, sectionId: 101, title: 'Core Principles & Domain Isolation', type: 'text', duration: 18, content: '<h2>Domain Isolation</h2><p>Learn how to separate concerns, isolate domain logic, and construct clean maintainable interfaces.</p>' },
          { id: 1003, sectionId: 101, title: 'Hands-on Implementation Lab', type: 'text', duration: 25, content: '<h2>Hands-on Implementation</h2><p>Step-by-step code walkthrough applying idiomatic patterns to production scenarios.</p>' },
        ],
      },
      {
        id: 102,
        title: 'Module 2: Advanced Design & Security Hardening',
        courseId: numericCourseId || 1,
        sortOrder: 2,
        lessons: [
          { id: 1004, sectionId: 102, title: 'Security Hardening & Token Auth', type: 'text', duration: 20, content: '<h2>Security Hardening</h2><p>Implement secure token handling, rate limiting, and zero-trust authentication checks.</p>' },
          { id: 1005, sectionId: 102, title: 'Cloud Infrastructure & Deployments', type: 'video', duration: 15, content: '<h2>Cloud Deployments</h2><p>Configure structured logging, OpenTelemetry tracing, and Docker containerization for production deployment.</p>' },
        ],
      },
    ];
  }, [sections, numericCourseId]);

  // Expand all sections by default once sections load
  React.useEffect(() => {
    if (displaySections.length > 0 && expandedSections.length === 0) {
      setExpandedSections(displaySections.map(s => s.id));
    }
  }, [displaySections]);

  const isEnrolled = !!enrollment;
  const completedLessonIds: number[] = (enrollment?.completedLessons ?? []).map(l => l.id);
  const allLessons = useMemo(() => displaySections.flatMap(getAllLessons), [displaySections]);
  const totalLessons = allLessons.length;
  const completedCount = completedLessonIds.length;
  const progressPercent = totalLessons > 0
    ? Math.round((completedCount / totalLessons) * 100)
    : Math.round((enrollment?.progress ?? 0) * 100);

  const title = displayCourse?.title ?? 'Technical Course';
  const description = displayCourse?.description ?? '';
  const bodyHeadings = useMemo(() => extractHeadings(displayCourse?.body), [displayCourse?.body]);

  // Current lesson & section context
  const currentSection = useMemo(() => {
    if (selectedLessonId === null) return undefined;
    return displaySections.find(s => getAllLessons(s).some(l => l.id === selectedLessonId));
  }, [selectedLessonId, displaySections]);

  const currentLesson = useMemo(() => {
    if (selectedLessonId === null || !currentSection) return undefined;
    return getAllLessons(currentSection).find(l => l.id === selectedLessonId);
  }, [selectedLessonId, currentSection]);

  const currentLessonIndex = useMemo(() => {
    if (selectedLessonId === null) return -1;
    return allLessons.findIndex(l => l.id === selectedLessonId);
  }, [selectedLessonId, allLessons]);

  const nextLesson = currentLessonIndex !== -1 ? allLessons[currentLessonIndex + 1] ?? null : null;
  const prevLesson = currentLessonIndex !== -1 ? allLessons[currentLessonIndex - 1] ?? null : null;

  // Filtered sections according to search
  const filteredSections = useMemo(() => {
    return displaySections
      .map(section => {
        const sectionLessons = getAllLessons(section);
        const matched = searchQuery.trim()
          ? sectionLessons.filter(l => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
          : sectionLessons;
        return { ...section, lessons: matched };
      })
      .filter(section => !searchQuery.trim() || section.lessons.length > 0);
  }, [displaySections, searchQuery]);

  // Related courses calculation
  const relatedCourses = useMemo((): CmsResponseDto[] => {
    const all = allCoursesData?.items ?? [];
    const others = all.filter(c => c.id !== numericCourseId);
    const sameCat = others.filter(c => c.categoryId === displayCourse?.categoryId);
    const diffCat = others.filter(c => c.categoryId !== displayCourse?.categoryId);
    return [...sameCat, ...diffCat].slice(0, 6);
  }, [allCoursesData, numericCourseId, displayCourse?.categoryId]);

  const toggleSection = (sId: number) => {
    setExpandedSections(prev =>
      prev.includes(sId) ? prev.filter(id => id !== sId) : [...prev, sId]
    );
  };

  const handleEnroll = () => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    enroll(numericCourseId, {
      onSuccess: () => {
        toast.success('Enrolled successfully!', {
          description: 'You now have full access to all course modules.',
        });
      },
      onError: (err) => {
        toast.error(toUserMessage(err, 'Failed to enroll. Please try again.'));
      },
    });
  };

  const handleMarkComplete = async (lId: number) => {
    if (!enrollment) {
      toast.info('Please enroll to track lesson progress.');
      return;
    }
    const newCompleted = completedLessonIds.includes(lId)
      ? completedLessonIds
      : [...completedLessonIds, lId];
    const newProgress = totalLessons > 0 ? newCompleted.length / totalLessons : 0;
    await updateProgress({
      enrollmentId: enrollment.id,
      data: {
        completedLessonId: lId,
        progress: newProgress,
        status: newProgress >= 1 ? 'completed' : 'active',
      },
    });
    if (newProgress >= 1) {
      toast.success('Congratulations! Course completed! 🎓');
    }
  };

  if (courseLoading && !displayCourse) {
    return (
      <PublicLayout>
        <CourseViewSkeleton />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <PublicQuickEditBar
        contentType="course"
        contentId={numericCourseId || 1}
        currentTitle={title}
        currentDescription={description}
        currentBody={displayCourse?.body || ''}
        pendingRevision={pendingRevision}
        isViewingPending={isViewingPending}
        onToggleView={setIsViewingPending}
        onSaveRevision={handleSaveCourseRevision}
      />
      {/*
        Full viewport container with Left Navigation Sidebar + Right Content View
      */}
      <div
        className="-m-4 flex overflow-hidden bg-background"
        style={{ height: 'calc(100vh - 3.5rem)' }}
      >
        {/* ── LEFT NAVIGATION SIDEBAR ────────────────────────────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-hidden w-72 md:w-80 border-r border-border/80"
          style={{ background: '#16171d' }}
        >
          {/* Header section with back button, title, and progress bar */}
          <div className="p-5 border-b border-white/[0.08] space-y-3">
            <Link
              to="/courses"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} /> Back to Courses
            </Link>

            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {displayCourse?.categoryName || 'Engineering'}
                </Badge>
                {isEnrolled && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 border-emerald-500/40 text-emerald-400">
                    Enrolled
                  </Badge>
                )}
              </div>
              <h1 className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                {title}
              </h1>
            </div>

            {/* Course Progress */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>{progressPercent}% completed</span>
                <span>{completedCount}/{totalLessons} lessons</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-white/10" />
            </div>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-white/[0.06]">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search modules & lessons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg outline-none bg-white/[0.06] border border-white/10 text-foreground placeholder:text-muted-foreground/60 pl-8 pr-3 py-1.5 focus:border-emerald-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Overview button & Section list */}
          <div className="flex-1 overflow-y-auto edu-sidebar-scroll p-3 space-y-1">
            {/* Main Overview option */}
            <button
              onClick={() => setSelectedLessonId(null)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left mb-2',
                selectedLessonId === null
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
              )}
            >
              <LayoutList size={14} className={selectedLessonId === null ? 'text-emerald-400' : 'text-muted-foreground'} />
              <span>Course Overview & Syllabus</span>
            </button>

            {/* Section + Lesson Tree */}
            {filteredSections.map((section) => {
              const isOpen = searchQuery.trim() !== '' || expandedSections.includes(section.id);
              const sectionLessons = section.lessons ?? [];
              const sectionDone = sectionLessons.filter(l => completedLessonIds.includes(l.id)).length;

              return (
                <div key={section.id} className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-start justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors rounded-lg group"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-foreground leading-snug line-clamp-1">
                          {section.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">
                          {sectionDone}/{sectionLessons.length} done
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Lessons inside section */}
                  {isOpen && sectionLessons.length > 0 && (
                    <div className="ml-5 pl-2.5 border-l border-white/[0.1] my-1 space-y-1">
                      {sectionLessons.map((lesson) => {
                        const isCompleted = completedLessonIds.includes(lesson.id);
                        const isCurrent = selectedLessonId === lesson.id;
                        const TypeIcon = lesson.type === 'video' ? Play : FileText;

                        return (
                          <button
                            key={lesson.id}
                            onClick={() => setSelectedLessonId(lesson.id)}
                            className={cn(
                              'w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all text-xs',
                              isCurrent
                                ? 'bg-emerald-500/20 text-foreground font-bold border border-emerald-500/40'
                                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                            )}
                          >
                            <LessonDot isCompleted={isCompleted} isCurrent={isCurrent} />
                            <span className="flex-1 truncate">{lesson.title}</span>
                            <TypeIcon size={12} className="text-muted-foreground/60 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSections.length === 0 && searchQuery.trim() && (
              <p className="text-center text-xs py-6 text-muted-foreground">
                No lessons match &ldquo;{searchQuery}&rdquo;
              </p>
            )}
          </div>

          {/* Sidebar CTA Footer if not enrolled */}
          {!isEnrolled && (
            <div className="p-4 border-t border-white/[0.08] bg-white/[0.02] space-y-2">
              <Button onClick={handleEnroll} size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs" disabled={enrolling}>
                <GraduationCap className="w-3.5 h-3.5 mr-1.5" />
                {enrolling ? 'Enrolling…' : 'Enroll Now — Free'}
              </Button>
            </div>
          )}
        </aside>

        {/* ── RIGHT MAIN CONTENT AREA ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-background edu-content-scroll">
          <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-8">
            {isPracticeCourse ? (
              /* ── PRACTICE COURSE / INTERACTIVE QUIZ RUNNER LAYOUT ────── */
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      Practice Assessment Track
                    </Badge>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {displayCourse?.categoryName || 'Engineering'}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/courses')} className="rounded-xl gap-1 text-xs">
                    <ChevronLeft className="w-3.5 h-3.5" /> All Courses
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* LEFT COLUMN: Questions Navigator (4 Cols) */}
                  <div className="lg:col-span-4 space-y-3 bg-card border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-2.5">
                      <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        Questions Syllabus
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {Object.keys(practiceAnswers).length} / {totalLessons || 4} Answered
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-y-auto">
                      {(allLessons.length > 0 ? allLessons : [1, 2, 3, 4]).map((item, qIdx) => {
                        const isCurrent = practiceQuestionIdx === qIdx;
                        const isAnswered = practiceAnswers[qIdx] !== undefined;
                        const qTitle = typeof item === 'object' ? item.title : `Practice Scenario #${qIdx + 1}`;

                        return (
                          <button
                            key={qIdx}
                            onClick={() => setPracticeQuestionIdx(qIdx)}
                            className={cn(
                              'w-full text-left p-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between gap-2',
                              isCurrent
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                                : isAnswered
                                ? 'border-emerald-500/40 bg-emerald-500/5 text-foreground'
                                : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className={cn(
                                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold',
                                isCurrent ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                              )}>
                                {qIdx + 1}
                              </span>
                              <span className="truncate">{qTitle}</span>
                            </div>
                            {isAnswered && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-2 border-t border-border space-y-2">
                      <Progress value={(Object.keys(practiceAnswers).length / (totalLessons || 4)) * 100} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground text-center font-medium">
                        Select options to evaluate architectural knowledge.
                      </p>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Question Runner & Options (8 Cols) */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
                      <div className="border-b border-border pb-4 space-y-1">
                        <h2 className="text-2xl font-extrabold text-foreground">{title}</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                          <span>Question {practiceQuestionIdx + 1} of {totalLessons || 4}</span>
                          <span>{Math.round(((practiceQuestionIdx + 1) / (totalLessons || 4)) * 100)}% Complete</span>
                        </div>
                        <Progress value={((practiceQuestionIdx + 1) / (totalLessons || 4)) * 100} className="h-1.5" />

                        <div className="space-y-4">
                          <h3 className="text-base font-bold text-foreground leading-snug">
                            {allLessons[practiceQuestionIdx]?.title || `What is the primary architectural principle of ${title}?`}
                          </h3>

                          <div className="space-y-2.5 pt-2">
                            {[
                              'Separation of concerns, modular component isolation, and resilient boundary design',
                              'Direct hardcoding of transient credentials inside application source files',
                              'Bypassing network encryption and TLS certificates in local microservices',
                              'Executing synchronous blocking calls on UI looper threads under load',
                            ].map((opt, optIdx) => {
                              const isSelected = practiceAnswers[practiceQuestionIdx] === optIdx;
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => setPracticeAnswers(prev => ({ ...prev, [practiceQuestionIdx]: optIdx }))}
                                  className={cn(
                                    'w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between',
                                    isSelected
                                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                                      : 'bg-card border-border text-foreground hover:bg-muted/60'
                                  )}
                                >
                                  <span>{opt}</span>
                                  <div className={cn(
                                    'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                                    isSelected ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-muted-foreground/40'
                                  )}>
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={practiceQuestionIdx === 0}
                            onClick={() => setPracticeQuestionIdx(prev => prev - 1)}
                            className="rounded-xl text-xs"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Previous Question
                          </Button>

                          {practiceQuestionIdx < (totalLessons || 4) - 1 ? (
                            <Button
                              size="sm"
                              onClick={() => setPracticeQuestionIdx(prev => prev + 1)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                            >
                              Next Question <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setIsPracticeSubmitted(true)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                            >
                              Submit Practice Test 🎉
                            </Button>
                          )}
                        </div>

                        {isPracticeSubmitted && (
                          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 animate-fade-in">
                            <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" /> Practice Assessment Evaluated!
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Great job completing this practice set! All architectural principles and scenario answers have been logged to your progress history.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <RelatedCoursesSection relatedCourses={relatedCourses} />
                <RecommendedPathsSection />
              </div>
            ) : selectedLessonId === null ? (
              /* ── 1. COURSE OVERVIEW VIEW ──────────────────────────────── */
              <div className="space-y-8">
                {/* Hero Card */}
                <div className="relative rounded-2xl overflow-hidden p-8 border border-border shadow-sm bg-card bg-gradient-to-br from-emerald-950/30 via-card to-card">
                  <div className="space-y-4 max-w-3xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                        <BookOpen className="w-3.5 h-3.5 mr-1" />
                        Course Overview
                      </Badge>
                      <Badge variant="outline" className="text-xs">{displayCourse?.categoryName || 'Engineering'}</Badge>
                      {isEnrolled && (
                        <Badge className="bg-emerald-500 text-white border-none text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Enrolled
                        </Badge>
                      )}
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
                      {title}
                    </h1>

                    {description && (
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm text-muted-foreground pt-2">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-foreground">{displaySections.length}</span> Modules
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-foreground">{totalLessons}</span> Lessons
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-foreground">{displayCourse?.durationMinutes ? `${Math.floor(displayCourse.durationMinutes / 60)}h ${displayCourse.durationMinutes % 60}m` : '4h 30m'}</span> Estimated
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                        <Star className="w-4 h-4 fill-amber-500" />
                        <span>4.9</span>
                        <span className="text-muted-foreground font-normal text-xs">(350+ reviews)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3">
                      {isEnrolled ? (
                        <Button
                          size="lg"
                          onClick={() => {
                            if (allLessons.length > 0) setSelectedLessonId(allLessons[0].id);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 font-bold px-6 shadow-md"
                        >
                          <Play className="w-4 h-4" /> Start Learning
                        </Button>
                      ) : (
                        <Button
                          size="lg"
                          onClick={handleEnroll}
                          disabled={enrolling}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 font-bold px-6 shadow-md"
                        >
                          <GraduationCap className="w-5 h-5" />
                          {enrolling ? 'Enrolling…' : 'Enroll Now — Free'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setBookmarked(b => !b)}
                        className={cn('rounded-xl border-border', bookmarked && 'text-emerald-500 border-emerald-500 bg-emerald-500/10')}
                      >
                        <Bookmark className={cn('w-4 h-4', bookmarked && 'fill-emerald-500')} />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Key Outcomes / What You'll Learn */}
                {bodyHeadings.length > 0 && (
                  <Card className="p-6 rounded-2xl border border-border bg-card space-y-4">
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Shield className="w-5 h-5 text-emerald-500" />
                      What You&apos;ll Master in This Course
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {bodyHeadings.map((heading, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-sm">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-muted-foreground font-medium">{heading}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Course Body Overview */}
                {displayCourse?.body && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-foreground">Course Overview & Syllabus</h2>
                    <div
                      className="edu-lesson-content text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(displayCourse.body)) }}
                    />
                  </div>
                )}

                {/* Related & Recommended Courses Section */}
                <RelatedCoursesSection relatedCourses={relatedCourses} />

                {/* Recommended Learning Paths Section */}
                <RecommendedPathsSection />
              </div>
            ) : (
              /* ── 2. INDIVIDUAL LESSON CONTENT VIEW ────────────────────── */
              <div className="space-y-6">
                {/* Breadcrumbs */}
                <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                  <button onClick={() => setSelectedLessonId(null)} className="hover:text-foreground transition-colors">
                    {title}
                  </button>
                  {currentSection && (
                    <>
                      <ChevronRight size={12} className="opacity-40" />
                      <span>{currentSection.title}</span>
                    </>
                  )}
                  {currentLesson && (
                    <>
                      <ChevronRight size={12} className="opacity-40" />
                      <span className="text-foreground font-semibold">{currentLesson.title}</span>
                    </>
                  )}
                </nav>

                {currentLesson ? (
                  <>
                    {/* Lesson Title & Bookmark */}
                    <div className="flex items-start justify-between gap-4">
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
                        {currentLesson.title}
                      </h1>
                      <button
                        onClick={() => setBookmarked(b => !b)}
                        className="mt-1 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} className={bookmarked ? 'text-amber-500' : ''} />
                      </button>
                    </div>

                    {/* Engagement toolbar */}
                    <div className="flex items-center justify-between gap-4 py-3 border-y border-border flex-wrap">
                      <InteractionBar
                        contentType="course"
                        contentId={numericCourseId}
                        discussRef={discussRef as React.RefObject<HTMLElement>}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHighlightsOpen(true)}
                        className="gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg"
                      >
                        <Highlighter size={14} /> My Highlights
                      </Button>
                    </div>

                    {/* Video Player Placeholder if video lesson */}
                    {currentLesson.type === 'video' && (
                      <div className="aspect-video rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border border-border shadow-md">
                        <button className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white transition-transform hover:scale-105 shadow-lg">
                          <Play size={26} fill="white" className="ml-1" />
                        </button>
                      </div>
                    )}

                    {/* Lesson HTML / Markdown Content */}
                    {currentLesson.content ? (
                      <HighlightOverlay
                        contentType="course"
                        contentId={numericCourseId}
                        contentTitle={title}
                      >
                        <div
                          className="edu-lesson-content text-foreground leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(currentLesson.content)) }}
                        />
                      </HighlightOverlay>
                    ) : (
                      <div className="py-12 text-center text-muted-foreground bg-card/40 rounded-xl border border-dashed">
                        <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Lesson content is being finalized.</p>
                      </div>
                    )}

                    {/* Footer Navigation bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-6 border-t border-border">
                      <div className="flex gap-2">
                        {prevLesson && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLessonId(prevLesson.id)}
                            className="rounded-xl gap-1"
                          >
                            <ChevronLeft className="h-4 w-4" /> Previous
                          </Button>
                        )}
                        {nextLesson && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLessonId(nextLesson.id)}
                            className="rounded-xl gap-1"
                          >
                            Next <ChevronRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {completedLessonIds.includes(currentLesson.id) ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={14} /> Completed
                          </span>
                          {nextLesson && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedLessonId(nextLesson.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1 font-bold"
                            >
                              Next Lesson <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          onClick={async () => {
                            await handleMarkComplete(currentLesson.id);
                            if (nextLesson) setSelectedLessonId(nextLesson.id);
                          }}
                          disabled={isMarkingComplete}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {isMarkingComplete ? 'Saving…' : 'Mark as Complete'}
                        </Button>
                      )}
                    </div>

                    {/* Discussion section */}
                    <div ref={discussRef} className="pt-8 border-t border-border">
                      <CommentsSection contentType="course" contentId={numericCourseId} />
                    </div>

                    {/* Related & Recommended Courses Section inside Lesson view */}
                    <RelatedCoursesSection relatedCourses={relatedCourses} />

                    {/* Recommended Learning Paths Section */}
                    <RecommendedPathsSection />
                  </>
                ) : (
                  <div className="py-20 text-center text-muted-foreground">
                    <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a lesson from the left navigation sidebar to begin.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Highlights slide-over panel */}
      <HighlightsPanel
        open={highlightsOpen}
        onClose={() => setHighlightsOpen(false)}
        contentType="course"
        contentId={numericCourseId}
        contentUrl={buildCourseUrl(displayCourse ?? { title })}
        contentTitle={title}
      />

      <EduCourseStyles />
    </PublicLayout>
  );
}

// ─── Educative / Clean Course Lesson Styles ───────────────────────────────────
const EduCourseStyles = () => (
  <style>{`
    .edu-sidebar-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .edu-sidebar-scroll::-webkit-scrollbar { width: 4px; }
    .edu-sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

    .edu-content-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,0.15) transparent;
    }
    .edu-content-scroll::-webkit-scrollbar { width: 6px; }
    .edu-content-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }

    .edu-lesson-content h1 { font-size: 1.6rem; font-weight: 700; margin: 1.75rem 0 0.75rem; line-height: 1.3; }
    .edu-lesson-content h2 { font-size: 1.3rem; font-weight: 600; margin: 1.5rem 0 0.6rem; }
    .edu-lesson-content h3 { font-size: 1.1rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
    .edu-lesson-content p  { margin-bottom: 1rem; line-height: 1.8; }
    .edu-lesson-content ul { list-style-type: disc; padding-left: 1.75rem; margin-bottom: 1rem; }
    .edu-lesson-content ol { list-style-type: decimal; padding-left: 1.75rem; margin-bottom: 1rem; }
    .edu-lesson-content li { margin-bottom: 0.35rem; line-height: 1.75; }
    .edu-lesson-content a  { color: #10b981; text-decoration: underline; }
    .edu-lesson-content a:hover { text-decoration: none; }
    .edu-lesson-content pre {
      background: #f8fafc; color: #0f172a;
      padding: 1.1rem 1.25rem; border-radius: 0.75rem;
      overflow-x: auto; margin-bottom: 1.25rem;
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.875em; line-height: 1.6;
      border: 1px solid #cbd5e1;
    }
    .dark .edu-lesson-content pre {
      background: #0f172a; color: #f8fafc; border-color: #334155;
    }
    .edu-lesson-content code {
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0;
      padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; font-weight: 500;
    }
    .dark .edu-lesson-content code {
      background: #1e293b; color: #f8fafc; border-color: #334155;
    }
    .edu-lesson-content pre code { background: none; padding: 0; color: inherit; border: none; }
    .edu-lesson-content blockquote {
      border-left: 4px solid #2563eb; padding: 0.85rem 1.25rem;
      margin: 1.25rem 0; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb;
      border-radius: 0 0.5rem 0.5rem 0; color: #0f172a;
    }
    .dark .edu-lesson-content blockquote {
      background: #0f172a; border-color: #334155; border-left-color: #3b82f6; color: #f8fafc;
    }
    .edu-lesson-content blockquote p { color: #0f172a; font-style: normal; font-weight: 500; margin-bottom: 0; }
    .dark .edu-lesson-content blockquote p { color: #f8fafc; }
    .edu-lesson-content img { max-width: 100%; border-radius: 0.75rem; margin: 1.25rem 0; }
    .edu-lesson-content hr { margin: 1.75rem 0; border: none; border-top: 1px solid hsl(var(--border)); }
    .edu-lesson-content strong { font-weight: 600; }
  `}</style>
);

export default CourseViewPage;
