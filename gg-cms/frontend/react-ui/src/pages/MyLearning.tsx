import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { HomePersonalizationWidget } from '@/components/personalization/HomePersonalizationWidget';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GraduationCap,
  BookOpen,
  FileText,
  StickyNote,
  Clock,
  CheckCircle,
  PlayCircle,
  ArrowRight,
  Star,
  Trash2,
  ExternalLink,
  Highlighter,
} from 'lucide-react';
import { format } from 'date-fns';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useCmsList } from '@/api/hooks/useCms';
import { useAuth } from '@/contexts/AuthContext';
import { EnrollmentDto, CmsResponseDto } from '@/api/types';
import { useMyNotes, useDeleteNote, useMyFavourites, useToggleFavourite, useMyHighlights, useDeleteHighlight } from '@/api/hooks/useEngagement';
import { toast } from 'sonner';

// ── Enrolled Courses Tab ──────────────────────────────────────────────────────

function EnrolledCourses() {
  const navigate = useNavigate();
  const { data: enrollments = [], isLoading } = useMyEnrollments();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  const active = enrollments.filter((e: EnrollmentDto) => e.status === 'active');
  const completed = enrollments.filter((e: EnrollmentDto) => e.status === 'completed');

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <GraduationCap className="mx-auto h-14 w-14 mb-4 opacity-30" />
        <p className="text-lg font-medium">No courses enrolled yet</p>
        <p className="text-sm mt-1">Browse courses and enrol to start learning.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/courses')}>
          Browse Courses
        </Button>
      </div>
    );
  }

  const renderCard = (enrollment: EnrollmentDto) => {
    const courseTitle = enrollment.course?.title || `Course #${enrollment.course?.id ?? '?'}`;
    const progress = Math.round(enrollment.progress ?? 0);
    const isCompleted = enrollment.status === 'completed';

    return (
      <Card
        key={enrollment.id}
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => enrollment.course?.id && navigate(`/course/${enrollment.course.id}`)}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <Badge
              variant={isCompleted ? 'default' : 'secondary'}
              className={isCompleted ? 'bg-green-600' : ''}
            >
              {isCompleted ? (
                <><CheckCircle className="w-3 h-3 mr-1" />Completed</>
              ) : (
                <><PlayCircle className="w-3 h-3 mr-1" />In Progress</>
              )}
            </Badge>
          </div>

          <h3 className="font-semibold text-sm leading-tight mb-3 line-clamp-2">{courseTitle}</h3>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {enrollment.enrolledAt && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Enrolled {format(new Date(enrollment.enrolledAt), 'MMM d, yyyy')}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-primary" />
            In Progress ({active.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map(renderCard)}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Completed ({completed.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completed.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── My Articles Tab ───────────────────────────────────────────────────────────

function MyArticles() {
  const navigate = useNavigate();
  const { data: articlesData, isLoading } = useCmsList({ type: 'ARTICLE', size: 50 });
  const articles: CmsResponseDto[] = articlesData?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="mx-auto h-14 w-14 mb-4 opacity-30" />
        <p className="text-lg font-medium">No articles yet</p>
        <p className="text-sm mt-1">Articles you create or work on will appear here.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/articles/create')}>
          Create Article
        </Button>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    DRAFT: 'bg-yellow-100 text-yellow-800',
    REVIEW: 'bg-blue-100 text-blue-800',
    PUBLISHED: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <Card
          key={article.id}
          className="hover:shadow-sm transition-shadow cursor-pointer"
          onClick={() => navigate(`/articles`)}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-purple-500/10 rounded-lg flex-shrink-0">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{article.title ?? 'Untitled'}</p>
              {article.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{article.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {article.updatedAt
                  ? `Updated ${format(new Date(article.updatedAt), 'MMM d, yyyy')}`
                  : article.createdAt
                  ? `Created ${format(new Date(article.createdAt), 'MMM d, yyyy')}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[article.status] ?? 'bg-muted text-muted-foreground'}`}
              >
                {article.status}
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Notes Tab ────────────────────────────────────────────────────────────────

function Notes() {
  const { data, isLoading } = useMyNotes();
  const { mutateAsync: deleteNote } = useDeleteNote();
  const notes = data?.items ?? [];

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <StickyNote className="mx-auto h-14 w-14 mb-4 opacity-30" />
        <p className="text-lg font-medium">No notes yet</p>
        <p className="text-sm mt-1">Open any article or course and click "Notes" to add a personal note.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const linkPath = note.contentType === 'course'
          ? `/course/${note.contentId}`
          : `/article/${note.contentId}`;
        return (
          <Card key={note.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-500/10 rounded-lg flex-shrink-0">
                  <StickyNote className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {note.contentType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Updated {format(new Date(note.updatedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-3 leading-relaxed">{note.body}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                    <Link to={linkPath}>
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(note.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Favourites Tab ────────────────────────────────────────────────────────────

function Favourites() {
  const { data, isLoading } = useMyFavourites();
  const favourites = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (favourites.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Star className="mx-auto h-14 w-14 mb-4 opacity-30" />
        <p className="text-lg font-medium">No saved items yet</p>
        <p className="text-sm mt-1">Click "Save" on any article or course to bookmark it here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {favourites.map((fav) => {
        const linkPath = fav.contentType === 'course'
          ? `/course/${fav.contentId}`
          : `/article/${fav.contentId}`;
        const isArticle = fav.contentType === 'article';

        return (
          <FavouriteCard
            key={fav.id}
            id={fav.id}
            contentType={fav.contentType as 'article' | 'course'}
            contentId={fav.contentId}
            linkPath={linkPath}
            isArticle={isArticle}
            createdAt={fav.createdAt}
          />
        );
      })}
    </div>
  );
}

function FavouriteCard({
  contentType,
  contentId,
  linkPath,
  isArticle,
  createdAt,
}: {
  id: string;
  contentType: 'article' | 'course';
  contentId: number;
  linkPath: string;
  isArticle: boolean;
  createdAt: string;
}) {
  const { mutate: toggleFav, isPending } = useToggleFavourite(contentType, contentId);

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleFav(undefined, {
      onSuccess: () => toast.success('Removed from saved'),
      onError: () => toast.error('Failed to remove'),
    });
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={`p-2 rounded-lg ${isArticle ? 'bg-purple-500/10' : 'bg-primary/10'}`}>
            {isArticle
              ? <FileText className="w-5 h-5 text-purple-500" />
              : <BookOpen className="w-5 h-5 text-primary" />
            }
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600"
            onClick={handleRemove}
            disabled={isPending}
            title="Remove from saved"
          >
            <Star className="w-4 h-4 fill-amber-500" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs capitalize">{contentType}</Badge>
          <span className="text-xs text-muted-foreground">
            Saved {format(new Date(createdAt), 'MMM d, yyyy')}
          </span>
        </div>
        <Link to={linkPath} className="block">
          <span className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {contentType === 'article' ? `Article #${contentId}` : `Course #${contentId}`}
          </span>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <ExternalLink className="w-3 h-3" />
            View content
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Highlights Tab ────────────────────────────────────────────────────────────

function Highlights() {
  const { data, isLoading } = useMyHighlights();
  const highlights = data?.items ?? [];

  const colorClass: Record<string, string> = {
    yellow: 'bg-yellow-200 text-yellow-900 border-yellow-300',
    green:  'bg-green-200 text-green-900 border-green-300',
    blue:   'bg-blue-200 text-blue-900 border-blue-300',
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (highlights.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Highlighter className="mx-auto h-14 w-14 mb-4 opacity-30" />
        <p className="text-lg font-medium">No highlights yet</p>
        <p className="text-sm mt-1">Select text in any article or course to save a highlight.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {highlights.map((hl) => {
        // Use stored slug for deep link; fall back to numeric ID for legacy highlights
        const linkPath = hl.contentType === 'course'
          ? hl.contentSlug ? `/course/${hl.contentSlug}` : `/course/${hl.contentId}`
          : hl.contentSlug ? `/article/${hl.contentSlug}` : `/article/${hl.contentId}`;
        const cls = colorClass[hl.color] ?? colorClass['yellow'];

        return (
          <HighlightCard
            key={hl.id}
            id={hl.id}
            contentType={hl.contentType as 'article' | 'course'}
            contentId={hl.contentId}
            contentTitle={hl.contentTitle}
            text={hl.text}
            note={hl.note}
            color={cls}
            createdAt={hl.createdAt}
            linkPath={linkPath}
          />
        );
      })}
    </div>
  );
}

function HighlightCard({
  id,
  contentType,
  contentId,
  contentTitle,
  text,
  note,
  color,
  createdAt,
  linkPath,
}: {
  id: string;
  contentType: 'article' | 'course';
  contentId: number;
  contentTitle?: string;
  text: string;
  note?: string;
  color: string;
  createdAt: string;
  linkPath: string;
}) {
  const { mutate: deleteHighlight, isPending } = useDeleteHighlight(contentType, contentId);

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
            <Highlighter className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs capitalize">{contentType}</Badge>
              {contentTitle && (
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {contentTitle}
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(createdAt), 'MMM d, yyyy')}
              </span>
            </div>
            <span className={`text-sm px-1.5 py-0.5 rounded border ${color} line-clamp-2 leading-relaxed block`}>
              &ldquo;{text}&rdquo;
            </span>
            {note && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                <StickyNote className="w-3 h-3 flex-shrink-0 mt-0.5 text-indigo-500" />
                <span className="line-clamp-2 leading-relaxed">{note}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
              <Link to={linkPath}>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => deleteHighlight(id)}
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const MyLearning = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: enrollments = [] } = useMyEnrollments();
  const { data: articlesData } = useCmsList({ type: 'ARTICLE', size: 50 });

  const totalEnrolled = enrollments.length;
  const completedCourses = enrollments.filter((e: EnrollmentDto) => e.status === 'completed').length;
  const totalArticles = articlesData?.items?.length ?? 0;

  const stats = [
    {
      label: 'Enrolled Courses',
      value: totalEnrolled,
      icon: BookOpen,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Completed',
      value: completedCourses,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-600/10',
    },
    {
      label: 'My Articles',
      value: totalArticles,
      icon: FileText,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Learning</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.name ?? 'Learner'}! Track your courses, articles and notes.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${s.bg}`}>
                    <Icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Personalised Recommendations */}
        <HomePersonalizationWidget
          onItemClick={(item) =>
            navigate(item.contentType === 'course' ? `/course/${item.publicId}` : `/article/${item.publicId}`)
          }
        />

        {/* Tabs */}
        <Tabs defaultValue="courses">
          <TabsList>
            <TabsTrigger value="courses" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Enrolled Courses
              {totalEnrolled > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {totalEnrolled}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-2">
              <FileText className="w-4 h-4" />
              My Articles
              {totalArticles > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {totalArticles}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <StickyNote className="w-4 h-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="saved" className="gap-2">
              <Star className="w-4 h-4" />
              Saved
            </TabsTrigger>
            <TabsTrigger value="highlights" className="gap-2">
              <Highlighter className="w-4 h-4" />
              Highlights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="mt-4">
            <EnrolledCourses />
          </TabsContent>
          <TabsContent value="articles" className="mt-4">
            <MyArticles />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <Notes />
          </TabsContent>
          <TabsContent value="saved" className="mt-4">
            <Favourites />
          </TabsContent>
          <TabsContent value="highlights" className="mt-4">
            <Highlights />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MyLearning;
