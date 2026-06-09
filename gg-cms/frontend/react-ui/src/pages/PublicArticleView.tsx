import { useRef, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { extractSlugFromPath } from '@/lib/slug';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsById, usePublicCmsBody } from '@/api/hooks/usePublicCms';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  Calendar,
  User,
  Share2,
  ArrowLeft,
  ChevronRight,
  BookOpen,
  Highlighter,
} from 'lucide-react';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';

function ArticleSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-6 w-full" />
      <div className="flex gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="space-y-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function PublicArticleView() {
  const { '*': wildcardPath } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  // Wildcard captures "slug" or "category/slug" — always use the last segment
  const articleId = extractSlugFromPath(wildcardPath);
  const discussRef = useRef<HTMLDivElement>(null);
  const [highlightsPanelOpen, setHighlightsPanelOpen] = useState(false);

  const { data: article, isLoading: loadingArticle, error } = usePublicCmsById(articleId, true, isPreview);
  const { data: bodyHtml, isLoading: loadingBody } = usePublicCmsBody(articleId, !!article, isPreview);

  if (loadingArticle) {
    return (
      <PublicLayout>
        <ArticleSkeleton />
      </PublicLayout>
    );
  }

  if (error || !article) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-6" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Article Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This article doesn't exist or hasn't been published yet.
          </p>
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const thumbnailUrl = article.thumbnailUrl || '';
  const publishDate = article.publishedAt 
    ? new Date(article.publishedAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : new Date(article.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

  return (
    <PublicLayout>
      <article className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/explore/articles" className="hover:text-primary transition-colors">Articles</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground truncate max-w-[200px]">{article.title || 'Untitled'}</span>
        </nav>

        {/* Header Section */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge variant="secondary">
              <BookOpen className="w-3 h-3 mr-1" />
              Article
            </Badge>
            {article.categoryName && (
              <Badge variant="outline">{article.categoryName}</Badge>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
            {article.title || 'Untitled Article'}
          </h1>

          {article.description && (
            <p className="text-xl text-muted-foreground mb-6 leading-relaxed">
              {article.description}
            </p>
          )}

          {/* Author and meta info */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Content Team</p>
                <p className="text-xs">Author</p>
              </div>
            </div>
            
            <Separator orientation="vertical" className="h-8" />
            
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {publishDate}
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              5 min read
            </div>
          </div>

          {/* Action buttons */}
          <div className="pb-6 border-b border-border space-y-3">
            <InteractionBar
              contentType="article"
              contentId={article.id}
              discussRef={discussRef as React.RefObject<HTMLElement>}
            />
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHighlightsPanelOpen(true)}
                className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
              >
                <Highlighter className="w-4 h-4" />
                My Highlights &amp; Notes
              </Button>
            </div>
          </div>
        </header>

        {/* Featured Image */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 mb-10">
          <img
            src={thumbnailUrl}
            alt={article.title || 'Article thumbnail'}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Article Content */}
        <div className="prose prose-lg max-w-none">
          {loadingBody ? (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : bodyHtml ? (
            <HighlightOverlay
              contentType="article"
              contentId={article.id}
              contentSlug={articleId}
              contentTitle={article.title ?? undefined}
            >
              <div
                className="article-content text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(bodyHtml)) }}
              />
            </HighlightOverlay>
          ) : (
            <Card className="p-8 text-center border-dashed bg-muted/30">
              <p className="text-muted-foreground">No content available for this article.</p>
            </Card>
          )}
        </div>

        {/* Attachments */}
        {article.attachments && article.attachments.length > 0 && (
          <section className="mt-12">
            <h3 className="text-xl font-semibold mb-4">Attachments</h3>
            <div className="grid gap-3">
              {article.attachments.map((attachment) => (
                <a
                  key={attachment.name}
                  href={attachment.url}
                  download
                  className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{attachment.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(attachment.size / 1024).toFixed(1)} KB • {attachment.mimeType}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Footer actions */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Discuss / Comments section anchor */}
        <div ref={discussRef} className="mt-8" />
      </article>

      {/* Highlights & Notes side panel */}
      <HighlightsPanel
        open={highlightsPanelOpen}
        onClose={() => setHighlightsPanelOpen(false)}
        contentType="article"
        contentId={article.id}
        contentUrl={`/article/${articleId}`}
        contentTitle={article.title ?? undefined}
      />

      {/* Article content styles */}
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
        .article-content code { font-family: 'Courier New', Courier, monospace; background: hsl(var(--muted)); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
        .article-content pre code { background: none; padding: 0; font-size: inherit; white-space: pre; }
        .article-content figure { margin: 1.5rem 0; text-align: center; }
        .article-content figure img { margin: 0 auto; }
        .article-content figcaption { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin-top: 0.5rem; }
        .article-content img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0; display: block; }
        .article-content a { color: hsl(var(--primary)); text-decoration: underline; }
        .article-content a:hover { text-decoration: none; }
        .article-content hr { margin: 2rem 0; border: none; border-top: 1px solid hsl(var(--border)); }
        .article-content table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .article-content th, .article-content td { border: 1px solid hsl(var(--border)); padding: 0.75rem; text-align: left; }
        .article-content th { background: hsl(var(--muted)); font-weight: 600; }
      `}</style>
    </PublicLayout>
  );
}
