import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, CheckCircle2, Highlighter, StickyNote,
  ArrowRight, GraduationCap, Star, Play,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useMyHighlights, useMyNotes, useMyFavourites } from '@/api/hooks/useEngagement';
import { EnrollmentDto, HighlightDto, NoteDto } from '@/api/types';

// ─── In-progress course card (same compact height as SmallContentCard) ────────

function InProgressCard({ e }: { e: EnrollmentDto }) {
  const navigate = useNavigate();
  const pct  = Math.round((e.progress ?? 0) * 100);
  const done = e.completedLessons?.length ?? 0;
  const url  = `/course/${e.course?.id ?? ''}`;

  return (
    <Link to={url}>
      <Card className="group h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="p-2 rounded-lg shrink-0 bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>

            {/* Text + progress */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                {e.course?.title ?? 'Untitled Course'}
              </h4>
              {/* Progress bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {done === 0 ? 'Start learning' : `Lesson ${done + 1} up next`}
              </p>
            </div>

            {/* Resume button */}
            <button
              onClick={ev => {
                ev.preventDefault();
                ev.stopPropagation();
                navigate(`${url}?learn=true`);
              }}
              title="Resume Learning"
              className="shrink-0 w-8 h-8 rounded-full bg-success text-white flex items-center justify-center shadow-sm hover:scale-110 active:scale-95 transition-all"
            >
              <Play size={11} fill="white" className="ml-0.5" />
            </button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Completed course card ─────────────────────────────────────────────────

function CompletedCard({ e }: { e: EnrollmentDto }) {
  const url = `/course/${e.course?.id ?? ''}`;
  return (
    <Link to={url} className="block h-full">
      <Card className="group h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-success/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="p-1 rounded bg-success/10">
              <CheckCircle2 className="h-3 w-3 text-success" />
            </div>
            <span className="text-xs font-medium text-success">Completed</span>
          </div>
          <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug mb-3">
            {e.course?.title ?? 'Untitled Course'}
          </h4>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
              <div className="h-full w-full rounded-full" style={{ background: '#22c55e' }} />
            </div>
            <span className="text-xs text-success tabular-nums w-7 text-right shrink-0">100%</span>
          </div>
          {e.completedAt && (
            <p className="text-xs text-muted-foreground">
              {new Date(e.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Highlight card ────────────────────────────────────────────────────────

const COLOR_BG: Record<string, string> = {
  yellow: 'rgba(250,204,21,0.2)',
  green:  'rgba(134,239,172,0.2)',
  blue:   'rgba(147,197,253,0.2)',
};

function HighlightCard({ h }: { h: HighlightDto }) {
  const bg = COLOR_BG[h.color ?? 'yellow'] ?? COLOR_BG.yellow;
  const url = h.contentSlug ? `/course/${h.contentSlug}` : '#';

  return (
    <Link to={url}>
      <Card className="group h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-amber-300/50">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Highlighter className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-600 truncate max-w-[140px]">
              {h.contentTitle ?? 'Highlight'}
            </span>
          </div>
          <p
            className="text-xs leading-relaxed line-clamp-3 px-2 py-1.5 rounded"
            style={{ background: bg }}
          >
            &ldquo;{h.text}&rdquo;
          </p>
          {h.note && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 flex items-center gap-1">
              <StickyNote className="h-3 w-3 flex-shrink-0" />
              {h.note}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Note card ─────────────────────────────────────────────────────────────

function NoteCard({ n }: { n: NoteDto }) {
  return (
    <Card className="h-full border-border/50">
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <StickyNote className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-xs font-medium text-indigo-600 capitalize">
            {n.contentType} note
          </span>
        </div>
        <p className="text-xs leading-relaxed line-clamp-4 text-foreground/80">
          {n.body}
        </p>
        <p className="text-[10px] text-muted-foreground mt-2">
          {new Date(n.updatedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[0, 1, 2].map(i => <Skeleton key={i} className="h-36 rounded-lg" />)}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyTabState({ icon: Icon, message, cta, ctaHref }: {
  icon: React.ElementType;
  message: string;
  cta?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
      <Icon className="h-10 w-10 opacity-20" />
      <p className="text-sm">{message}</p>
      {cta && ctaHref && (
        <Button variant="outline" size="sm" asChild>
          <Link to={ctaHref}>{cta}</Link>
        </Button>
      )}
    </div>
  );
}

// ─── Main section ──────────────────────────────────────────────────────────

export function UserLearningSection() {
  const { isAuthenticated, user } = useAuth();

  const { data: enrollments = [], isLoading: loadingEnrollments } = useMyEnrollments(isAuthenticated);
  const { data: highlightsData, isLoading: loadingHighlights } = useMyHighlights(0, 6);
  const { data: notesData, isLoading: loadingNotes } = useMyNotes(0, 6);
  const { data: savedData } = useMyFavourites(0, 6);

  if (!isAuthenticated) return null;

  const inProgress = enrollments.filter((e: EnrollmentDto) => e.status === 'active');
  const completed  = enrollments.filter((e: EnrollmentDto) => e.status === 'completed');
  const highlights = highlightsData?.items ?? [];
  const notes      = notesData?.items ?? [];
  const savedCount = savedData?.total ?? 0;

  // Always show the welcome section for authenticated users.
  // Individual tabs handle their own empty states.
  const defaultTab = inProgress.length > 0 ? 'inprogress'
    : completed.length > 0 ? 'completed'
    : notes.length > 0 || highlights.length > 0 ? 'notes'
    : 'inprogress'; // fresh user → encourage first enrolment

  return (
    <section className="max-w-5xl mx-auto w-full px-4">
      {/* ── Centered welcome header — educative-style ── */}
      <div className="flex flex-col items-center text-center mb-6 gap-3">
        {/* Avatar */}
        <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shadow-md ring-4 ring-primary/15">
          <span className="text-2xl font-bold text-primary-foreground select-none">
            {(user?.name?.charAt(0) ?? 'U').toUpperCase()}
          </span>
        </div>

        {/* Greeting + subtitle + My Library link */}
        <div className="relative w-full">
          <h2 className="text-2xl font-bold text-foreground">
            Welcome back, {user?.name?.split(' ')[0] ?? 'there'}!
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:flex"
          >
            <Link to="/my-learning">
              My Library <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>

        {/* My Library on mobile (below title) */}
        <Button variant="outline" size="sm" asChild className="sm:hidden">
          <Link to="/my-learning">
            My Library <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue={defaultTab}>
        {/* Tab bar */}
        <TabsList className="mb-4 flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border w-full justify-center rounded-none">
          <TabsTrigger
            value="inprogress"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-sm px-3 pb-2"
          >
            In Progress
            {inProgress.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {inProgress.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="completed"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-sm px-3 pb-2"
          >
            Completed
            {completed.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {completed.length}
              </Badge>
            )}
          </TabsTrigger>

          {savedCount > 0 && (
            <TabsTrigger
              value="saved"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-sm px-3 pb-2"
            >
              Saved
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {savedCount}
              </Badge>
            </TabsTrigger>
          )}

          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-sm px-3 pb-2"
          >
            Notes &amp; Highlights
            {(highlights.length + notes.length) > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {highlights.length + notes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── In Progress tab ── */}
        <TabsContent value="inprogress" className="mt-0">
          {loadingEnrollments ? (
            <CardSkeleton />
          ) : inProgress.length === 0 ? (
            <EmptyTabState
              icon={GraduationCap}
              message="No courses in progress. Enroll in a course to start learning."
              cta="Browse Courses"
              ctaHref="/explore/courses"
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">
                  {inProgress.length} course{inProgress.length !== 1 ? 's' : ''} in progress
                </p>
                {inProgress.length > 3 && (
                  <Link to="/my-learning" className="text-xs text-primary hover:underline flex items-center gap-1">
                    View All <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {/* flex-wrap + justify-center so 1 item centres, 2+ fill naturally */}
              <div className="flex flex-wrap justify-center gap-3">
                {inProgress.slice(0, 4).map(e => (
                  <div key={e.id} className="w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.33%-8px)] xl:w-[calc(25%-9px)]">
                    <InProgressCard e={e} />
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Completed tab ── */}
        <TabsContent value="completed" className="mt-0">
          {loadingEnrollments ? (
            <CardSkeleton />
          ) : completed.length === 0 ? (
            <EmptyTabState
              icon={CheckCircle2}
              message="No completed courses yet. Keep learning!"
              cta="Continue Learning"
              ctaHref="/explore/courses"
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">
                  {completed.length} course{completed.length !== 1 ? 's' : ''} completed
                </p>
                {completed.length > 3 && (
                  <Link to="/my-learning" className="text-xs text-primary hover:underline flex items-center gap-1">
                    View All <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {completed.slice(0, 4).map(e => (
                  <div key={e.id} className="w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.33%-8px)] xl:w-[calc(25%-9px)]">
                    <CompletedCard key={e.id} e={e} />
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Saved tab ── */}
        {savedCount > 0 && (
          <TabsContent value="saved" className="mt-0">
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
              <Star className="h-10 w-10 opacity-20" />
              <p className="text-sm">You have {savedCount} saved item{savedCount !== 1 ? 's' : ''}.</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/my-learning">View Saved Items <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Link>
              </Button>
            </div>
          </TabsContent>
        )}

        {/* ── Notes & Highlights tab ── */}
        <TabsContent value="notes" className="mt-0">
          {loadingHighlights || loadingNotes ? (
            <CardSkeleton />
          ) : highlights.length === 0 && notes.length === 0 ? (
            <EmptyTabState
              icon={StickyNote}
              message="No notes or highlights yet. Select text while reading a lesson to create a highlight."
            />
          ) : (
            <div className="space-y-4">
              {/* Recent highlights preview */}
              {highlights.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <Highlighter className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Recent Highlights</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {highlights.slice(0, 3).map(h => (
                      <HighlightCard key={h.id} h={h} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent notes preview */}
              {notes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <StickyNote className="h-4 w-4 text-indigo-500" />
                      <h3 className="text-sm font-semibold">Recent Notes</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {notes.slice(0, 3).map(n => (
                      <NoteCard key={n.id} n={n} />
                    ))}
                  </div>
                </div>
              )}

              {/* CTA to full page */}
              <div className="pt-1">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/notes-highlights" className="flex items-center gap-1.5">
                    <Highlighter className="h-3.5 w-3.5" />
                    View All Notes &amp; Highlights
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
