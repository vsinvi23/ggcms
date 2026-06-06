import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, BookOpen, Play } from 'lucide-react';
import { CmsResponseDto } from '@/api/types';
import { cn } from '@/lib/utils';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';

interface ContentCardProps {
  item: CmsResponseDto;
  className?: string;
}

export function ContentCard({ item, className }: ContentCardProps) {
  const isArticle = item.type === 'ARTICLE';
  const isCourse = item.type === 'COURSE';
  const thumbnailUrl = item.thumbnailUrl || '';
  
  const linkPath = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);

  return (
    <Link to={linkPath}>
      <Card className={cn(
        'group overflow-hidden hover:shadow-lg transition-all duration-300 h-full',
        'border-border/50 hover:border-primary/30',
        className
      )}>
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5">
          <img
            src={thumbnailUrl}
            alt={item.title || 'Content thumbnail'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              // Hide broken image and show gradient background
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Type badge overlay */}
          <div className="absolute top-3 left-3">
            <Badge 
              variant="secondary" 
              className="bg-background/90 backdrop-blur-sm text-foreground shadow-sm"
            >
              {isCourse ? (
                <><Play className="w-3 h-3 mr-1" /> Course</>
              ) : (
                <><BookOpen className="w-3 h-3 mr-1" /> Article</>
              )}
            </Badge>
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Category */}
          {item.categoryName && (
            <span className="text-xs font-medium text-primary/70 uppercase tracking-wide">{item.categoryName}</span>
          )}

          {/* Title */}
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {item.title || 'Untitled'}
          </h3>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
