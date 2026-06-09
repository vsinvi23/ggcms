import { BookOpen, FileText, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecommendations } from '@/api/hooks/useProfile';
import type { RecommendedItem } from '@/api/types';

interface Props {
  limit?: number;
  onItemClick?: (item: RecommendedItem) => void;
}

export function RecommendedContent({ limit = 6, onItemClick }: Props) {
  const { data: items = [], isLoading } = useRecommendations(limit);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: limit }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No recommendations yet — update your learning profile to get personalised suggestions.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <RecommendationCard key={`${item.contentType}-${item.id}`} item={item} onClick={onItemClick} />
      ))}
    </div>
  );
}

function RecommendationCard({
  item,
  onClick,
}: {
  item: RecommendedItem;
  onClick?: (item: RecommendedItem) => void;
}) {
  return (
    <Card
      className={`relative overflow-hidden transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}
      onClick={() => onClick?.(item)}
    >
      {item.thumbnailUrl && (
        <div className="h-24 w-full overflow-hidden bg-muted">
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <CardContent className="p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {item.contentType === 'course' ? (
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-green-500" />
            )}
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {item.contentType}
            </Badge>
          </div>
          {item.score > 0 && (
            <div className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <Star className="h-3 w-3 fill-amber-500" />
              <span>For you</span>
            </div>
          )}
        </div>
        <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
