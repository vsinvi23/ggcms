import { useParams, Link } from 'react-router-dom';
import { sanitizeHtml } from '@/lib/sanitize';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar, Bookmark, Share2, ChevronLeft,
  MessageSquare,
} from 'lucide-react';
import { useCmsById } from '@/api/hooks/useCms';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { CommentsSection } from '@/components/shared/CommentsSection';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const ArticleSkeleton = () => (
  <div className="min-h-screen bg-background">
    <div className="bg-primary/5 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {[0, 1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const ArticleViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const articleId = Number(id);

  const { data: article, isLoading: articleLoading, isError: articleError } = useCmsById(
    articleId,
    !!articleId,
  );

  if (!articleId || articleError) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <h1 className="text-2xl font-bold text-foreground mb-4">Article Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The article you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link to="/">
            <Button>
              <ChevronLeft className="h-4 w-4 mr-2" /> Back to Articles
            </Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  if (articleLoading) {
    return (
      <PublicLayout>
        <ArticleSkeleton />
      </PublicLayout>
    );
  }

  const title = article?.title ?? 'Untitled Article';
  const description = article?.description ?? '';
  const publishedAt = article?.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <PublicLayout>
      <ArticleStyles />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-primary/5 border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link
              to="/"
              className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Articles
            </Link>

            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
              {title}
            </h1>

            {description && (
              <p className="text-lg text-muted-foreground mb-6">{description}</p>
            )}

            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {publishedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {publishedAt}
                  </span>
                )}
                <div className="flex items-center gap-1 border-l border-border pl-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                    title="Save"
                  >
                    <Bookmark className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                    title="Share"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                    title="Discussion"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Thumbnail */}
          {article?.thumbnailUrl && (
            <div className="mb-8 rounded-xl overflow-hidden max-h-96">
              <img
                src={article.thumbnailUrl}
                alt={title}
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Article Body Content */}
          {article?.body ? (
            <div
              className="article-content text-foreground leading-relaxed mb-8"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(article.body)) }}
            />
          ) : (
            <div className="mb-8 p-8 border-2 border-dashed rounded-lg text-center text-muted-foreground">
              No content available for this article.
            </div>
          )}

          <Separator className="my-6" />

          {/* Comments Section */}
          <CommentsSection contentType="article" contentId={articleId} />
        </div>
      </div>
    </PublicLayout>
  );
};

// Prose styles injected once for the article body
const ArticleStyles = () => (
  <style>{`
    .article-content h1 { font-size: 2rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; line-height: 1.3; }
    .article-content h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; line-height: 1.35; }
    .article-content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.4; }
    .article-content p { margin-bottom: 1rem; line-height: 1.75; }
    .article-content ul { list-style-type: disc; margin-bottom: 1rem; padding-left: 1.75rem; }
    .article-content ol { list-style-type: decimal; margin-bottom: 1rem; padding-left: 1.75rem; }
    .article-content li { margin-bottom: 0.35rem; line-height: 1.7; }
    .article-content li > p { margin-bottom: 0; }
    .article-content blockquote { border-left: 4px solid hsl(var(--primary)); padding: 0.5rem 1rem; margin: 1.5rem 0; background: hsl(var(--muted)/0.4); border-radius: 0 0.25rem 0.25rem 0; }
    .article-content blockquote p { color: hsl(var(--muted-foreground)); font-style: italic; margin-bottom: 0; }
    .article-content pre { background: hsl(var(--muted)); padding: 1.25rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1.25rem; font-family: 'Courier New', Courier, monospace; font-size: 0.9em; line-height: 1.6; white-space: pre; }
    .article-content .code-block { margin-bottom: 1.25rem; border-radius: 0.5rem; overflow: hidden; border: 1px solid hsl(var(--border)); }
    .article-content .code-block pre { margin-bottom: 0; border-radius: 0; padding: 1.25rem; }
    .article-content .code-block-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 1rem; background: hsl(220 14% 86%); border-bottom: 1px solid hsl(var(--border)); font-size: 0.78rem; font-family: 'Courier New', Courier, monospace; }
    .dark .article-content .code-block-header { background: hsl(240 10% 20%); }
    .article-content .code-lang { font-weight: 700; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.06em; }
    .article-content .code-filename { color: hsl(var(--muted-foreground)); font-style: italic; }
    .article-content code { font-family: 'Courier New', Courier, monospace; background: hsl(var(--muted)); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
    .article-content pre code { background: none; padding: 0; font-size: inherit; white-space: pre; }
    .article-content figure { margin: 1.5rem 0; text-align: center; }
    .article-content figure img { margin: 0 auto; }
    .article-content figcaption { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin-top: 0.5rem; }
    .article-content img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0; display: block; }
    .article-content a { color: hsl(var(--primary)); text-decoration: underline; }
    .article-content a:hover { text-decoration: none; }
    .article-content hr { margin: 2rem 0; border: none; border-top: 1px solid hsl(var(--border)); }
  `}</style>
);

export default ArticleViewPage;
