import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Search, ChevronDown, ChevronRight, LayoutList, Play, FileText, CheckCircle2, Layers } from 'lucide-react';
import { SectionDto, LessonDto } from '@/api/types';

export interface ModuleLessonNavigatorProps {
  sections: SectionDto[];
  selectedLessonId: number | null;
  onSelectLesson: (lessonId: number | null) => void;
  completedLessonIds: number[];
  title?: string;
  categoryName?: string;
  className?: string;
}

export const ModuleLessonNavigator: React.FC<ModuleLessonNavigatorProps> = ({
  sections,
  selectedLessonId,
  onSelectLesson,
  completedLessonIds,
  title = 'Modules & Lessons',
  categoryName,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<number[]>([]);

  // Expand all sections by default once sections load
  React.useEffect(() => {
    if (sections.length > 0 && expandedSections.length === 0) {
      setExpandedSections(sections.map(s => s.id));
    }
  }, [sections]);

  const toggleSection = (id: number) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const allLessons = useMemo(() => sections.flatMap(s => s.lessons ?? []), [sections]);
  const totalLessons = allLessons.length;
  const completedCount = useMemo(() => {
    return allLessons.filter(l => completedLessonIds.includes(l.id)).length;
  }, [allLessons, completedLessonIds]);

  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const remainingCount = Math.max(0, totalLessons - completedCount);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections
      .map(sec => ({
        ...sec,
        lessons: (sec.lessons ?? []).filter(
          l =>
            l.title.toLowerCase().includes(query) ||
            (l.content && l.content.toLowerCase().includes(query)) ||
            (l.summary && l.summary.toLowerCase().includes(query)) ||
            (sec.title && sec.title.toLowerCase().includes(query)) ||
            (sec.description && sec.description.toLowerCase().includes(query))
        ),
      }))
      .filter(sec => sec.lessons.length > 0 || (sec.title && sec.title.toLowerCase().includes(query)));
  }, [sections, searchQuery]);

  return (
    <div className={cn('bg-card border border-border rounded-2xl p-4 space-y-3.5 shadow-2xs', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-500" />
          {title}
        </span>
        <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
          {completedCount} / {totalLessons} Completed
        </span>
      </div>

      {/* Status Legend */}
      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground px-2.5 py-1.5 bg-muted/40 rounded-lg">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" /> Completed ({completedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-muted border border-border shrink-0" /> Remaining ({remainingCount})
        </span>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search modules & lessons..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-xs rounded-xl outline-none bg-background border border-border text-foreground placeholder:text-muted-foreground/60 pl-8 pr-3 py-1.5 focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Overview Button & Section Tree */}
      <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
        <button
          onClick={() => onSelectLesson(null)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all text-left',
            selectedLessonId === null
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500 ring-offset-2 ring-offset-background font-extrabold'
              : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/50'
          )}
        >
          <LayoutList className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="truncate">Course Overview & Syllabus</span>
        </button>

        {filteredSections.map((section, secIdx) => {
          const isOpen = searchQuery.trim() !== '' || expandedSections.includes(section.id);
          const sectionLessons = section.lessons ?? [];
          const sectionDone = sectionLessons.filter(l => completedLessonIds.includes(l.id)).length;

          return (
            <div key={section.id || secIdx} className="rounded-xl border border-border/60 overflow-hidden bg-card/60">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                  <span className="text-xs font-bold text-foreground truncate">
                    {section.title || `Module ${secIdx + 1}`}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground shrink-0 bg-muted/60 px-1.5 py-0.5 rounded-full">
                  {sectionDone}/{sectionLessons.length}
                </span>
              </button>

              {/* Lessons List inside Section */}
              {isOpen && sectionLessons.length > 0 && (
                <div className="px-2 pb-2 space-y-1 pt-1 border-t border-border/40 bg-background/50">
                  {sectionLessons.map((lesson, lIdx) => {
                    const isCompleted = completedLessonIds.includes(lesson.id);
                    const isCurrent = selectedLessonId === lesson.id;
                    const TypeIcon = lesson.type === 'video' ? Play : FileText;

                    return (
                      <button
                        key={lesson.id || lIdx}
                        onClick={() => onSelectLesson(lesson.id)}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all text-left relative select-none',
                          isCurrent
                            ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background font-extrabold z-10 border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : isCompleted
                            ? 'border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <div
                            className={cn(
                              'w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                              isCompleted
                                ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:border-blue-500'
                                : 'border-muted-foreground/40 bg-background'
                            )}
                          >
                            {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>

                          <span className="text-xs truncate">{lesson.title}</span>
                        </div>

                        <TypeIcon className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredSections.length === 0 && searchQuery.trim() && (
          <p className="text-center text-xs py-4 text-muted-foreground">
            No lessons match &ldquo;{searchQuery}&rdquo;
          </p>
        )}
      </div>

      {/* Progress Footer */}
      <div className="pt-2 border-t border-border space-y-1.5">
        <Progress value={progressPercent} className="h-1.5 bg-muted" />
        <p className="text-[10px] text-muted-foreground text-center font-medium">
          Click any lesson to open & start learning.
        </p>
      </div>
    </div>
  );
};
