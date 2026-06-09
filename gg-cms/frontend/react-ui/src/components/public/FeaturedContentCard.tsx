import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowRight, Play, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CmsResponseDto } from '@/api/types';
import { cn } from '@/lib/utils';
import { buildArticleUrl, buildCourseUrl } from '@/lib/slug';

interface FeaturedContentCardProps {
  item: CmsResponseDto;
  featured?: boolean;
  className?: string;
}

export function FeaturedContentCard({ item, featured = false, className }: FeaturedContentCardProps) {
  const isArticle = item.type === 'ARTICLE';
  const isCourse = item.type === 'COURSE';
  const thumbnailUrl = item.thumbnailUrl || '';
  const linkPath = isArticle ? buildArticleUrl(item) : buildCourseUrl(item);

  if (featured) {
    return (
      <Link to={linkPath} className="block">
        <Card className={cn(
          'group overflow-hidden hover:shadow-2xl transition-all duration-500 h-full',
          'border-primary/20 bg-gradient-to-br from-card via-card to-primary/5',
          'hover:border-primary/40 relative',
          className
        )}>
          {/* Featured badge */}
          <div className="absolute top-4 right-4 z-10">
            <Badge className="bg-primary text-primary-foreground shadow-lg">
              <Sparkles className="w-3 h-3 mr-1" /> Featured
            </Badge>
          </div>

          <div className="grid md:grid-cols-2 gap-0">
            {/* Thumbnail */}
            <div className="relative aspect-video md:aspect-auto overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
              <img
                src={thumbnailUrl}
                alt={item.title || 'Featured content'}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/20 md:bg-gradient-to-l md:from-card/80 md:to-transparent" />
            </div>

            {/* Content */}
            <CardContent className="p-6 md:p-8 flex flex-col justify-center">
              <Badge variant="outline" className="w-fit mb-4">
                {isCourse ? (
                  <><Play className="w-3 h-3 mr-1" /> Course</>
                ) : (
                  <><BookOpen className="w-3 h-3 mr-1" /> Article</>
                )}
              </Badge>

              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2">
                {item.title || 'Untitled'}
              </h2>

              {item.description && (
                <p className="text-muted-foreground mb-6 line-clamp-3">
                  {item.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>

              <Button className="w-fit group/btn">
                {isCourse ? 'Start Learning' : 'Read Article'}
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardContent>
          </div>
        </Card>
      </Link>
    );
  }

  return (
    <Link to={linkPath}>
      <Card className={cn(
        'group overflow-hidden hover:shadow-xl transition-all duration-300 h-full',
        'border-border/50 hover:border-primary/30 bg-card',
        className
      )}>
        {/* Thumbnail */}
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10">
          <img
            src={thumbnailUrl}
            alt={item.title || 'Content thumbnail'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {/* Type badge */}
          <div className="absolute top-3 left-3">
            <Badge className="bg-background/90 backdrop-blur-sm text-foreground shadow-sm">
              {isCourse ? (
                <><Play className="w-3 h-3 mr-1" /> Course</>
              ) : (
                <><BookOpen className="w-3 h-3 mr-1" /> Article</>
              )}
            </Badge>
          </div>

          {/* Title overlay on image */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="font-bold text-white text-lg line-clamp-2 drop-shadow-lg">
              {item.title || 'Untitled'}
            </h3>
          </div>
        </div>

        <CardContent className="p-4 space-y-2">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
            <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              Read more <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
