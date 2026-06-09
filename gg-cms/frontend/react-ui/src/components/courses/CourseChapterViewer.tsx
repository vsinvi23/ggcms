import { useMemo, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  FileText,
  Clock,
  Layers,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { SectionDto, LessonDto } from '@/api/types';
import { useSectionsByCourse } from '@/api/hooks/useSections';

// ─── Snapshot types ───────────────────────────────────────────────────────────

interface SnapLesson {
  id: number;
  title: string;
  type: string;
  content: string;
  order: number;
}

interface SnapSection {
  id: number;
  title: string;
  description: string;
  order: number;
  lessons: SnapLesson[];
  childSections: SnapSection[];
}

// ─── Diff badge ───────────────────────────────────────────────────────────────

function DiffBadge({ state }: { state: 'new' | 'modified' }) {
  if (state === 'new') {
    return (
      <Badge className="text-[10px] py-0 h-4 bg-green-100 text-green-700 border-green-300 hover:bg-green-100">
        New
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">
      Modified
    </Badge>
  );
}

// ─── Lesson content viewer ────────────────────────────────────────────────────

interface LessonViewerProps {
  lesson: LessonDto;
  snapLesson?: SnapLesson;
  hasSnapshot: boolean;
}

function LessonViewer({ lesson, snapLesson, hasSnapshot }: LessonViewerProps) {
  const [open, setOpen] = useState(true);
  const html = lesson.content ? parseBodyToHtml(lesson.content) : '';

  const diffState = useMemo<'new' | 'modified' | null>(() => {
    if (!hasSnapshot) return null;
    if (!snapLesson) return 'new';
    if (snapLesson.content !== (lesson.content ?? '')) return 'modified';
    return null;
  }, [hasSnapshot, snapLesson, lesson.content]);

  return (
    <div
      className={cn(
        'border-b border-border/30 last:border-0',
        diffState === 'new' && 'bg-green-50/40',
        diffState === 'modified' && 'bg-amber-50/40',
      )}
    >
      {/* Lesson header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-4 flex-shrink-0" />
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        }
        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-medium">{lesson.title}</span>

        <div className="flex items-center gap-2 flex-shrink-0">
          {diffState && <DiffBadge state={diffState} />}
          {lesson.type && lesson.type !== 'text' && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 capitalize">
              {lesson.type}
            </Badge>
          )}
          {lesson.duration > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {lesson.duration}m
            </span>
          )}
          {lesson.content ? (
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" title="Has content" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" title="No content" />
          )}
        </div>
      </button>

      {/* Lesson content panel */}
      {open && (
        <div className="px-10 pb-4 pt-2 border-t border-border/20 bg-muted/5">
          {html ? (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">No content added for this lesson.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ghost lesson row (removed since snapshot) ────────────────────────────────

function RemovedLessonRow({ snap }: { snap: SnapLesson }) {
  return (
    <div className="border-b border-border/30 last:border-0 opacity-50">
      <div className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
        <div className="w-4 flex-shrink-0" />
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        <span className="flex-1 text-sm line-through text-red-500">{snap.title}</span>
        <Badge className="text-[10px] py-0 h-4 bg-red-100 text-red-600 border-red-300 hover:bg-red-100 flex-shrink-0">
          Removed
        </Badge>
      </div>
    </div>
  );
}

// ─── Sub-section viewer ───────────────────────────────────────────────────────

interface SubSectionViewerProps {
  section: SectionDto;
  collapsed: boolean;
  snapSection?: SnapSection;
  hasSnapshot: boolean;
  snapLessons: Map<number, SnapLesson>;
}

function SubSectionViewer({
  section,
  collapsed,
  snapSection,
  hasSnapshot,
  snapLessons,
}: SubSectionViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const lessons = section.lessons ?? [];
  const isExpanded = collapsed ? false : expanded;

  // Lessons removed since snapshot (in snapSection but not in current lessons)
  const currentLessonIds = new Set(lessons.map((l) => l.id));
  const removedLessons = hasSnapshot && snapSection
    ? (snapSection.lessons ?? []).filter((sl) => !currentLessonIds.has(sl.id))
    : [];

  const diffState = hasSnapshot && !snapSection ? 'new' : null;

  return (
    <div className={cn('border-l-2 border-border/40 ml-4', diffState === 'new' && 'bg-green-50/30')}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <BookOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        }
        <span className="flex-1 text-sm font-medium">{section.title}</span>
        {diffState && <DiffBadge state={diffState} />}
        <Badge variant="outline" className="text-xs">
          {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
        </Badge>
      </button>

      {isExpanded && (
        <div className="border-t border-border/20">
          {section.description && (
            <p className="px-4 py-2 text-xs text-muted-foreground italic border-b border-border/20">
              {section.description}
            </p>
          )}
          {lessons.length > 0 ? (
            lessons.map((lesson) => (
              <LessonViewer
                key={lesson.id}
                lesson={lesson}
                snapLesson={snapLessons.get(lesson.id)}
                hasSnapshot={hasSnapshot}
              />
            ))
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground italic">No lessons.</p>
          )}
          {removedLessons.map((sl) => (
            <RemovedLessonRow key={sl.id} snap={sl} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Top-level section viewer ─────────────────────────────────────────────────

interface SectionViewerProps {
  section: SectionDto;
  collapsed: boolean;
  snapSection?: SnapSection;
  hasSnapshot: boolean;
  snapSubSections: Map<number, SnapSection>;
  snapLessons: Map<number, SnapLesson>;
}

function SectionViewer({
  section,
  collapsed,
  snapSection,
  hasSnapshot,
  snapSubSections,
  snapLessons,
}: SectionViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const childSections = section.childSections ?? [];
  const lessons = section.lessons ?? [];
  const total = childSections.length + lessons.length;
  const isExpanded = collapsed ? false : expanded;

  // Sub-sections and lessons removed since snapshot
  const currentChildIds = new Set(childSections.map((s) => s.id));
  const removedChildren = hasSnapshot && snapSection
    ? (snapSection.childSections ?? []).filter((sc) => !currentChildIds.has(sc.id))
    : [];

  const currentLessonIds = new Set(lessons.map((l) => l.id));
  const removedLessons = hasSnapshot && snapSection
    ? (snapSection.lessons ?? []).filter((sl) => !currentLessonIds.has(sl.id))
    : [];

  const diffState = hasSnapshot && !snapSection ? 'new' : null;

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden', diffState === 'new' && 'border-green-300')}>
      {/* Section header */}
      <button
        className={cn(
          'w-full flex items-center gap-2 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left',
          diffState === 'new' && 'bg-green-50/60',
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
        {isExpanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        }
        <span className="flex-1 font-semibold text-sm">{section.title}</span>
        {diffState && <DiffBadge state={diffState} />}
        <Badge variant="secondary" className="text-xs">
          {total} item{total !== 1 ? 's' : ''}
        </Badge>
      </button>

      {/* Section body */}
      {isExpanded && (
        <div>
          {section.description && (
            <p className="px-4 py-2 text-sm text-muted-foreground italic border-b border-border/30 bg-muted/5">
              {section.description}
            </p>
          )}

          {/* Sub-sections */}
          {childSections.map((sub) => (
            <SubSectionViewer
              key={sub.id}
              section={sub}
              collapsed={false}
              snapSection={snapSubSections.get(sub.id)}
              hasSnapshot={hasSnapshot}
              snapLessons={snapLessons}
            />
          ))}
          {/* Removed sub-sections */}
          {removedChildren.map((sc) => (
            <div key={sc.id} className="border-l-2 border-red-200 ml-4 opacity-50">
              <div className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <BookOpen className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="flex-1 text-sm line-through text-red-500">{sc.title}</span>
                <Badge className="text-[10px] py-0 h-4 bg-red-100 text-red-600 border-red-300 hover:bg-red-100">
                  Removed
                </Badge>
              </div>
            </div>
          ))}

          {/* Direct lessons */}
          {lessons.map((lesson) => (
            <LessonViewer
              key={lesson.id}
              lesson={lesson}
              snapLesson={snapLessons.get(lesson.id)}
              hasSnapshot={hasSnapshot}
            />
          ))}
          {/* Removed direct lessons */}
          {removedLessons.map((sl) => (
            <RemovedLessonRow key={sl.id} snap={sl} />
          ))}

          {total === 0 && removedChildren.length === 0 && removedLessons.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground italic">
              No sub-chapters or lessons in this chapter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface CourseChapterViewerProps {
  courseId: number;
  snapshotJson?: string | null;
  diffLabel?: string;
}

/**
 * Read-only view of a course's chapter hierarchy for reviewers.
 * When snapshotJson is provided (from publishedChaptersSnapshot or reviewBaselineChapters),
 * each section/lesson is visually annotated with New / Modified / Removed badges.
 */
export function CourseChapterViewer({ courseId, snapshotJson, diffLabel }: CourseChapterViewerProps) {
  const { data: sections = [], isLoading } = useSectionsByCourse(courseId, !!courseId);
  const [allCollapsed, setAllCollapsed] = useState(false);

  // Parse snapshot once and build lookup maps
  const { snapSections, snapSubSections, snapLessons, hasSnapshot } = useMemo(() => {
    if (!snapshotJson) {
      return {
        snapSections: new Map<number, SnapSection>(),
        snapSubSections: new Map<number, SnapSection>(),
        snapLessons: new Map<number, SnapLesson>(),
        hasSnapshot: false,
      };
    }
    try {
      const parsed: SnapSection[] = JSON.parse(snapshotJson);
      const snapSections = new Map<number, SnapSection>();
      const snapSubSections = new Map<number, SnapSection>();
      const snapLessons = new Map<number, SnapLesson>();

      for (const s of parsed) {
        snapSections.set(s.id, s);
        for (const l of s.lessons ?? []) {
          snapLessons.set(l.id, l);
        }
        for (const cs of s.childSections ?? []) {
          snapSubSections.set(cs.id, cs);
          for (const l of cs.lessons ?? []) {
            snapLessons.set(l.id, l);
          }
        }
      }
      return { snapSections, snapSubSections, snapLessons, hasSnapshot: true };
    } catch {
      return {
        snapSections: new Map<number, SnapSection>(),
        snapSubSections: new Map<number, SnapSection>(),
        snapLessons: new Map<number, SnapLesson>(),
        hasSnapshot: false,
      };
    }
  }, [snapshotJson]);

  // Sections in snapshot but removed from current
  const currentSectionIds = useMemo(
    () => new Set(sections.map((s) => s.id)),
    [sections],
  );
  const removedSections = useMemo(
    () => hasSnapshot ? Array.from(snapSections.values()).filter((ss) => !currentSectionIds.has(ss.id)) : [],
    [hasSnapshot, snapSections, currentSectionIds],
  );

  // Count totals for summary bar
  const totalLessons = sections.reduce((acc, s) => {
    const direct = s.lessons?.length ?? 0;
    const nested = s.childSections?.reduce((a, cs) => a + (cs.lessons?.length ?? 0), 0) ?? 0;
    return acc + direct + nested;
  }, 0);
  const lessonsWithContent = sections.reduce((acc, s) => {
    const direct = s.lessons?.filter((l) => !!l.content).length ?? 0;
    const nested = s.childSections?.reduce(
      (a, cs) => a + (cs.lessons?.filter((l) => !!l.content).length ?? 0),
      0,
    ) ?? 0;
    return acc + direct + nested;
  }, 0);

  // Diff summary counts
  const diffCounts = useMemo(() => {
    if (!hasSnapshot) return null;
    let added = 0;
    let modified = 0;
    let removed = 0;

    // Count removed sections + their lessons
    for (const rs of removedSections) {
      removed++;
      removed += (rs.lessons?.length ?? 0);
      for (const cs of rs.childSections ?? []) {
        removed++;
        removed += (cs.lessons?.length ?? 0);
      }
    }

    for (const s of sections) {
      if (!snapSections.has(s.id)) {
        // New section + all its content
        added++;
        added += (s.lessons?.length ?? 0);
        for (const cs of s.childSections ?? []) {
          added++;
          added += (cs.lessons?.length ?? 0);
        }
      } else {
        // Check direct lessons
        const snapSec = snapSections.get(s.id)!;
        const snapLessonIds = new Set((snapSec.lessons ?? []).map((l) => l.id));
        for (const l of s.lessons ?? []) {
          if (!snapLessonIds.has(l.id)) {
            added++;
          } else {
            const snap = snapLessons.get(l.id);
            if (snap && snap.content !== (l.content ?? '')) modified++;
          }
        }
        removed += (snapSec.lessons ?? []).filter((sl) => !(s.lessons ?? []).some((l) => l.id === sl.id)).length;

        // Check sub-sections
        for (const cs of s.childSections ?? []) {
          if (!snapSubSections.has(cs.id)) {
            added++;
            added += (cs.lessons?.length ?? 0);
          } else {
            const snapCs = snapSubSections.get(cs.id)!;
            const snapCsLessonIds = new Set((snapCs.lessons ?? []).map((l) => l.id));
            for (const l of cs.lessons ?? []) {
              if (!snapCsLessonIds.has(l.id)) {
                added++;
              } else {
                const snap = snapLessons.get(l.id);
                if (snap && snap.content !== (l.content ?? '')) modified++;
              }
            }
            removed += (snapCs.lessons ?? []).filter((sl) => !(cs.lessons ?? []).some((l) => l.id === sl.id)).length;
          }
        }
      }
    }

    return { added, modified, removed };
  }, [hasSnapshot, sections, removedSections, snapSections, snapSubSections, snapLessons]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (sections.length === 0 && removedSections.length === 0) {
    return (
      <p className="text-center py-8 text-sm text-muted-foreground italic">
        No chapters have been added to this course.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary + toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            {sections.length} chapter{sections.length !== 1 ? 's' : ''} ·{' '}
            {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
            {totalLessons > 0 && (
              <span className={cn(
                'ml-1 font-medium',
                lessonsWithContent === totalLessons ? 'text-green-600' : 'text-amber-600',
              )}>
                ({lessonsWithContent}/{totalLessons} with content)
              </span>
            )}
          </p>
          {hasSnapshot && diffLabel && (
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">{diffLabel}</p>
          )}
          {diffCounts && (diffCounts.added > 0 || diffCounts.modified > 0 || diffCounts.removed > 0) && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Δ</span>
              {diffCounts.added > 0 && (
                <span className="ml-1 text-green-600 font-medium">+{diffCounts.added} new</span>
              )}
              {diffCounts.modified > 0 && (
                <span className="ml-1 text-amber-600 font-medium">~{diffCounts.modified} modified</span>
              )}
              {diffCounts.removed > 0 && (
                <span className="ml-1 text-red-500 font-medium">−{diffCounts.removed} removed</span>
              )}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs h-7"
          onClick={() => setAllCollapsed((v) => !v)}
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </Button>
      </div>

      {sections.map((section) => (
        <SectionViewer
          key={section.id}
          section={section}
          collapsed={allCollapsed}
          snapSection={snapSections.get(section.id)}
          hasSnapshot={hasSnapshot}
          snapSubSections={snapSubSections}
          snapLessons={snapLessons}
        />
      ))}

      {/* Ghost rows for sections removed since snapshot */}
      {removedSections.map((rs) => (
        <div key={rs.id} className="border border-red-200 rounded-lg overflow-hidden opacity-50">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50/50">
            <Layers className="w-4 h-4 text-red-400 flex-shrink-0" />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 font-semibold text-sm line-through text-red-500">{rs.title}</span>
            <Badge className="text-[10px] py-0 h-4 bg-red-100 text-red-600 border-red-300 hover:bg-red-100">
              Removed
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
