import React, { useState, useRef, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { extractSlugFromPath, buildCourseUrl } from '@/lib/slug';
import {
  ChevronLeft, ChevronDown, ChevronRight, Search, Play, X,
  CheckCircle2, Circle, BookOpen, FileText, GraduationCap, Award,
  Globe, Share2, Clock, Bookmark, Highlighter, Star, ArrowRight, Shield, Check,
  Sparkles, LayoutList, AlertTriangle, Layers
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import { usePublicCmsById, usePublicCmsList, usePublicLearningPathById, usePublicLearningPaths } from '@/api/hooks/usePublicCms';
import { useSectionsByCourse } from '@/api/hooks/useSections';
import { useMyEnrollment, useEnroll, useUpdateProgress } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { renderTipTapDocToHtml } from '@/lib/tiptapRenderer';
import { hydrateMermaidDiagrams } from '@/lib/renderMermaidDiagrams';
import { SectionDto, LessonDto, CmsResponseDto } from '@/api/types';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { CommentsSection } from '@/components/shared/CommentsSection';

import { QuestionNavigator } from '@/components/shared/QuestionNavigator';
import { ModuleLessonNavigator } from '@/components/shared/ModuleLessonNavigator';
import { PathCourseNavigator } from '@/components/shared/PathCourseNavigator';
import { 
  getPracticeAttempt, 
  savePracticeAttempt, 
  clearPracticeAttempt,
  markCourseAsReferred,
  updateCourseProgress,
  getCourseProgressState,
  getSavedCourseLessonId,
  savePathResumeState,
} from '@/lib/contentStateStore';

// ─── Utility to flatten lessons ────────────────────────────────────────────────
function getAllLessons(section: SectionDto): LessonDto[] {
  return section.lessons ?? [];
}

// Renders a stored body string to HTML synchronously (blocks/legacy HTML only).
// TipTap-format bodies are rendered asynchronously — see the useEffect near displayCourse.
function renderCourseBody(body: string | null | undefined, contentFormat?: string | null): string {
  if (!body || contentFormat === 'tiptap') return '';
  return parseBodyToHtml(body);
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
    return <CheckCircle2 size={13} className="text-primary flex-shrink-0" />;
  }
  if (isCurrent) {
    return (
      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
            <Sparkles className="w-5 h-5 text-primary" />
            Related & Recommended Courses
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expand your engineering skills with these recommended tracks.
          </p>
        </div>
        <Link to="/courses" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          Explore Catalog <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {relatedCourses.slice(0, 4).map(rc => (
          <Link key={rc.id} to={buildCourseUrl(rc)} className="group">
            <Card className="p-4 rounded-xl border border-border hover:border-primary/40 hover:shadow-md transition-all bg-card/70 h-full flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                    {rc.categoryName || 'Engineering'}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-primary" />
                    {rc.durationMinutes ? `${Math.floor(rc.durationMinutes / 60)}h ${rc.durationMinutes % 60}m` : ''}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                  {rc.title}
                </h4>
                {rc.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {rc.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  {rc.sectionsCount ? `${rc.sectionsCount} Modules` : ''}
                </span>
                <span className="text-primary font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
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
const RecommendedPathsSection = ({ excludeSlug }: { excludeSlug?: string | null }) => {
  const { data: paths = [] } = usePublicLearningPaths();
  const list = paths.filter(p => p.slug !== excludeSlug).slice(0, 3);
  if (list.length === 0) return null;

  return (
    <section className="pt-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          Recommended Learning Paths
        </h3>
        <Link to="/learning-paths" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          All Paths <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {list.map(path => (
          <li key={path.id}>
            <Link to={`/learn/${path.slug || path.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary/40 hover:bg-primary/5 group">
              <span className="text-xs font-semibold text-foreground group-hover:text-primary line-clamp-1">{path.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{path.courseCount ?? path.courses?.length ?? 0} modules</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

import { PublicQuickEditBar } from '@/components/editor/PublicQuickEditBar';
import { InlinePageEditor } from '@/components/editor/InlinePageEditor';
import { ContentDiffOverlay, DiffViewMode } from '@/components/engagement/ContentDiffOverlay';
import { useUpdateCms, useSubmitCmsForReview, useCmsById } from '@/api/hooks/useCms';

// ─── Main CourseViewPage Component ────────────────────────────────────────────
export function CourseViewPage() {
  const { '*': wildcardPath } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const courseId = extractSlugFromPath(wildcardPath);
  const pathParam = searchParams.get('path');
  const lessonParam = Number(searchParams.get('lesson')) || null;
  const autoLaunch = searchParams.get('learn') === 'true' || !!lessonParam;
  const { data: paramPath } = usePublicLearningPathById(pathParam ?? '');
  const { isAuthenticated, isAdmin, isMasterAdmin, canQuickEditPublic } = useAuth();
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('diff');

  const updateCms = useUpdateCms();
  const submitForReview = useSubmitCmsForReview();

  const handleSaveCourseRevision = async (data: { title: string; description: string; body: string; submitForReview: boolean }) => {
    if (numericCourseId) {
      await updateCms.mutateAsync({
        id: numericCourseId,
        data: {
          type: 'COURSE',
          title: data.title,
          description: data.description,
          body: data.body,
          status: data.submitForReview ? 'REVIEW' : 'DRAFT',
        },
      });

      if (data.submitForReview) {
        await submitForReview.mutateAsync({
          id: numericCourseId,
          type: 'COURSE',
        });
      }
    }
    setIsViewingPending(true);
    setDiffViewMode('diff');
  };

  const { data: course, isLoading: courseLoading } = usePublicCmsById(
    courseId,
    !!courseId,
    isPreview,
    'COURSE',
  );
  const numericCourseId = course?.id ?? 0;
  // Path context applies only when launched from a learning path (?path=)
  const parentPath = paramPath;
  const pathSlug = pathParam ? (parentPath?.slug || pathParam) : null;
  const pathCourseSlugs = useMemo(() => (parentPath?.courses ?? []).map(c => c.slug ?? '').filter(Boolean), [parentPath]);
  // Fetch the real, unmasked draft via the authenticated CMS endpoint whenever this
  // course has a pending draft — the public endpoint substitutes the published
  // snapshot for hasPendingDraft=true content, so it can never show the actual
  // in-progress revision. Only fetched for users with quick-edit privilege.
  const { data: draftCourse } = useCmsById(
    numericCourseId,
    canQuickEditPublic && !!course?.hasPendingDraft,
    'COURSE',
  );
  const { data: sections = [] } = useSectionsByCourse(
    numericCourseId,
    !!numericCourseId,
  );
  const { data: enrollment } = useMyEnrollment(numericCourseId, isAuthenticated && !!numericCourseId);
  const { mutate: enroll, mutateAsync: enrollAsync } = useEnroll();
  const { mutateAsync: updateProgress, isPending: isMarkingComplete } = useUpdateProgress();
  const { data: allCoursesData } = usePublicCmsList({ type: 'COURSE', size: 30 });

  // State management for navigation & interactive tools
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<number[]>([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const discussRef = useRef<HTMLDivElement>(null);
  const courseBodyRef = useRef<HTMLDivElement>(null);

  // Exit confirmation & State saving
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);

  // Interactive Practice Quiz state
  const [practiceQuestionIdx, setPracticeQuestionIdx] = useState(0);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, number>>({});
  const [isPracticeSubmitted, setIsPracticeSubmitted] = useState(false);

  React.useEffect(() => {
    if (courseId) {
      const saved = getPracticeAttempt(courseId);
      if (saved) {
        setPracticeAnswers(saved.selectedAnswers || {});
        setIsPracticeSubmitted(!!saved.isSubmitted);
      }
    }
  }, [courseId]);

  const handlePracticeSubmit = () => {
    setIsPracticeSubmitted(true);
    if (courseId) {
      savePracticeAttempt({
        quizId: String(courseId),
        selectedAnswers: practiceAnswers,
        isSubmitted: true,
        score: 0,
        totalQuestions: allLessons.length,
        correctCount: 0,
        submittedAt: new Date().toISOString(),
      });
    }
  };

  const handlePracticeRetake = () => {
    if (courseId) {
      clearPracticeAttempt(courseId);
    }
    setPracticeAnswers({});
    setIsPracticeSubmitted(false);
    setPracticeQuestionIdx(0);
  };

  // Real course data from backend API
  const displayCourse = useMemo(() => {
    if (course) return course;
    if (!courseId) return null;
    return null;
  }, [course, courseId]);

  const [tiptapCourseBodyHtml, setTiptapCourseBodyHtml] = useState('');

  React.useEffect(() => {
    if (displayCourse?.contentFormat === 'tiptap' && displayCourse.body) {
      renderTipTapDocToHtml(displayCourse.body).then(setTiptapCourseBodyHtml);
    }
  }, [displayCourse?.body, displayCourse?.contentFormat]);

  React.useEffect(() => {
    if (displayCourse?.contentFormat === 'tiptap' && courseBodyRef.current) {
      hydrateMermaidDiagrams(courseBodyRef.current);
    }
  }, [tiptapCourseBodyHtml, displayCourse?.contentFormat]);

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

  // Real sections & lessons data from backend API
  const displaySections = useMemo((): SectionDto[] => {
    return sections ?? [];
  }, [sections]);

  // Expand all sections by default once sections load
  React.useEffect(() => {
    if (displaySections.length > 0 && expandedSections.length === 0) {
      setExpandedSections(displaySections.map(s => s.id));
    }
  }, [displaySections]);

  const isEnrolled = !!enrollment;

  // Launch gracefully: jump to the requested lesson, else resume the saved one, else the first
  const [autoLaunched, setAutoLaunched] = useState(false);
  React.useEffect(() => {
    if (autoLaunched || !autoLaunch || !numericCourseId || isPracticeCourse) return;
    const lessons = displaySections.flatMap(getAllLessons);
    if (lessons.length === 0) return;
    const wanted = lessonParam ?? getSavedCourseLessonId(numericCourseId);
    const target = lessons.find(l => l.id === wanted) ?? lessons[0];
    setSelectedLessonId(target.id);
    setAutoLaunched(true);
  }, [autoLaunch, autoLaunched, displaySections, isPracticeCourse, lessonParam, numericCourseId]);

  // Local completed lessons state stored in localStorage for persistent offline/guest progress
  const [localCompletedIds, setLocalCompletedIds] = useState<number[]>([]);
  React.useEffect(() => {
    if (!numericCourseId) return;
    try {
      const saved = localStorage.getItem(`ggcms_completed_lessons_${numericCourseId}`);
      setLocalCompletedIds(saved ? JSON.parse(saved) : []);
    } catch {
      setLocalCompletedIds([]);
    }
  }, [numericCourseId]);

  const completedLessonIds: number[] = useMemo(() => {
    const fromApi = (enrollment?.completedLessons ?? []).map(l => l.id);
    return Array.from(new Set([...fromApi, ...localCompletedIds]));
  }, [enrollment, localCompletedIds]);
  const allLessons = useMemo(() => displaySections.flatMap(getAllLessons), [displaySections]);
  const totalLessons = allLessons.length;
  const totalModules = displaySections.length;


  // Automatically mark course as referred when opened, and update course progress
  React.useEffect(() => {
    const id = numericCourseId || courseId;
    if (id) {
      markCourseAsReferred(id);
      if (totalLessons > 0) {
        updateCourseProgress(id, completedLessonIds, totalLessons);
      }
    }
  }, [numericCourseId, courseId, completedLessonIds, totalLessons]);

  const courseState = useMemo(() => {
    const id = numericCourseId || courseId;
    return id ? getCourseProgressState(id) : null;
  }, [numericCourseId, courseId, completedLessonIds, totalLessons]);

  // Dynamic approximate duration calculation
  const calculatedDurationMinutes = useMemo(() => {
    if (displayCourse?.durationMinutes && displayCourse.durationMinutes > 0) {
      return displayCourse.durationMinutes;
    }
    if (allLessons.length === 0) return 0;
    let total = 0;
    for (const lesson of allLessons) {
      if (lesson.duration && lesson.duration > 0) {
        total += lesson.duration;
      } else if (lesson.content && lesson.content.trim()) {
        const plainText = lesson.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const words = plainText.split(' ').filter(Boolean).length;
        total += Math.max(3, Math.ceil(words / 180));
      } else {
        total += 5; // default estimate per lesson if missing
      }
    }
    return total;
  }, [displayCourse?.durationMinutes, allLessons]);

  const formattedDurationText = useMemo(() => {
    if (calculatedDurationMinutes <= 0) return 'Self-paced';
    const hrs = Math.floor(calculatedDurationMinutes / 60);
    const mins = calculatedDurationMinutes % 60;
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }, [calculatedDurationMinutes]);

  const completedCount = completedLessonIds.length;
  const progressPercent = totalLessons > 0
    ? Math.round((completedCount / totalLessons) * 100)
    : Math.round((enrollment?.progress ?? 0) * 100);

  // Save current course progress & lesson state locally and to backend
  const saveCurrentCourseState = React.useCallback(() => {
    if (numericCourseId && selectedLessonId !== null) {
      try {
        const state = {
          courseId: numericCourseId,
          selectedLessonId,
          completedLessonIds,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(`ggcms_course_state_${numericCourseId}`, JSON.stringify(state));
      } catch {
        // ignore
      }
      if (pathSlug) {
        savePathResumeState({
          pathSlug,
          courseSlug: displayCourse?.slug || courseId,
          courseUrl: `${buildCourseUrl(displayCourse ?? { id: numericCourseId, title: courseId })}?path=${encodeURIComponent(pathSlug)}&lesson=${selectedLessonId}`,
          lessonId: selectedLessonId,
          savedAt: new Date().toISOString(),
        });
      }
    }
  }, [numericCourseId, selectedLessonId, completedLessonIds, pathSlug, displayCourse, courseId]);

  // Intercept click on any external link when in an active lesson
  React.useEffect(() => {
    if (selectedLessonId === null) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const targetAnchor = (e.target as HTMLElement).closest('a');
      if (!targetAnchor) return;
      const rawHref = (targetAnchor.getAttribute('href') ?? '').trim();
      if (!rawHref || rawHref.startsWith('#')) return;
      let url: URL;
      try {
        url = new URL(rawHref, window.location.origin);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        e.preventDefault();
        return;
      }
      if (url.origin !== window.location.origin) return;
      const href = `${url.pathname}${url.search}${url.hash}`;
      if (url.pathname.startsWith('/article/')) return;
      if (pathSlug && url.pathname.startsWith(`/learn/${pathSlug}`)) {
        saveCurrentCourseState();
        return;
      }
      if (url.pathname.startsWith('/course/') && pathCourseSlugs.includes(extractSlugFromPath(url.pathname.replace('/course/', '')))) {
        saveCurrentCourseState();
        return;
      }
      if (url.pathname !== window.location.pathname) {
        e.preventDefault();
        e.stopPropagation();
        saveCurrentCourseState();
        setPendingNavigationUrl(href);
        setShowExitDialog(true);
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [selectedLessonId, saveCurrentCourseState, pathSlug, pathCourseSlugs]);

  // Handle browser reload or window close
  React.useEffect(() => {
    if (selectedLessonId === null) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveCurrentCourseState();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedLessonId, saveCurrentCourseState]);

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
    if (!searchQuery.trim()) return displaySections;
    const q = searchQuery.toLowerCase();
    return displaySections
      .map(section => {
        const sectionLessons = getAllLessons(section);
        const matched = sectionLessons.filter(l =>
          l.title.toLowerCase().includes(q) ||
          (l.content && l.content.toLowerCase().includes(q)) ||
          (l.summary && l.summary.toLowerCase().includes(q)) ||
          (section.title && section.title.toLowerCase().includes(q))
        );
        return { ...section, lessons: matched };
      })
      .filter(section => section.lessons.length > 0 || (section.title && section.title.toLowerCase().includes(q)));
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
    const updated = completedLessonIds.includes(lId)
      ? completedLessonIds
      : [...completedLessonIds, lId];

    setLocalCompletedIds(updated);
    try {
      localStorage.setItem(`ggcms_completed_lessons_${numericCourseId || 0}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save progress to localStorage:', e);
    }

    const newProgress = totalLessons > 0 ? updated.length / totalLessons : 0;

    if (!isAuthenticated) {
      toast.success('Progress saved on this device. Sign in to sync it to your account.');
      return;
    }

    try {
      const active = enrollment ?? (await enrollAsync(numericCourseId));
      if (active?.id) {
        await updateProgress({
          enrollmentId: active.id,
          data: {
            completedLessonId: lId,
            progress: newProgress,
            status: newProgress >= 1 ? 'completed' : 'active',
          },
        });
      }
    } catch (err) {
      toast.error(toUserMessage(err, 'Progress saved locally but failed to sync to your account.'));
      return;
    }

    toast.success('Lesson marked complete');
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

  if (!displayCourse) {
    return (
      <PublicLayout>
        <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <h1 className="text-2xl font-bold">Course not found</h1>
          <p className="text-sm text-muted-foreground">This course is unavailable or has not been published yet.</p>
          <Button onClick={() => navigate(pathSlug ? `/learn/${pathSlug}` : '/courses')}>
            {pathSlug ? 'Back to Learning Path' : 'Browse Courses'}
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <InlinePageEditor
        contentType="course"
        contentId={numericCourseId || 1}
        initialTitle={draftCourse?.title ?? title}
        initialDescription={draftCourse?.description ?? description}
        initialBody={draftCourse?.body ?? displayCourse?.body ?? ''}
        contentFormat={displayCourse?.contentFormat}
        isEditing={isInlineEditing}
        onClose={() => setIsInlineEditing(false)}
        onSave={handleSaveCourseRevision}
      />

      <PublicQuickEditBar
        contentType="course"
        contentId={numericCourseId || 1}
        currentTitle={draftCourse?.title ?? title}
        currentDescription={draftCourse?.description ?? description}
        currentBody={draftCourse?.body ?? displayCourse?.body ?? ''}
        contentFormat={displayCourse?.contentFormat}
        hasPendingDraft={!!course?.hasPendingDraft}
        pendingDraftStatus={course?.status}
        pendingDraftAuthorId={draftCourse?.updatedBy ?? null}
        isViewingPending={isViewingPending}
        onToggleView={setIsViewingPending}
        onStartInlineEdit={() => setIsInlineEditing(true)}
        onSaveRevision={handleSaveCourseRevision}
      />

      {!!course?.hasPendingDraft && (isAdmin || isMasterAdmin) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <ContentDiffOverlay
            publishedTitle={course.publishedTitle || title}
            draftTitle={draftCourse?.title || title}
            publishedDescription={course.publishedDescription || description}
            draftDescription={draftCourse?.description || description}
            publishedBody={course.publishedBody || displayCourse?.body || ''}
            draftBody={draftCourse?.body || displayCourse?.body || ''}
            status={draftCourse?.status || course.status || 'DRAFT'}
            hasPendingDraft={!!course.hasPendingDraft}
            version={draftCourse?.version || course.version || 2}
            publishedVersion={course.publishedVersion || 1}
            viewMode={diffViewMode}
            onViewModeChange={setDiffViewMode}
            onStartInlineEdit={() => setIsInlineEditing(true)}
            canEdit={canQuickEditPublic}
          />
        </div>
      )}

      {/*
        Full viewport container with Left Navigation Sidebar + Right Content View
      */}
      <div className="min-h-screen bg-background text-foreground pb-12">
        <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 pt-5 space-y-5">
          {/* Top Header Bar */}
          <div className="flex items-center gap-3 border-b border-border pb-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate(pathSlug ? `/learn/${pathSlug}` : '/courses')} className="rounded-xl gap-1 text-xs shrink-0">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <span className="text-sm font-semibold text-foreground truncate max-w-[60ch]">
              {paramPath ? paramPath.title : (displayCourse?.title ?? title)}
            </span>
            {isPracticeCourse && (
              <Badge variant="outline" className="text-xs font-semibold">
                Practice Assessment Track
              </Badge>
            )}
          </div>

          {/* 2-Column Runner Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Sticky Modules/Lessons Navigator (4 Cols) */}
            <div className="lg:col-span-3 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto pr-0.5">
              {isPracticeCourse ? (
                <QuestionNavigator
                  totalQuestions={totalLessons || 4}
                  currentIndex={practiceQuestionIdx}
                  attemptedMap={practiceAnswers}
                  onSelectQuestion={(idx) => setPracticeQuestionIdx(idx)}
                  questions={allLessons.length > 0 ? allLessons : [1, 2, 3, 4].map(n => ({ title: `Question ${n}` }))}
                  title="Questions Navigator"
                />
              ) : pathSlug && parentPath && numericCourseId ? (
                <PathCourseNavigator
                  pathTitle={parentPath.title}
                  pathSlug={pathSlug}
                  courses={(parentPath.courses ?? [])
                    .filter(c => !!c.slug && c.status === 'PUBLISHED')
                    .map(c => ({
                      id: c.courseId,
                      title: c.title || c.slug || '',
                      courseUrl: `${buildCourseUrl({ id: c.courseId, slug: c.slug, title: c.title ?? '', categoryName: c.categoryName })}?path=${encodeURIComponent(pathSlug)}&learn=true`,
                    }))}
                  currentCourseId={numericCourseId}
                  sections={displaySections}
                  selectedLessonId={selectedLessonId}
                  onSelectLesson={setSelectedLessonId}
                  completedLessonIds={completedLessonIds}
                />
              ) : (
                <ModuleLessonNavigator
                  sections={displaySections}
                  selectedLessonId={selectedLessonId}
                  onSelectLesson={setSelectedLessonId}
                  completedLessonIds={completedLessonIds}
                  title="Modules & Lessons"
                  categoryName={displayCourse?.categoryName}
                />
              )}
            </div>

            {/* RIGHT COLUMN: Content Runner Card (8 Cols) */}
            <div className="lg:col-span-9 space-y-4 min-w-0">
              {isPracticeCourse ? (
                /* ── PRACTICE COURSE RUNNER ────── */
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
                                'w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between cursor-pointer',
                                isSelected
                                  ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                                  : 'bg-card border-border text-foreground hover:bg-muted/60'
                              )}
                            >
                              <span>{opt}</span>
                              <div className={cn(
                                'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                                isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40'
                              )}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
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
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold"
                        >
                          Next Question <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handlePracticeSubmit}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold"
                        >
                          Submit Practice Test 🎉
                        </Button>
                      )}
                    </div>

                    {isPracticeSubmitted && (
                      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-3 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-primary flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-primary" /> Practice Set Submitted
                          </h4>
                          <Button
                            size="sm"
                            onClick={handlePracticeRetake}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl"
                          >
                            Retake Practice Test
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Your answers have been saved to your progress history on this device.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedLessonId === null ? (
                /* ── STANDARD COURSE OVERVIEW VIEW ──────────────────────────────── */
              <div className="space-y-8">
                {/* Hero Card */}
                <div className="relative rounded-2xl overflow-hidden p-8 border border-border shadow-sm bg-card bg-gradient-to-br from-primary/10 via-card to-card">
                  <div className="space-y-4 max-w-3xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-bold">
                        <BookOpen className="w-3.5 h-3.5 mr-1" />
                        Course Overview
                      </Badge>
                      {paramPath ? (
                        <Link to={`/learn/${paramPath.slug || paramPath.id}`}>
                          <Badge variant="outline" className="text-xs hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer border-primary/20 text-primary">
                            {paramPath.title}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-xs">{displayCourse?.categoryName || 'Engineering'}</Badge>
                      )}
                      {courseState?.isCompleted ? (
                        <Badge className="bg-primary text-white font-bold text-xs border-none">
                          <Award className="w-3.5 h-3.5 mr-1" /> Course Completed (100%)
                        </Badge>
                      ) : courseState?.isReferred ? (
                        <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-bold text-xs">
                          <Clock className="w-3.5 h-3.5 mr-1" /> Referred ({courseState.progress}%)
                        </Badge>
                      ) : isEnrolled ? (
                        <Badge className="bg-primary text-white border-none text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Enrolled
                        </Badge>
                      ) : null}
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
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{totalModules}</span> Modules
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{totalLessons}</span> Lessons
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{formattedDurationText}</span> Estimated
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3">
                      <Button
                        size="lg"
                        onClick={() => {
                          if (isAuthenticated && !isEnrolled && numericCourseId) enroll(numericCourseId);
                          if (allLessons.length > 0) setSelectedLessonId(allLessons[0].id);
                        }}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2 font-bold px-6 shadow-md"
                      >
                        <Play className="w-4 h-4" /> Start Learning
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setBookmarked(b => !b)}
                        className={cn('rounded-xl border-border', bookmarked && 'text-primary border-primary bg-primary/10')}
                      >
                        <Bookmark className={cn('w-4 h-4', bookmarked && 'fill-primary')} />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Key Outcomes / What You'll Learn */}
                {bodyHeadings.length > 0 && (
                  <Card className="p-6 rounded-2xl border border-border bg-card space-y-4">
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Shield className="w-5 h-5 text-primary" />
                      What You&apos;ll Master in This Course
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {bodyHeadings.map((heading, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-muted-foreground font-medium">{heading}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Course Modules & Detailed Curriculum Coverage */}
                {displaySections.length > 0 && (
                  <Card className="p-6 rounded-3xl border border-border bg-card space-y-6 shadow-xs">
                    <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-2">
                      <div>
                        <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                          <Layers className="w-5 h-5 text-primary" />
                          Course Curriculum & Module Coverage
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          {totalModules} {totalModules === 1 ? 'Module' : 'Modules'} • {totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'} • Click any module or lesson to jump directly into learning
                        </p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary">
                        {completedCount} / {totalLessons} Completed
                      </span>
                    </div>

                    <div className="space-y-4">
                      {displaySections.map((section, sIdx) => {
                        const sectionLessons = getAllLessons(section);
                        const sectionCompletedCount = sectionLessons.filter(l => completedLessonIds.includes(l.id)).length;
                        return (
                          <div key={section.id || sIdx} className="rounded-2xl border border-border/80 overflow-hidden bg-card/60">
                            {/* Module Header */}
                            <div
                              onClick={() => {
                                if (sectionLessons.length > 0) setSelectedLessonId(sectionLessons[0].id);
                              }}
                              className="p-4 bg-muted/30 flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/60 transition-colors"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] font-extrabold uppercase bg-primary/10 text-primary border-primary/30">
                                    Module {String(sIdx + 1).padStart(2, '0')}
                                  </Badge>
                                  <h3 className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                                    {section.title || `Module ${sIdx + 1}`}
                                  </h3>
                                </div>
                                {section.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                    {section.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-semibold text-muted-foreground bg-background px-2.5 py-1 rounded-full border border-border">
                                  {sectionCompletedCount}/{sectionLessons.length} Done
                                </span>
                              </div>
                            </div>

                            {/* Module Lessons List */}
                            {sectionLessons.length > 0 && (
                              <div className="divide-y divide-border/40 bg-background/40">
                                {sectionLessons.map((lesson, lIdx) => {
                                  const isCompleted = completedLessonIds.includes(lesson.id);
                                  const TypeIcon = lesson.type === 'video' ? Play : FileText;
                                  return (
                                    <button
                                      key={lesson.id || lIdx}
                                      onClick={() => setSelectedLessonId(lesson.id)}
                                      className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-primary/5 transition-colors group cursor-pointer"
                                    >
                                      <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <div className={cn(
                                          'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                                          isCompleted
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-muted-foreground/40 bg-background'
                                        )}>
                                          {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>

                                        <div className="space-y-0.5 min-w-0 flex-1">
                                          <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                            {lesson.title}
                                          </p>
                                          {lesson.summary && (
                                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                                              {lesson.summary}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                                        <TypeIcon className="w-3.5 h-3.5" />
                                        <span className="text-[11px] font-medium hidden sm:inline">
                                          {lesson.duration ? `${lesson.duration}m` : '5m'}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Course Body Overview */}
                {displayCourse?.body && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-foreground">Course Overview & Syllabus</h2>
                    <div
                      className="edu-lesson-content text-foreground leading-relaxed"
                      ref={courseBodyRef}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayCourse.contentFormat === 'tiptap' ? tiptapCourseBodyHtml : renderCourseBody(displayCourse.body, displayCourse.contentFormat)) }}
                    />
                  </div>
                )}

                {/* Related & Recommended Courses Section */}
                <RelatedCoursesSection relatedCourses={relatedCourses} />

                <RecommendedPathsSection excludeSlug={pathSlug} />
              </div>
            ) : (
              /* ── 2. INDIVIDUAL LESSON CONTENT VIEW ────────────────────── */
              <div className="bg-card border border-border rounded-2xl relative shadow-xs">
                {/* Sticky Header Group */}
                <div className="sticky top-0 z-20 bg-card rounded-t-2xl p-4 sm:p-6 pb-2 border-b border-border shadow-xs">
                  {/* Breadcrumbs */}
                  <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap pb-1.5 border-b border-border/60">
                    <button onClick={() => setSelectedLessonId(null)} className="hover:text-foreground transition-colors font-medium">
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
                      <div className="flex items-start justify-between gap-4 mt-2">
                        <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">
                          {currentLesson.title}
                        </h1>
                        <button
                          onClick={() => setBookmarked(b => !b)}
                          className="mt-1 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} className={bookmarked ? 'text-primary' : ''} />
                        </button>
                      </div>

                      {/* Engagement toolbar */}
                      <div className="flex items-center justify-between gap-4 pt-3 mt-3 border-t border-border flex-wrap">
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
                    </>
                  ) : null}
                </div>

                <div className="p-4 sm:p-6 space-y-4">
                  {currentLesson ? (
                    <>

                    {/* Video Player Placeholder if video lesson */}
                    {currentLesson.type === 'video' && (
                      <div className="aspect-video rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border border-border shadow-md">
                        <button className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-primary-foreground transition-transform hover:scale-105 shadow-lg">
                          <Play size={26} fill="currentColor" className="ml-1" />
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
                          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary/15 text-primary">
                            <CheckCircle2 size={14} /> Completed
                          </span>
                          {nextLesson && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedLessonId(nextLesson.id)}
                              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-1 font-bold"
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
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold gap-2"
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

                  </>
                ) : (
                  <div className="py-20 text-center text-muted-foreground">
                    <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a lesson from the left navigation sidebar to begin.</p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
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

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Exit Course?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              {pathSlug ? 'Your position in this learning path will be saved so you can resume later.' : 'Your progress and current lesson will be saved so you can resume later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => { setShowExitDialog(false); setPendingNavigationUrl(null); }}>
              Stay in Course
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                saveCurrentCourseState();
                setShowExitDialog(false);
                if (pendingNavigationUrl) {
                  navigate(pendingNavigationUrl);
                  setPendingNavigationUrl(null);
                }
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              Save & Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
