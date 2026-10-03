import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, GraduationCap, FileText, Play, Layers, Search } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { SectionDto } from '@/api/types';
import { getCourseProgressState } from '@/lib/contentStateStore';

export interface PathNavCourse {
  id: number;
  title: string;
  courseUrl: string;
}

interface PathCourseNavigatorProps {
  pathTitle: string;
  pathSlug: string;
  courses: PathNavCourse[];
  currentCourseId: number;
  sections: SectionDto[];
  selectedLessonId: number | null;
  onSelectLesson: (lessonId: number | null) => void;
  completedLessonIds: number[];
}

export const PathCourseNavigator = ({
  pathTitle, pathSlug, courses, currentCourseId, sections, selectedLessonId, onSelectLesson, completedLessonIds,
}: PathCourseNavigatorProps) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const progressOf = (c: PathNavCourse) =>
    c.id === currentCourseId
      ? Math.round((completedLessonIds.length / Math.max(1, sections.flatMap(s => s.lessons ?? []).length)) * 100)
      : getCourseProgressState(c.id)?.progress ?? 0;
  const overall = courses.length ? Math.round(courses.reduce((a, c) => a + progressOf(c), 0) / courses.length) : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="space-y-2 border-b border-border pb-3">
        <Link to={`/learn/${pathSlug}`} className="flex items-start gap-2 group">
          <GraduationCap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <span className="text-sm font-bold text-foreground group-hover:text-primary leading-snug">{pathTitle}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Progress value={overall} className="h-1.5 flex-1" />
          <span className="text-[11px] font-semibold text-muted-foreground">{overall}%</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search modules & lessons..."
          className="w-full text-xs rounded-xl outline-none bg-background border border-border text-foreground placeholder:text-muted-foreground/60 pl-8 pr-3 py-1.5 focus:border-primary transition-colors"
        />
      </div>

      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {courses.filter(c => !q || c.title.toLowerCase().includes(q) || (c.id === currentCourseId && sections.some(s => s.title.toLowerCase().includes(q) || (s.lessons ?? []).some(l => l.title.toLowerCase().includes(q))))).map((c) => {
          const idx = courses.indexOf(c);
          const isCurrent = c.id === currentCourseId;
          const pct = progressOf(c);
          return (
            <div key={c.id} className={cn('rounded-xl border overflow-hidden', isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/60')}>
              {isCurrent ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs font-bold text-foreground truncate">{idx + 1}. {c.title}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                </div>
              ) : (
                <Link to={c.courseUrl} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50">
                  <span className="flex items-center gap-2 min-w-0">
                    {pct >= 100 ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                    <span className="text-xs font-semibold text-foreground truncate">{idx + 1}. {c.title}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}

              {isCurrent && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-border/40 pt-2">
                  <button
                    onClick={() => onSelectLesson(null)}
                    className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left', selectedLessonId === null ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-muted/50')}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" /> Course overview
                  </button>
                  {sections.map(sec => (
                    <div key={sec.id} className="space-y-0.5">
                      <p className="px-2.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground truncate">{sec.title}</p>
                      {(sec.lessons ?? []).filter(l => !q || l.title.toLowerCase().includes(q) || sec.title.toLowerCase().includes(q)).map(les => {
                        const done = completedLessonIds.includes(les.id);
                        const Icon = les.type === 'video' ? Play : FileText;
                        return (
                          <button
                            key={les.id}
                            onClick={() => onSelectLesson(les.id)}
                            aria-current={selectedLessonId === les.id ? 'step' : undefined}
                            className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left',
                              selectedLessonId === les.id ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted/50')}
                          >
                            {done ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> : <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate">{les.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
