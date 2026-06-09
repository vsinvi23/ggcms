import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMyHighlights,
  useMyNotes,
  useDeleteHighlight,
  useDeleteNote,
} from '@/api/hooks/useEngagement';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Highlighter,
  StickyNote,
  Trash2,
  ExternalLink,
  Calendar,
  ChevronDown,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { HighlightDto, NoteDto } from '@/api/types';

// ─── Constants ─────────────────────────────────────────────────────────────

const COLOR_BG: Record<string, string> = {
  yellow: 'rgba(250,204,21,0.30)',
  green:  'rgba(134,239,172,0.30)',
  blue:   'rgba(147,197,253,0.30)',
};
const COLOR_ICON: Record<string, string> = {
  yellow: '#92400e',
  green:  '#166534',
  blue:   '#1e40af',
};
const COLOR_ICON_BG: Record<string, string> = {
  yellow: 'rgba(250,204,21,0.25)',
  green:  'rgba(134,239,172,0.25)',
  blue:   'rgba(147,197,253,0.25)',
};

function fmtDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Highlight row ──────────────────────────────────────────────────────────

function HighlightRow({
  h,
  onDelete,
}: {
  h: HighlightDto;
  onDelete: (id: string) => void;
}) {
  const color = (h.color as keyof typeof COLOR_BG) ?? 'yellow';
  const bg       = COLOR_BG[color]      ?? COLOR_BG.yellow;
  const iconColor= COLOR_ICON[color]    ?? COLOR_ICON.yellow;
  const iconBg   = COLOR_ICON_BG[color] ?? COLOR_ICON_BG.yellow;
  const courseUrl = h.contentSlug ? `/course/${h.contentSlug}` : null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Date + action row */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border"
        style={{ background: 'hsl(var(--muted)/0.4)' }}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          {fmtDate(h.createdAt)}
        </div>
        <div className="flex items-center gap-0.5">
          {courseUrl && (
            <Link
              to={courseUrl}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title="View in course"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </Link>
          )}
          <button
            onClick={() => onDelete(h.id)}
            className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
            title="Delete highlight"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex items-start gap-3 p-4">
        {/* Colored icon */}
        <span
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
          style={{ background: iconBg }}
        >
          <Highlighter className="h-3.5 w-3.5" style={{ color: iconColor }} />
        </span>

        <div className="flex-1 min-w-0">
          {/* Highlighted text */}
          <p
            className="text-sm leading-relaxed rounded px-2 py-1"
            style={{ background: bg }}
          >
            {h.text}
          </p>

          {/* Attached note */}
          {h.note && (
            <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
              <StickyNote className="h-3 w-3 flex-shrink-0 mt-0.5 text-indigo-400" />
              <span className="italic">{h.note}</span>
            </p>
          )}

          {/* Source */}
          {h.contentTitle && (
            <p className="text-xs text-muted-foreground mt-2 italic">
              From{' '}
              {courseUrl ? (
                <Link to={courseUrl} className="text-primary hover:underline not-italic font-medium">
                  {h.contentTitle}
                </Link>
              ) : (
                <span className="not-italic font-medium">{h.contentTitle}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Note row ───────────────────────────────────────────────────────────────

function NoteRow({ n, onDelete }: { n: NoteDto; onDelete: (id: string) => void }) {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border"
        style={{ background: 'hsl(var(--muted)/0.4)' }}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          {fmtDate(n.updatedAt)}
        </div>
        <button
          onClick={() => onDelete(n.id)}
          className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
          title="Delete note"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      <div className="flex items-start gap-3 p-4">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
          <StickyNote className="h-3.5 w-3.5 text-indigo-600" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed text-foreground">{n.body}</p>
          <p className="text-xs text-muted-foreground mt-2 capitalize italic">
            {n.contentType} note
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton list ──────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

type SortOrder = 'newest' | 'oldest';
type CourseFilter = 'all' | string;

export default function NotesHighlightsPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [sort, setSort] = useState<SortOrder>('newest');
  const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');

  // Fetch all in large pages for the full list view
  const { data: highlightsData, isLoading: loadingH } = useMyHighlights(0, 100);
  const { data: notesData,      isLoading: loadingN } = useMyNotes(0, 100);
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);

  const { mutateAsync: deleteHighlight } = useDeleteHighlight('course', 0);
  const { mutateAsync: deleteNote }      = useDeleteNote();

  const highlights = useMemo(() => highlightsData?.items ?? [], [highlightsData]);
  const notes      = useMemo(() => notesData?.items      ?? [], [notesData]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth');
  }, [isAuthenticated, navigate]);

  // Build course list for sidebar from highlights + enrollments
  const courseNames = useMemo(() => {
    const fromHighlights = highlights
      .map(h => h.contentTitle)
      .filter((t): t is string => !!t);
    const fromEnrollments = enrollments
      .map(e => e.course?.title)
      .filter((t): t is string => !!t);
    return [...new Set([...fromHighlights, ...fromEnrollments])].sort();
  }, [highlights, enrollments]);

  // Filtered + sorted items
  const filteredHighlights = useMemo(() => {
    let items = [...highlights];
    if (courseFilter !== 'all') {
      items = items.filter(h => h.contentTitle === courseFilter);
    }
    items.sort((a, b) => {
      const da = new Date(a.createdAt ?? 0).getTime();
      const db = new Date(b.createdAt ?? 0).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return items;
  }, [highlights, courseFilter, sort]);

  const filteredNotes = useMemo(() => {
    const items = [...notes];
    items.sort((a, b) => {
      const da = new Date(a.updatedAt).getTime();
      const db = new Date(b.updatedAt).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return items;
  }, [notes, sort]);

  const allItems = useMemo(() => {
    type AnyItem = { _type: 'h'; data: HighlightDto } | { _type: 'n'; data: NoteDto };
    const merged: AnyItem[] = [
      ...filteredHighlights.map(h => ({ _type: 'h' as const, data: h })),
      ...filteredNotes.map(n => ({ _type: 'n' as const, data: n })),
    ];
    merged.sort((a, b) => {
      const da = a._type === 'h'
        ? new Date(a.data.createdAt ?? 0).getTime()
        : new Date((a.data as NoteDto).updatedAt).getTime();
      const db = b._type === 'h'
        ? new Date(b.data.createdAt ?? 0).getTime()
        : new Date((b.data as NoteDto).updatedAt).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return merged;
  }, [filteredHighlights, filteredNotes, sort]);

  if (!isAuthenticated) return null;

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlight(id);
      toast.success('Highlight deleted');
    } catch {
      toast.error('Failed to delete highlight');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const totalCount = allItems.length;
  const isLoading = loadingH || loadingN;

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">My Notes and Highlights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All your notes and highlights are saved here.{' '}
            <span className="text-primary">You can access them at any point you want to.</span>
          </p>
        </div>

        <div className="flex gap-6 items-start">
          {/* ── Left sidebar ── */}
          <aside className="w-52 flex-shrink-0 hidden md:block">
            <div className="space-y-1">
              {/* All content */}
              <button
                onClick={() => setCourseFilter('all')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-muted"
              >
                <span
                  className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={{
                    borderColor: courseFilter === 'all' ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  }}
                >
                  {courseFilter === 'all' && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: 'hsl(var(--primary))' }}
                    />
                  )}
                </span>
                <span className={courseFilter === 'all' ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                  All Content
                </span>
              </button>

              {/* Courses */}
              {courseNames.length > 0 && (
                <div className="mt-3">
                  <p className="px-3 py-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
                    Courses
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {courseNames.map(name => (
                      <button
                        key={name}
                        onClick={() => setCourseFilter(name)}
                        className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className="w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center"
                          style={{
                            borderColor: courseFilter === name ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                          }}
                        >
                          {courseFilter === name && (
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: 'hsl(var(--primary))' }}
                            />
                          )}
                        </span>
                        <span
                          className={`leading-snug line-clamp-2 ${
                            courseFilter === name
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">
            <Tabs defaultValue="all">
              {/* Tab bar + sort/count row */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <TabsList className="bg-transparent p-0 h-auto gap-0 border-b border-border w-auto">
                  {[
                    { value: 'all',        label: 'All',        count: totalCount },
                    { value: 'highlights', label: 'Highlights', count: filteredHighlights.length, icon: Highlighter },
                    { value: 'notes',      label: 'Notes',      count: filteredNotes.length,      icon: StickyNote  },
                  ].map(({ value, label, count, icon: Icon }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-sm px-3 pb-2 flex items-center gap-1.5"
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex items-center gap-3">
                  {!isLoading && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Showing <span className="font-semibold text-foreground">{totalCount}</span> item{totalCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <Select value={sort} onValueChange={(v) => setSort(v as SortOrder)}>
                    <SelectTrigger className="h-8 text-xs w-36 gap-1">
                      <span className="text-muted-foreground">Sort by:</span>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── All tab ── */}
              <TabsContent value="all" className="mt-0">
                {isLoading ? (
                  <ListSkeleton />
                ) : allItems.length === 0 ? (
                  <EmptyState
                    icon={Highlighter}
                    title="No notes or highlights yet"
                    description="Select text while reading a lesson to create a highlight, or use the Notes button to add a personal note."
                  />
                ) : (
                  <div className="space-y-3">
                    {allItems.map((item, idx) =>
                      item._type === 'h' ? (
                        <HighlightRow key={`h-${item.data.id}-${idx}`} h={item.data} onDelete={handleDeleteHighlight} />
                      ) : (
                        <NoteRow key={`n-${item.data.id}-${idx}`} n={item.data as NoteDto} onDelete={handleDeleteNote} />
                      ),
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Highlights tab ── */}
              <TabsContent value="highlights" className="mt-0">
                {loadingH ? (
                  <ListSkeleton />
                ) : filteredHighlights.length === 0 ? (
                  <EmptyState
                    icon={Highlighter}
                    title="No highlights yet"
                    description="Select any text while reading a lesson to create a highlight."
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredHighlights.map(h => (
                      <HighlightRow key={h.id} h={h} onDelete={handleDeleteHighlight} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Notes tab ── */}
              <TabsContent value="notes" className="mt-0">
                {loadingN ? (
                  <ListSkeleton />
                ) : filteredNotes.length === 0 ? (
                  <EmptyState
                    icon={StickyNote}
                    title="No notes yet"
                    description='Use the "Notes" button while viewing a lesson to add personal notes.'
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredNotes.map(n => (
                      <NoteRow key={n.id} n={n} onDelete={handleDeleteNote} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/20" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/explore/courses">
          <BookOpen className="h-4 w-4 mr-2" /> Browse Courses
        </Link>
      </Button>
    </div>
  );
}
