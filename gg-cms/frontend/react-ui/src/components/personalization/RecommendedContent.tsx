import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePersonalizationFeed } from '@/api/hooks/useProfile';
import { useTrack } from '@/hooks/useTrack';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';
import { useImpression } from './useImpression';
import type { ContinueItem, RecommendedItem } from '@/api/types';

interface Props {
  limit?: number;
  onItemClick?: (item: RecommendedItem) => void;
}

const itemUrl = (item: RecommendedItem): string => {
  if (!item.slug) return `/${item.contentType}/${item.publicId}`;
  const ref = { slug: item.slug, title: item.title, categoryName: item.categoryName };
  return item.contentType === 'course' ? buildCourseUrl(ref) : buildArticleUrl(ref);
};

function ContinueCard({ item }: { item: ContinueItem }) {
  const tracker = useTrack();
  const progress = Math.min(100, Math.max(0, Math.round(item.progress)));
  const ref = useImpression<HTMLDivElement>(() => tracker.recImpression(item.recId, item.courseId, 'course', 0));
  return (
    <div ref={ref}>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <Badge variant="outline" className="text-[10px] font-bold">{item.reason}</Badge>
            <h3 className="truncate text-base font-bold">{item.courseTitle}</h3>
            {item.pathTitle && item.pathTotal !== undefined && (
              <p className="text-xs text-muted-foreground">
                {item.pathTitle}: {item.pathCompleted ?? 0} of {item.pathTotal} courses completed
              </p>
            )}
            <div
              role="progressbar"
              aria-label={`Progress in ${item.courseTitle}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link
              to={buildCourseUrl({ slug: item.courseSlug, title: item.courseTitle })}
              onClick={() => tracker.recClick(item.recId, item.courseId, 'course', 0)}
            >
              Continue <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RecommendationCard({ item, onItemClick }: { item: RecommendedItem; onItemClick?: (item: RecommendedItem) => void }) {
  const tracker = useTrack();
  const recId = item.recId ?? '';
  const position = item.position ?? 0;
  const ref = useImpression<HTMLDivElement>(() => {
    if (recId) tracker.recImpression(recId, item.id, item.contentType, position);
  });
  const Icon = item.contentType === 'course' ? BookOpen : FileText;

  return (
    <div ref={ref}>
      <Card className="relative h-full overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
        {item.thumbnailUrl && (
          <div className="h-24 w-full overflow-hidden bg-muted">
            <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
        )}
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] capitalize">{item.contentType}</Badge>
          </div>
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">
            <Link
              to={itemUrl(item)}
              className="after:absolute after:inset-0 focus-visible:outline-none"
              onClick={(e) => {
                if (recId) tracker.recClick(recId, item.id, item.contentType, position);
                if (onItemClick) {
                  e.preventDefault();
                  onItemClick(item);
                }
              }}
            >
              {item.title}
            </Link>
          </h3>
          {item.reason && (
            <Badge variant="outline" className="h-auto whitespace-normal px-1.5 py-0.5 text-left text-[10px] font-normal text-primary">
              {item.reason}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RecommendedContent({ limit = 6, onItemClick }: Props) {
  const { data: feed, isLoading, isError, refetch } = usePersonalizationFeed(limit);

  if (isLoading) {
    return (
      <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: limit }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !feed) {
    return (
      <div role="alert" className="rounded-lg border border-border p-4 text-center text-sm">
        <p className="text-muted-foreground">Recommendations could not be loaded.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!feed.continue && feed.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing to recommend yet. Update your learning profile or start a course to get suggestions.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {feed.coldStart && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Showing what is trending. Set your interests or start a course to personalise this list.
        </p>
      )}
      {feed.partial && (
        <p className="text-xs text-muted-foreground">Some signals were unavailable, so these suggestions may be less precise.</p>
      )}
      {feed.continue && <ContinueCard item={feed.continue} />}
      {feed.items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.map((item) => (
            <li key={`${item.contentType}-${item.id}`}>
              <RecommendationCard item={item} onItemClick={onItemClick} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
