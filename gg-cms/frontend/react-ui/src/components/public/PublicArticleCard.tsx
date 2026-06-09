import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CmsResponseDto } from '@/api/types';
import { buildArticleUrl } from '@/lib/slug';
import { ArticlePreviewModal } from './ArticlePreviewModal';

interface PublicArticleCardProps {
  article: CmsResponseDto;
  className?: string;
}

export function PublicArticleCard({ article, className }: PublicArticleCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const articleUrl = buildArticleUrl(article);
  const typeLabel  = article.articleType ?? 'Article';
  const readMin    = Math.max(1, (article.blockCount ?? 0) > 0 ? (article.blockCount ?? 0) * 2 : 5);

  return (
    <>
      <Link to={articleUrl} className={className}>
        <Card className="group h-full cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Icon — thumbnail or file icon */}
              <div className="p-2 rounded-lg shrink-0 text-purple-500 bg-purple-500/10">
                {article.thumbnailUrl ? (
                  <img
                    src={article.thumbnailUrl}
                    alt=""
                    className="w-4 h-4 object-cover rounded"
                  />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                  {article.title || 'Untitled'}
                </h4>
                {article.categoryName && (
                  <p className="text-xs text-muted-foreground mt-1">{article.categoryName}</p>
                )}
                {article.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {article.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{readMin} min read</span>
                  {article.categoryName && (
                    <span className="text-xs text-muted-foreground">· {typeLabel}</span>
                  )}
                </div>
              </div>

              {/* Round preview button — same position as the course enroll button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreviewOpen(true);
                }}
                title="Preview article"
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 active:scale-95 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
              >
                <Eye size={13} />
              </button>
            </div>
          </CardContent>
        </Card>
      </Link>

      <ArticlePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        article={article}
      />
    </>
  );
}
