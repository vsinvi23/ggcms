import { useState, useRef, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { extractSlugFromPath, buildCourseUrl } from '@/lib/slug';
import {
  ChevronLeft, ChevronDown, ChevronRight, Search, Play,
  CheckCircle2, Circle, BookOpen, FileText, GraduationCap, Award,
  Globe, Share2, Facebook, Twitter, Linkedin, Clock, Users,
  Bookmark, Highlighter,
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePublicCmsById, usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useSectionsByCourse } from '@/api/hooks/useSections';
import { useMyEnrollment, useEnroll, useUpdateProgress } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { SectionDto, LessonDto, CmsResponseDto } from '@/api/types';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';
import { InteractionBar } from '@/components/engagement/InteractionBar';

// ─── Body heading extraction ───────────────────────────────────────────────────

function extractHeadings(body: string | null | undefined): string[] {
  if (!body?.trim() || !body.trim().startsWith('[')) return [];
  try {
    const blocks: Array<{ type: string; content?: string }> = JSON.parse(body.trim());
    if (!Array.isArray(blocks)) return [];
    return blocks
      .filter(b => b.type === 'heading1' || b.type === 'heading2' || b.type === 'heading3')
      .map(b => b.content?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Body-based curriculum preview ────────────────────────────────────────────

function BodyCurriculumPreview({
  body,
  onSignIn,
  isAuthenticated,
}: {
  body: string | null | undefined;
  onSignIn: () => void;
  isAuthenticated: boolean;
}) {
  if (!body?.trim()) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">
        Course content will be available soon.
      </p>
    );
  }
  return (
    <div>
      <div
        className="lesson-content text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(body)) }}
      />
      {!isAuthenticated && (
        <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center border border-dashed border-border">
          <p className="text-sm text-muted-foreground mb-3">
            Sign in and enroll to track your progress and access all course materials.
          </p>
          <Button size="sm" onClick={onSignIn}>
            <GraduationCap className="h-4 w-4 mr-2" />
            Sign in to Enroll
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Curriculum Section (overview tab) ────────────────────────────────────────

const CurriculumSection = ({
  section,
  index,
  isEnrolled = false,
  completedLessonIds = [],
  learningUrl = '',
}: {
  section: SectionDto;
  index: number;
  isEnrolled?: boolean;
  completedLessonIds?: number[];
  learningUrl?: string;  // base URL of the learning view — enrolled users are linked there
}) => {
  const [isExpanded, setIsExpanded] = useState(index < 2);
  const lessons: LessonDto[] = section.lessons ?? [];
  const totalMins = lessons.reduce((acc, l) => acc + (l.duration ?? 0), 0);

  // How many lessons in this section are completed?
  const doneInSection = isEnrolled
    ? lessons.filter(l => completedLessonIds.includes(l.id)).length
    : 0;

  const LessonRow = ({ lesson }: { lesson: LessonDto }) => {
    const isCompleted = isEnrolled && completedLessonIds.includes(lesson.id);

    const TypeIcon = lesson.type === 'video'
      ? Play
      : lesson.type === 'text'
      ? FileText
      : BookOpen;

    const inner = (
      <div
        className={cn(
          'flex items-center gap-3 p-3.5 text-sm transition-colors',
          isEnrolled && 'hover:bg-muted/40 cursor-pointer',
        )}
      >
        {/* Type icon */}
        <TypeIcon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            isCompleted ? 'text-success' : 'text-muted-foreground',
          )}
        />

        {/* Title */}
        <span className={cn('flex-1', isCompleted && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
          {lesson.title}
        </span>

        {/* Status badge / label */}
        {isEnrolled ? (
          isCompleted ? (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Done
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Circle className="h-3.5 w-3.5" />
            </span>
          )
        ) : (
          <span className="text-primary text-xs font-medium">Preview</span>
        )}

        {/* Duration */}
        {lesson.duration != null && (
          <span className="text-xs text-muted-foreground ml-1">{lesson.duration} min</span>
        )}
      </div>
    );

    // Enrolled users can click the row to jump to the learning view
    if (isEnrolled && learningUrl) {
      return (
        <Link to={learningUrl} className="block">
          {inner}
        </Link>
      );
    }
    return <div>{inner}</div>;
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{section.title}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress chip for enrolled users */}
          {isEnrolled && lessons.length > 0 && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              doneInSection === lessons.length
                ? 'bg-success/15 text-success'
                : doneInSection > 0
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}>
              {doneInSection}/{lessons.length}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
            {totalMins > 0 ? ` • ${totalMins} min` : ''}
          </span>
        </div>
      </button>

      {isExpanded && lessons.length > 0 && (
        <div className="divide-y divide-border">
          {lessons.map(lesson => <LessonRow key={lesson.id} lesson={lesson} />)}
        </div>
      )}
    </div>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getAllLessons = (section: SectionDto): LessonDto[] => [
  ...(section.lessons ?? []),
  ...(section.childSections ?? []).flatMap(cs => cs.lessons ?? []),
];

// ─── Lesson status dot ────────────────────────────────────────────────────────

const LessonDot = ({ isCompleted, isCurrent }: { isCompleted: boolean; isCurrent: boolean }) => {
  if (isCompleted) {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center justify-center rounded-full"
        style={{ width: 14, height: 14, background: '#22c55e' }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span
        className="flex-shrink-0 inline-block rounded-full"
        style={{ width: 14, height: 14, background: '#c7c9d1', border: '2px solid #6b7280' }}
      />
    );
  }
  return (
    <span
      className="flex-shrink-0 inline-block rounded-full"
      style={{ width: 14, height: 14, background: 'transparent', border: '2px solid #4b5563' }}
    />
  );
};

// ─── Course Learning Page ─────────────────────────────────────────────────────

// ─── LeetCode-style course syllabus sidebar ───────────────────────────────────

const CourseSyllabusSidebar = ({
  sections,
  completedLessonIds,
  isEnrolled,
  learningUrl,
  fullWidth = false,
}: {
  sections: SectionDto[];
  completedLessonIds: number[];
  isEnrolled: boolean;
  learningUrl: string;
  fullWidth?: boolean;
}) => {
  const [openId, setOpenId] = useState<number | null>(sections[0]?.id ?? null);
  const totalLessons = sections.reduce((a, s) => a + (s.lessons?.length ?? 0), 0);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Header — hidden when full-width (parent section already shows title + count) */}
      {!fullWidth && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">Course Content</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sections.length} section{sections.length !== 1 ? 's' : ''} &bull; {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Section list — scrollable in sidebar, full-height when full-width */}
      <div className={cn(
        'divide-y divide-border',
        !fullWidth && 'max-h-[420px] overflow-y-auto edu-sidebar-scroll',
      )}>
        {sections.map((section, idx) => {
          const lessons = section.lessons ?? [];
          const done = isEnrolled
            ? lessons.filter(l => completedLessonIds.includes(l.id)).length
            : 0;
          const allDone = done === lessons.length && lessons.length > 0;
          const isOpen = openId === section.id;

          return (
            <div key={section.id}>
              {/* Section toggle */}
              <button
                onClick={() => setOpenId(isOpen ? null : section.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 text-left transition-colors"
              >
                {/* Number badge */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors',
                    isOpen
                      ? 'bg-primary text-primary-foreground'
                      : allDone
                      ? 'bg-success/15 text-success'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {allDone ? <CheckCircle2 size={14} /> : idx + 1}
                </div>

                {/* Title + lesson count */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug line-clamp-2">{section.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Enrolled progress count */}
                {isEnrolled && lessons.length > 0 && (
                  <span className={cn(
                    'text-xs font-semibold flex-shrink-0',
                    allDone ? 'text-success' : done > 0 ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    {done}/{lessons.length}
                  </span>
                )}

                <ChevronDown
                  size={14}
                  className={cn(
                    'flex-shrink-0 text-muted-foreground transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>

              {/* Lesson list */}
              {isOpen && lessons.length > 0 && (
                <div className="bg-muted/20 divide-y divide-border/50">
                  {lessons.map(lesson => {
                    const isDone = isEnrolled && completedLessonIds.includes(lesson.id);
                    const TypeIcon = lesson.type === 'video' ? Play
                      : lesson.type === 'text' ? FileText : BookOpen;

                    const row = (
                      <div
                        className={cn(
                          'flex items-start gap-3 px-5 py-2.5 transition-colors text-sm',
                          isEnrolled && 'hover:bg-muted/40 cursor-pointer',
                        )}
                      >
                        {isDone
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 flex-shrink-0" />
                          : <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                        <span className={cn('leading-snug flex-1', isDone && 'text-muted-foreground')}>
                          {lesson.title}
                        </span>
                        <TypeIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      </div>
                    );

                    return isEnrolled
                      ? <Link key={lesson.id} to={learningUrl}>{row}</Link>
                      : <div key={lesson.id}>{row}</div>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Course Learning Page ─────────────────────────────────────────────────────

const CourseLearningPage = ({
  courseTitle,
  courseUrl,
  numericCourseId,
  sections,
  progressPercent,
  completedLessonIds,
  onMarkComplete,
  isMarkingComplete,
}: {
  courseTitle: string;
  courseUrl: string;         // e.g. /course/go-programming — used by Back link
  numericCourseId: number;
  sections: SectionDto[];
  progressPercent: number;
  completedLessonIds: number[];
  onMarkComplete: (lessonId: number) => Promise<void>;
  isMarkingComplete: boolean;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<number[]>(
    sections.slice(0, 2).map(s => s.id),
  );
  const firstLesson = sections.length > 0 ? getAllLessons(sections[0])[0] : undefined;
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(firstLesson?.id ?? null);
  const [bookmarked, setBookmarked] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const discussRef = useRef<HTMLDivElement>(null);

  const totalLessons = sections.reduce((acc, s) => acc + getAllLessons(s).length, 0);
  const completedCount = completedLessonIds.length;

  const currentSection = sections.find(s =>
    getAllLessons(s).some(l => l.id === selectedLessonId),
  );
  const currentLesson = currentSection
    ? getAllLessons(currentSection).find(l => l.id === selectedLessonId)
    : undefined;

  const allLessons = sections.flatMap(getAllLessons);
  const currentLessonIndex = allLessons.findIndex(l => l.id === selectedLessonId);
  const nextLesson = allLessons[currentLessonIndex + 1] ?? null;
  const prevLesson = allLessons[currentLessonIndex - 1] ?? null;

  const goToLesson = (lessonId: number) => {
    setSelectedLessonId(lessonId);
    const sec = sections.find(s => getAllLessons(s).some(l => l.id === lessonId));
    if (sec && !expandedSections.includes(sec.id)) {
      setExpandedSections(prev => [...prev, sec.id]);
    }
  };

  const filteredSections = sections
    .map(section => {
      const allSectionLessons = getAllLessons(section);
      const displayLessons = searchQuery.trim()
        ? allSectionLessons.filter(l =>
            l.title.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : allSectionLessons;
      return { ...section, lessons: displayLessons };
    })
    .filter(section => !searchQuery.trim() || section.lessons.length > 0);

  const toggleSection = (sectionId: number) => {
    setExpandedSections(prev =>
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId],
    );
  };

  return (
    <PublicLayout>
      {/*
        -m-4 cancels PublicLayout's p-4; height calc fills the remaining viewport
        after the h-14 (56px) top header.
      */}
      <div
        className="-m-4 flex overflow-hidden"
        style={{ height: 'calc(100% + 2rem)' }}
      >
        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: 272,
            background: '#1a1c23',
            borderRight: '1px solid rgba(255,255,255,0.06)',   /* separates sidebar from content */
          }}
        >
          {/* Header — back, title, progress */}
          <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <Link
              to={courseUrl}
              className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 hover:opacity-80 transition-opacity"
              style={{ color: '#9ca3af' }}
            >
              <ChevronLeft size={13} />
              Back to Course
            </Link>

            <h1 className="text-sm font-semibold leading-snug mb-3.5" style={{ color: '#e8e9f0' }}>
              {courseTitle}
            </h1>

            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {progressPercent}% completed
              </span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 3, background: '#2a2b35' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%`, background: '#22c55e' }}
              />
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#6b7280' }}
              />
              <input
                type="text"
                placeholder="Search Module"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg outline-none"
                style={{
                  background: '#252631',
                  border: '1px solid #2f3040',
                  color: '#c9cad4',
                  padding: '7px 10px 7px 30px',
                }}
              />
            </div>
          </div>

          {/* Section + lesson tree */}
          <div className="flex-1 overflow-y-auto edu-sidebar-scroll pt-2 pb-4">
            {filteredSections.map((section) => {
              const isOpen = searchQuery.trim() !== '' || expandedSections.includes(section.id);
              const sectionLessons = section.lessons ?? [];
              return (
                <div key={section.id} className="mb-1">
                  {/*
                    Section header: chevron is on the LEFT so it visually
                    indicates hierarchy and the connector line below can
                    align with it naturally.
                    pl-5 (20px) + icon-width (12px) / 2 = ~26px → connector
                    line sits at ml-[26px] which centres it on the chevron.
                  */}
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-start gap-2 px-5 py-2.5 transition-colors text-left hover:bg-white/[0.04]"
                  >
                    <span className="flex-shrink-0 mt-0.5" style={{ color: '#6b7280' }}>
                      {isOpen
                        ? <ChevronDown size={12} />
                        : <ChevronRight size={12} />}
                    </span>
                    <span className="text-xs font-semibold leading-snug" style={{ color: '#e2e4ed' }}>
                      {section.title}
                    </span>
                  </button>

                  {/*
                    Lesson list: ml-[26px] centres the left border on the
                    chevron above; mr-3 gives right breathing room.
                  */}
                  {isOpen && sectionLessons.length > 0 && (
                    <div
                      className="mb-2 px-2"   /* px-2 gives 8px breathing room on both sides */
                      style={{
                        marginLeft: 26,
                        borderLeft: '1px solid rgba(255,255,255,0.09)',
                      }}
                    >
                      {sectionLessons.map((lesson) => {
                        const isCompleted = completedLessonIds.includes(lesson.id);
                        const isCurrent = selectedLessonId === lesson.id;
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => setSelectedLessonId(lesson.id)}
                            className="w-full text-left flex items-center gap-2.5 py-2 rounded-lg transition-colors"
                            style={{
                              paddingLeft: 12,
                              paddingRight: 8,
                              background: isCurrent
                                ? 'rgba(124,58,237,0.15)'
                                : 'transparent',
                              outline: isCurrent
                                ? '1px solid rgba(124,58,237,0.25)'
                                : 'none',
                            }}
                          >
                            <LessonDot isCompleted={isCompleted} isCurrent={isCurrent} />
                            <span
                              className="flex-1 text-xs leading-snug"
                              style={{ color: isCurrent ? '#e8e9f0' : '#9ca3af' }}
                            >
                              {lesson.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSections.length === 0 && searchQuery.trim() && (
              <p className="text-center text-xs py-8 px-5" style={{ color: '#6b7280' }}>
                No lessons match &ldquo;{searchQuery}&rdquo;
              </p>
            )}
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-background edu-content-scroll">
          <div className="max-w-3xl mx-auto px-8 py-8">

            {/* Breadcrumb — Course > Section > Lesson (no ellipsis) */}
            <nav className="flex items-center gap-1.5 text-xs mb-7 flex-wrap" aria-label="breadcrumb">
              <Link
                to={courseUrl}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {courseTitle}
              </Link>
              {currentSection && (
                <>
                  <ChevronRight size={12} className="text-muted-foreground/50 flex-shrink-0" />
                  <span className="text-muted-foreground">{currentSection.title}</span>
                </>
              )}
              {currentLesson && (
                <>
                  <ChevronRight size={12} className="text-muted-foreground/50 flex-shrink-0" />
                  <span className="text-foreground font-medium">{currentLesson.title}</span>
                </>
              )}
            </nav>

            {currentLesson ? (
              <>
                {/* Title row */}
                <div className="flex items-start justify-between gap-4 mb-1">
                  <h1 className="text-2xl font-bold text-foreground leading-tight">
                    {currentLesson.title}
                  </h1>
                  <button
                    onClick={() => setBookmarked(b => !b)}
                    title={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'}
                    className="mt-1 flex-shrink-0 transition-colors"
                    style={{ color: bookmarked ? '#f59e0b' : '#9ca3af' }}
                  >
                    <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {/* Subtitle */}
                <p className="text-sm text-muted-foreground italic mb-6">
                  {currentLesson.type === 'video'
                    ? 'Watch the video below to continue learning.'
                    : "In this lesson, we'll explore the concepts in detail."}
                </p>

                {/* ── Engagement toolbar ──────────────────────────────────── */}
                <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-border flex-wrap">
                  <InteractionBar
                    contentType="course"
                    contentId={numericCourseId}
                    discussRef={discussRef as React.RefObject<HTMLElement>}
                  />
                  <button
                    onClick={() => setHighlightsOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Highlighter size={14} />
                    My Highlights
                  </button>
                </div>

                {/* Video placeholder */}
                {currentLesson.type === 'video' && (
                  <div className="aspect-video rounded-xl mb-8 flex items-center justify-center bg-muted">
                    <button
                      className="flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                      style={{ width: 64, height: 64, background: '#7c3aed' }}
                    >
                      <Play size={24} fill="white" className="text-white ml-1" />
                    </button>
                  </div>
                )}

                {/* Lesson content with highlight overlay */}
                {currentLesson.content ? (
                  <HighlightOverlay
                    contentType="course"
                    contentId={numericCourseId}
                    contentTitle={courseTitle}
                  >
                    <div
                      className="edu-lesson-content text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(currentLesson.content)) }}
                    />
                  </HighlightOverlay>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No content added for this lesson yet.
                  </p>
                )}

                {/* Course progress */}
                <div className="mt-10 mb-4 rounded-xl p-4 bg-muted/40">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium">Course Progress</span>
                    <span>
                      {completedCount}/{totalLessons} lessons &bull; {progressPercent}%
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5" />
                </div>

                {/* Navigation footer */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 border-t border-border">
                  <div className="flex gap-2">
                    {prevLesson && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => goToLesson(prevLesson.id)}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                      </Button>
                    )}
                    {nextLesson && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => goToLesson(nextLesson.id)}
                      >
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>

                  {completedLessonIds.includes(currentLesson.id) ? (
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-success/15 text-success">
                        <CheckCircle2 size={14} /> Lesson Completed
                      </span>
                      {nextLesson && (
                        <Button
                          size="sm"
                          onClick={() => goToLesson(nextLesson.id)}
                        >
                          Next Lesson <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      onClick={async () => {
                        await onMarkComplete(currentLesson.id);
                        if (nextLesson) goToLesson(nextLesson.id);
                      }}
                      disabled={isMarkingComplete}
                      className="bg-success hover:bg-success/90 text-success-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {isMarkingComplete ? 'Saving…' : 'Mark as Complete'}
                    </Button>
                  )}
                </div>

                {/* Discussion anchor */}
                <div ref={discussRef} className="mt-14 pt-6 border-t border-border">
                  <h3 className="text-base font-semibold text-foreground mb-1">Discussion</h3>
                  <p className="text-sm text-muted-foreground">
                    Questions about this lesson? Start a discussion.
                  </p>
                </div>
              </>
            ) : (
              <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                <BookOpen size={40} className="opacity-30" />
                <p className="text-sm">Select a lesson from the sidebar to begin.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Highlights slide-over */}
      <HighlightsPanel
        open={highlightsOpen}
        onClose={() => setHighlightsOpen(false)}
        contentType="course"
        contentId={numericCourseId}
        contentUrl={courseUrl}
        contentTitle={courseTitle}
      />

      <EduCourseStyles />
    </PublicLayout>
  );
};

// ─── Course Overview Skeleton ──────────────────────────────────────────────────

const CourseOverviewSkeleton = () => (
  <div className="max-w-7xl mx-auto">
    <Skeleton className="h-5 w-28 mb-6" />
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-5">
        <Skeleton className="w-full aspect-video rounded-xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="space-y-2 pt-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="w-full aspect-video rounded-xl" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

// ─── Main Page Component ───────────────────────────────────────────────────────

const CourseViewPage = () => {
  const { '*': wildcardPath } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  // ?learn=true is the only signal that should open the learning view for enrolled users.
  // Without it, always show the course detail page first (even when enrolled).
  const showLearn = searchParams.get('learn') === 'true';
  const courseId = extractSlugFromPath(wildcardPath);
  const { isAuthenticated } = useAuth();

  const { data: course, isLoading: courseLoading, isError: courseError } = usePublicCmsById(
    courseId,
    !!courseId,
    isPreview,
    'COURSE',
  );
  const numericCourseId = course?.id ?? 0;
  const { data: sections = [], isLoading: sectionsLoading } = useSectionsByCourse(
    numericCourseId,
    !!numericCourseId,
  );
  const { data: enrollment } = useMyEnrollment(numericCourseId, isAuthenticated && !!numericCourseId);
  const { mutate: enroll, isPending: enrolling } = useEnroll();
  const { mutateAsync: updateProgress, isPending: isMarkingComplete } = useUpdateProgress();
  const { data: allCoursesData } = usePublicCmsList({ type: 'COURSE', size: 20 });

  const isLoading = courseLoading || sectionsLoading;

  const bodyHeadings = useMemo(() => extractHeadings(course?.body), [course?.body]);

  const relatedCourses = useMemo((): CmsResponseDto[] => {
    const all = allCoursesData?.items ?? [];
    const others = all.filter(c => c.id !== numericCourseId);
    const sameCategory = others.filter(c => c.categoryId === course?.categoryId);
    const different = others.filter(c => c.categoryId !== course?.categoryId);
    return [...sameCategory, ...different].slice(0, 5);
  }, [allCoursesData, numericCourseId, course?.categoryId]);

  if (!courseId || courseError) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <h1 className="text-2xl font-bold text-foreground mb-4">Course Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The course you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link to="/">
            <Button>
              <ChevronLeft className="h-4 w-4 mr-2" /> Back to Home
            </Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <CourseOverviewSkeleton />
      </PublicLayout>
    );
  }

  const handleEnroll = () => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    enroll(numericCourseId, {
      onSuccess: () => {
        toast.success('Successfully enrolled in the course!', {
          description: 'You now have access to all course materials.',
        });
      },
      onError: () => {
        toast.error('Failed to enroll. Please try again.');
      },
    });
  };

  const isEnrolled = !!enrollment;
  const completedLessonIds: number[] = (enrollment?.completedLessons ?? []).map(l => l.id);
  const totalLessons = sections.reduce((acc, s) => acc + getAllLessons(s).length, 0);
  const progressPercent = totalLessons > 0
    ? Math.round((completedLessonIds.length / totalLessons) * 100)
    : Math.round((enrollment?.progress ?? 0) * 100);

  const title = course?.title ?? 'Untitled Course';
  const description = course?.description ?? '';
  // "Back to Course" goes to the plain course URL — no params means detail page shows.
  const thisCourseUrl = course ? buildCourseUrl(course) : '/';

  const handleMarkComplete = async (lessonId: number) => {
    if (!enrollment) return;
    const newCompleted = completedLessonIds.includes(lessonId)
      ? completedLessonIds
      : [...completedLessonIds, lessonId];
    const newProgress = totalLessons > 0 ? newCompleted.length / totalLessons : 0;
    await updateProgress({
      enrollmentId: enrollment.id,
      data: {
        completedLessonId: lessonId,
        progress: newProgress,
        status: newProgress >= 1 ? 'completed' : 'active',
      },
    });
    if (newProgress >= 1) {
      toast.success('Congratulations! You have completed the course!');
    }
  };

  // Only enter the learning view when ?learn=true is explicitly in the URL.
  // All other navigation (course cards, links, direct URL) shows the detail page first.
  if (isEnrolled && showLearn) {
    return (
      <CourseLearningPage
        courseTitle={title}
        courseUrl={thisCourseUrl}
        numericCourseId={numericCourseId}
        sections={sections}
        progressPercent={progressPercent}
        completedLessonIds={completedLessonIds}
        onMarkComplete={handleMarkComplete}
        isMarkingComplete={isMarkingComplete}
      />
    );
  }

  // ── Course overview page (pre-enrollment or ?overview=true) ───────────────
  const learningUrl = buildCourseUrl(course!);
  const courseTypeBadgeColor = course?.courseType === 'BYTE'
    ? 'bg-amber-500 text-white border-none'
    : 'bg-primary text-primary-foreground border-none';

  return (
    <PublicLayout>
      {/* Cancel the p-4 from PublicLayout so the hero can be full-width */}
      <div className="-m-4">

        {/* ── Gradient Hero ──────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden"
          style={{
            background: course?.thumbnailUrl
              ? undefined
              : 'linear-gradient(135deg, hsl(270 70% 12%) 0%, hsl(270 60% 32%) 55%, hsl(250 65% 28%) 100%)',
          }}
        >
          {/* Thumbnail as blurred hero background */}
          {course?.thumbnailUrl && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${course.thumbnailUrl})`, filter: 'blur(2px) brightness(0.35)', transform: 'scale(1.05)' }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
            </>
          )}

          <div className="relative max-w-6xl mx-auto px-6 pt-5 pb-8">
            {/* Back link */}
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm mb-5 hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >
              <ChevronLeft size={15} /> Back to Courses
            </Link>

            {/* Type + category row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {course?.courseType && (
                <Badge className={courseTypeBadgeColor}>{course.courseType}</Badge>
              )}
              {course?.categoryName && (
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {course.categoryName}
                </span>
              )}
              {isEnrolled && (
                <Badge className="bg-success text-success-foreground border-none ml-1">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Enrolled
                </Badge>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-3 max-w-2xl">
              {title}
            </h1>

            {/* Description */}
            {description && (
              <p className="text-base max-w-2xl mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {description}
              </p>
            )}

            {/* Topic chips (derived from category + courseType + bodyHeadings) */}
            {bodyHeadings.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {[course?.categoryName, course?.courseType]
                  .filter(Boolean)
                  .concat(bodyHeadings.slice(0, 4))
                  .slice(0, 6)
                  .map((chip, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
                    >
                      {chip}
                    </span>
                  ))}
              </div>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap gap-5 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {sections.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <BookOpen size={14} />
                  <span><strong className="text-white">{sections.length}</strong> section{sections.length !== 1 ? 's' : ''}</span>
                </span>
              )}
              {totalLessons > 0 && (
                <span className="flex items-center gap-1.5">
                  <FileText size={14} />
                  <span><strong className="text-white">{totalLessons}</strong> lesson{totalLessons !== 1 ? 's' : ''}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Globe size={14} /> Full lifetime access
              </span>
              <span className="flex items-center gap-1.5">
                <Award size={14} /> Certificate on completion
              </span>
            </div>
          </div>
        </div>

        {/* ── Two-column body ────────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">

          {/* ── LEFT: Sticky sidebar ────────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-4">

            {/* Enroll / Continue card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-md">
              <div className="p-5 space-y-4">
                {/* Price / status */}
                <div className="flex items-baseline gap-2">
                  {isEnrolled
                    ? <span className="text-xl font-bold text-success">Enrolled</span>
                    : <span className="text-xl font-bold text-primary">Free</span>}
                  <span className="text-sm text-muted-foreground">
                    {isEnrolled ? '— you have full access' : '— full access on enrollment'}
                  </span>
                </div>

                {/* CTA button */}
                {isEnrolled ? (
                  <Button
                    onClick={() => navigate(`${learningUrl}?learn=true`)}
                    className="w-full bg-success hover:bg-success/90 text-success-foreground font-semibold"
                    size="lg"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Resume Learning
                  </Button>
                ) : isAuthenticated ? (
                  <Button onClick={handleEnroll} className="w-full font-semibold" size="lg" disabled={enrolling}>
                    <GraduationCap className="h-4 w-4 mr-2" />
                    {enrolling ? 'Enrolling…' : 'Enroll Now — It\'s Free'}
                  </Button>
                ) : (
                  <Button onClick={() => navigate('/auth')} className="w-full font-semibold" size="lg">
                    <GraduationCap className="h-4 w-4 mr-2" /> Sign in to Enroll
                  </Button>
                )}

                {/* What's included */}
                <div className="pt-3 border-t border-border space-y-2 text-sm text-muted-foreground">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    This course includes
                  </p>
                  {totalLessons > 0 && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
                    </div>
                  )}
                  {sections.length > 0 && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                      {sections.length} section{sections.length !== 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary flex-shrink-0" /> Full lifetime access
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary flex-shrink-0" /> Certificate of completion
                  </div>
                </div>

                {/* Share */}
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Share this course</p>
                  <div className="flex items-center gap-2">
                    {[
                      { Icon: Facebook, color: '#1877F2' },
                      { Icon: Twitter, color: '#1DA1F2' },
                      { Icon: Linkedin, color: '#0A66C2' },
                      { Icon: Share2,   color: undefined  },
                    ].map(({ Icon, color }, i) => (
                      <Button key={i} size="icon" variant="outline" className="h-8 w-8 rounded-full">
                        <Icon className="h-3.5 w-3.5" style={color ? { color } : undefined} />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT: Main content ─────────────────────────────────────── */}
          <div className="space-y-8 min-w-0">

            {/* About */}
            {description && (
              <section>
                <h2 className="text-xl font-bold text-foreground mb-3">About This Course</h2>
                <p className="text-muted-foreground leading-relaxed">{description}</p>
              </section>
            )}

            {/* What you'll learn */}
            {bodyHeadings.length > 0 && (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-6">
                <h2 className="text-lg font-bold text-foreground mb-4">What You&apos;ll Learn</h2>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {bodyHeadings.map((h, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full body content */}
            {course?.body && (
              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">Course Overview</h2>
                <div
                  className="edu-lesson-content text-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(course.body)) }}
                />
              </section>
            )}

            {/* Course Content (syllabus) — replaces "Course Curriculum" */}
            {sections.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-bold text-foreground">Course Content</h2>
                  <span className="text-sm text-muted-foreground">
                    {sections.length} section{sections.length !== 1 ? 's' : ''} &bull; {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
                  </span>
                </div>
                <CourseSyllabusSidebar
                  sections={sections}
                  completedLessonIds={completedLessonIds}
                  isEnrolled={isEnrolled}
                  learningUrl={learningUrl}
                  fullWidth
                />
              </section>
            ) : course?.body ? (
              <section>
                <h2 className="text-xl font-bold text-foreground mb-3">Course Content</h2>
                <BodyCurriculumPreview
                  body={course.body}
                  isAuthenticated={isAuthenticated}
                  onSignIn={() => navigate('/auth')}
                />
              </section>
            ) : null}

            {/* Category, Type, Author — below Course Content */}
            {[course?.categoryName, course?.courseType, course?.createdByName].some(Boolean) && (
              <section className="flex flex-wrap gap-2.5">
                {[
                  { label: 'Category', value: course?.categoryName },
                  { label: 'Type',     value: course?.courseType },
                  { label: 'By',       value: course?.createdByName },
                ]
                  .filter(m => m.value)
                  .map(m => (
                    <div
                      key={m.label}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border bg-muted/40"
                    >
                      <span className="text-muted-foreground text-xs font-medium">{m.label}:</span>
                      <span className="font-semibold text-foreground">{m.value}</span>
                    </div>
                  ))}
              </section>
            )}

            {/* Related courses */}
            {relatedCourses.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-foreground">
                    {relatedCourses.some(c => c.categoryId === course?.categoryId) ? 'Related Courses' : 'More Courses'}
                  </h2>
                  <Link to="/" className="text-sm text-primary hover:underline">Explore all</Link>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {relatedCourses.slice(0, 6).map(rc => (
                    <Link key={rc.id} to={buildCourseUrl(rc)} className="group">
                      <div className="flex gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:shadow-sm transition-all bg-card">
                        <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
                          {rc.thumbnailUrl
                            ? <img src={rc.thumbnailUrl} alt={rc.title ?? ''} className="w-full h-full object-cover" />
                            : <GraduationCap className="h-5 w-5 text-primary/50" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {rc.title ?? 'Untitled'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {rc.categoryName && <span className="text-xs text-muted-foreground">{rc.categoryName}</span>}
                            {rc.blockCount != null && rc.blockCount > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {rc.blockCount} lesson{rc.blockCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

// ─── Educative course styles (scoped to learning page) ────────────────────────
const EduCourseStyles = () => (
  <style>{`
    .edu-sidebar-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
    }
    .edu-sidebar-scroll::-webkit-scrollbar { width: 4px; }
    .edu-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
    .edu-sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

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
    .edu-lesson-content a  { color: #2563eb; text-decoration: underline; }
    .edu-lesson-content a:hover { text-decoration: none; }
    .edu-lesson-content pre {
      background: #1e2028; color: #c9cad4;
      padding: 1.1rem 1.25rem; border-radius: 0.5rem;
      overflow-x: auto; margin-bottom: 1.25rem;
      font-family: 'Courier New', monospace; font-size: 0.875em; line-height: 1.6;
    }
    .edu-lesson-content code {
      font-family: 'Courier New', monospace;
      background: hsl(var(--muted)); color: hsl(var(--foreground));
      padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em;
    }
    .edu-lesson-content pre code { background: none; padding: 0; color: inherit; }
    .edu-lesson-content blockquote {
      border-left: 3px solid hsl(var(--primary)); padding: 0.5rem 1rem;
      margin: 1.25rem 0; background: hsl(var(--accent)/0.4);
      border-radius: 0 0.25rem 0.25rem 0;
    }
    .edu-lesson-content img { max-width: 100%; border-radius: 0.5rem; margin: 1.25rem 0; }
    .edu-lesson-content hr { margin: 1.75rem 0; border: none; border-top: 1px solid hsl(var(--border)); }
    .edu-lesson-content strong { font-weight: 600; }
  `}</style>
);

export default CourseViewPage;
