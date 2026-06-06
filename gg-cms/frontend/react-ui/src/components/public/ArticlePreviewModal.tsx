import { useRef, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink, Calendar, Clock, User,
  BookOpen, Highlighter, X,
} from 'lucide-react';
import { CmsResponseDto } from '@/api/types';
import { usePublicCmsBody } from '@/api/hooks/usePublicCms';
import { buildArticleUrl } from '@/lib/slug';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { useAuth } from '@/contexts/AuthContext';

interface ArticlePreviewModalProps {
  open: boolean;
  onClose: () => void;
  article: CmsResponseDto;
}

export function ArticlePreviewModal({ open, onClose, article }: ArticlePreviewModalProps) {
  const { user } = useAuth();
  const [highlightsPanelOpen, setHighlightsPanelOpen] = useState(false);
  const discussRef = useRef<HTMLDivElement>(null);

  const articleSlug = article.slug ?? String(article.id);
  const articleUrl  = buildArticleUrl(article);

  const { data: bodyHtml, isLoading: loadingBody } = usePublicCmsBody(
    articleSlug,
    open,   // only fetch when modal is open
    false,
    'ARTICLE',
  );

  const publishDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : article.createdAt
    ? new Date(article.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  const readMin = Math.max(1, (article.blockCount ?? 0) > 0 ? (article.blockCount ?? 0) * 2 : 5);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/*
          hideCloseButton suppresses the default X so our custom top bar
          is the only close control — avoids the duplicate button.
        */}
        <DialogContent
          className="max-w-3xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button:first-of-type]:hidden"
        >
          {/* ── Sticky top bar ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 bg-card">
            <div className="flex items-center gap-2 flex-wrap">
              {article.articleType && (
                <Badge variant="secondary" className="text-xs">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {article.articleType}
                </Badge>
              )}
              {article.categoryName && (
                <Badge variant="outline" className="text-xs">{article.categoryName}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={articleUrl} onClick={onClose} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Full Page
                </Link>
              </Button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Scrollable article body ────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto edu-content-scroll">

            {/* Thumbnail */}
            {article.thumbnailUrl && (
              <div className="w-full aspect-[21/9] overflow-hidden flex-shrink-0">
                <img
                  src={article.thumbnailUrl}
                  alt={article.title ?? ''}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="px-6 py-6 space-y-5">
              {/* Title */}
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {article.title ?? 'Untitled Article'}
              </h1>

              {/* Description */}
              {article.description && (
                <p className="text-base text-muted-foreground leading-relaxed">
                  {article.description}
                </p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  <span>{article.createdByName ?? 'Content Team'}</span>
                </div>
                {publishDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{publishDate}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{readMin} min read</span>
                </div>
              </div>

              <Separator />

              {/* Engagement toolbar */}
              {user && (
                <div className="flex items-center gap-3 flex-wrap">
                  <InteractionBar
                    contentType="article"
                    contentId={article.id}
                    discussRef={discussRef as React.RefObject<HTMLElement>}
                  />
                  <button
                    onClick={() => setHighlightsPanelOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    <Highlighter className="h-3.5 w-3.5" />
                    My Highlights
                  </button>
                </div>
              )}

              {/* Body content */}
              {loadingBody ? (
                <div className="space-y-3 pt-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
                  ))}
                </div>
              ) : bodyHtml ? (
                user ? (
                  <HighlightOverlay
                    contentType="article"
                    contentId={article.id}
                    contentSlug={articleSlug}
                    contentTitle={article.title ?? undefined}
                  >
                    <div
                      className="article-content text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
                    />
                  </HighlightOverlay>
                ) : (
                  <div
                    className="article-content text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
                  />
                )
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No content available. Open the full article page to read it.
                </p>
              )}

              {/* Bottom CTA */}
              <div ref={discussRef} className="pt-4 border-t border-border">
                <Button asChild className="w-full" variant="outline">
                  <Link to={articleUrl} onClick={onClose}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Full Article Page
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Highlights panel */}
      {user && (
        <HighlightsPanel
          open={highlightsPanelOpen}
          onClose={() => setHighlightsPanelOpen(false)}
          contentType="article"
          contentId={article.id}
          contentUrl={articleUrl}
          contentTitle={article.title ?? undefined}
        />
      )}
    </>
  );
}
