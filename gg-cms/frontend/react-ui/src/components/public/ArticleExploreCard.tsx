import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText } from 'lucide-react';
import { CmsResponseDto } from '@/api/types';
import { cn } from '@/lib/utils';
import { buildArticleUrl } from '@/lib/slug';

interface ArticleExploreCardProps {
  item: CmsResponseDto;
  className?: string;
}

export function ArticleExploreCard({ item, className }: ArticleExploreCardProps) {
  const blockCount = item.blockCount ?? 0;
  const readMinutes = Math.max(1, blockCount > 0 ? blockCount * 2 : 3);

  return (
    <Link to={buildArticleUrl(item)}>
      <Card
        className={cn(
          'group overflow-hidden hover:shadow-md transition-all duration-200',
          'border-border/50 hover:border-primary/30 h-full',
          className,
        )}
      >
        <div className="flex h-full">
          {/* Thumbnail — fixed narrow column */}
          <div className="relative w-20 flex-shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 min-h-[100px]">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title || 'Article'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <FileText className="w-6 h-6 text-primary/25" />
              </div>
            )}
          </div>

          {/* Content */}
          <CardContent className="flex-1 min-w-0 py-2.5 px-3 flex flex-col gap-1.5">
            {/* Category + title */}
            <div>
              {item.categoryName && (
                <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide block truncate">
                  {item.categoryName}
                </span>
              )}
              <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                {item.title || 'Untitled'}
              </h3>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug flex-1">
                {item.description}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-auto">
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {readMinutes} min read
              </Badge>
              <span className="ml-auto">
                {item.publishedAt
                  ? new Date(item.publishedAt).toLocaleDateString()
                  : new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
