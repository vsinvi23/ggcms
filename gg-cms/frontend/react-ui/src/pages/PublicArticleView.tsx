import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { extractSlugFromPath, slugify } from '@/lib/slug';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsById, usePublicCmsBody, usePublicArticlesByCategory } from '@/api/hooks/usePublicCms';
import { useContentTopics, useTopicContent } from '@/api/hooks/useTopics';
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
  ChevronDown,
  BookOpen,
  Highlighter,
  List,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { HighlightsPanel } from '@/components/engagement/HighlightsPanel';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { TopicChip } from '@/components/public/TopicChip';
import { ContentCard } from '@/components/public/ContentCard';
import { cn } from '@/lib/utils';
import { getArticleReadState, markArticleAsRead, markArticleAsReferred, ArticleReadState } from '@/lib/contentStateStore';
import { toast } from 'sonner';

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

const MIN_HEADINGS_FOR_TOC = 2;

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

import { PublicQuickEditBar } from '@/components/editor/PublicQuickEditBar';
import { InlinePageEditor } from '@/components/editor/InlinePageEditor';
import { ContentDiffOverlay, DiffViewMode, computeWordDiff } from '@/components/engagement/ContentDiffOverlay';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateCms, useSubmitCmsForReview } from '@/api/hooks/useCms';

// Helper for saving article revision
export default function PublicArticleView() {
  const { '*': wildcardPath } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { user, isAdmin, isMasterAdmin, canQuickEditPublic } = useAuth();
  
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<any>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('diff');

  const updateCms = useUpdateCms();
  const submitForReview = useSubmitCmsForReview();

  // Wildcard captures "slug" or "category/slug" — always use the last segment
  const articleId = extractSlugFromPath(wildcardPath);
  const discussRef = useRef<HTMLDivElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const [highlightsPanelOpen, setHighlightsPanelOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');

  const { data: article, isLoading: loadingArticle, error } = usePublicCmsById(articleId, true, isPreview);
  const { data: bodyHtml, isLoading: loadingBody } = usePublicCmsBody(articleId, !!article, isPreview);

  const handleSaveArticleRevision = async (data: { title: string; description: string; body: string; submitForReview: boolean }) => {
    if (article?.id) {
      await updateCms.mutateAsync({
        id: article.id,
        data: {
          type: 'ARTICLE',
          title: data.title,
          description: data.description,
          body: data.body,
          status: data.submitForReview ? 'REVIEW' : 'DRAFT',
        },
      });

      if (data.submitForReview) {
        await submitForReview.mutateAsync({
          id: article.id,
          type: 'ARTICLE',
        });
      }
    }

    const newRev = {
      id: Date.now(),
      parentContentId: article?.id || 1,
      contentType: 'ARTICLE',
      versionNumber: (article as any)?.version ? (article as any).version + 1 : 2,
      status: data.submitForReview ? 'REVIEW' : 'DRAFT',
      requestedBy: user?.id || 1,
      title: data.title,
      description: data.description,
      body: data.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPendingRevision(newRev);
    setIsViewingPending(true);
    setDiffViewMode('diff');
  };

  const { data: topics = [] } = useContentTopics(article?.id ?? null, 'ARTICLE');
  const primaryTopicId = topics[0]?.id ?? null;
  const noTopics = topics.length === 0;

  const { data: topicContent } = useTopicContent(primaryTopicId, 'ARTICLE');
  const categoryFallbackSlug = noTopics && article?.categoryName ? slugify(article.categoryName) : '';
  const { data: categoryFallback } = usePublicArticlesByCategory(categoryFallbackSlug, { size: 4 });

  const [articleState, setArticleState] = useState<ArticleReadState | null>(null);

  useEffect(() => {
    if (article?.id) {
      setArticleState(getArticleReadState(article.id));
    }
  }, [article?.id]);

  const handleToggleRead = () => {
    if (article?.id) {
      const updated = markArticleAsRead(article.id);
      setArticleState(updated);
      toast.success(updated.isRead ? 'Marked as read' : 'Updated read status');
    }
  };

  const publishedBodyText = (article as any)?.publishedBody || bodyHtml || '';
  const draftBodyText = pendingRevision?.body || bodyHtml || '';
  const activeBody = pendingRevision && (diffViewMode === 'draft' || diffViewMode === 'diff')
    ? pendingRevision.body
    : bodyHtml || '';

  const displayBodyHtml = useMemo(() => {
    if (!article) return '';
    if ((article.hasPendingDraft || pendingRevision) && diffViewMode === 'diff' && (isAdmin || isMasterAdmin)) {
      return computeWordDiff(publishedBodyText, draftBodyText);
    }
    return parseBodyToHtml(activeBody);
  }, [article, pendingRevision, diffViewMode, isAdmin, isMasterAdmin, publishedBodyText, draftBodyText, activeBody]);

  useEffect(() => {
    let frameId: number;

    const extractHeadings = () => {
      const container = articleBodyRef.current;
      if (!container) {
        setTocEntries([]);
        return;
      }
      const headings = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3'));
      const seen = new Map<string, number>();
      const entries: TocEntry[] = headings.map((heading) => {
        const text = heading.textContent?.trim() || '';
        let id = heading.id || slugify(text) || `section-${Math.random().toString(36).substring(2, 7)}`;
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        heading.id = id;
        return { id, text, level: heading.tagName === 'H3' ? 3 : 2 };
      });

      setTocEntries(entries);
      if (entries.length > 0) {
        setActiveHeadingId((prev) => (prev && entries.some((e) => e.id === prev) ? prev : entries[0].id));
      }
    };

    // Defer querySelectorAll to next frame to ensure React innerHTML has mounted
    frameId = requestAnimationFrame(extractHeadings);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [displayBodyHtml, bodyHtml]);

  // Dynamically update active right-rail TOC heading on scroll
  useEffect(() => {
    if (tocEntries.length === 0) return;

    setActiveHeadingId((prev) => (prev && tocEntries.some((e) => e.id === prev) ? prev : tocEntries[0].id));

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const headingElements = tocEntries
            .map((entry) => document.getElementById(entry.id))
            .filter((el): el is HTMLElement => el !== null);

          if (headingElements.length === 0) {
            ticking = false;
            return;
          }

          const scrollPosition = window.scrollY || document.documentElement.scrollTop;
          const viewportHeight = window.innerHeight;
          const scrollHeight = document.documentElement.scrollHeight;

          // Find the last heading whose top position is <= 140px (sticky nav offset)
          let activeId = tocEntries[0].id;
          for (const heading of headingElements) {
            const rect = heading.getBoundingClientRect();
            if (rect.top <= 140) {
              activeId = heading.id;
            } else {
              break;
            }
          }

          // Highlight last heading if near bottom of page
          if (scrollHeight > viewportHeight + 100 && scrollPosition + viewportHeight >= scrollHeight - 50) {
            activeId = tocEntries[tocEntries.length - 1].id;
          }

          setActiveHeadingId(activeId);
          ticking = false;
        });
        ticking = true;
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [tocEntries]);

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

  const relatedItems = (primaryTopicId ? topicContent ?? [] : categoryFallback?.items ?? []).filter(
    (item) => item.id !== article.id
  );

  const showToc = tocEntries.length >= MIN_HEADINGS_FOR_TOC;

  const handleTocClick = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -90; // Header clearance offset
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveHeadingId(id);
      setMobileTocOpen(false);
    }
  };

  const renderTocList = () => (
    <ul className="space-y-1.5 text-xs">
      {tocEntries.map((entry) => {
        const isActive = activeHeadingId === entry.id;
        return (
          <li key={entry.id} className={entry.level === 3 ? 'pl-3' : ''}>
            <a
              href={`#${entry.id}`}
              onClick={handleTocClick(entry.id)}
              className={`block truncate py-1 px-2 rounded-md transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary font-bold border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {entry.text}
            </a>
          </li>
        );
      })}
    </ul>
  );

  const activeTitle = pendingRevision && (diffViewMode === 'draft' || diffViewMode === 'diff') 
    ? pendingRevision.title 
    : article.title || 'Untitled Article';
  const activeDescription = pendingRevision && (diffViewMode === 'draft' || diffViewMode === 'diff')
    ? pendingRevision.description
    : article.description || '';

  return (
    <PublicLayout>
      {/* ── Confluence-style Inline Page Editor Header (Super Admin) ───────── */}
      <InlinePageEditor
        contentType="article"
        contentId={article.id}
        initialTitle={article.title || ''}
        initialDescription={article.description || ''}
        initialBody={bodyHtml || ''}
        isEditing={isInlineEditing}
        onClose={() => setIsInlineEditing(false)}
        onSave={handleSaveArticleRevision}
      />

      <PublicQuickEditBar
        contentType="article"
        contentId={article.id}
        currentTitle={article.title || 'Untitled'}
        currentDescription={article.description || ''}
        currentBody={bodyHtml || ''}
        pendingRevision={pendingRevision}
        isViewingPending={isViewingPending}
        onToggleView={setIsViewingPending}
        onStartInlineEdit={() => setIsInlineEditing(true)}
        onSaveRevision={handleSaveArticleRevision}
      />

      <div className="max-w-6xl mx-auto pt-4 px-4 sm:px-6">
        {/* ── Privileged Admin Visual Diff Banner Overlay ─────────────────── */}
        {(article.hasPendingDraft || pendingRevision) && (isAdmin || isMasterAdmin) && (
          <ContentDiffOverlay
            publishedTitle={(article as any).publishedTitle || article.title}
            draftTitle={pendingRevision?.title || article.title}
            publishedDescription={(article as any).publishedDescription || article.description}
            draftDescription={pendingRevision?.description || article.description}
            publishedBody={publishedBodyText}
            draftBody={draftBodyText}
            status={pendingRevision?.status || article.status || 'DRAFT'}
            hasPendingDraft={article.hasPendingDraft || !!pendingRevision}
            version={(article as any).version || 2}
            publishedVersion={(article as any).publishedVersion || 1}
            viewMode={diffViewMode}
            onViewModeChange={setDiffViewMode}
            onStartInlineEdit={() => setIsInlineEditing(true)}
            canEdit={canQuickEditPublic}
          />
        )}

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/explore/articles" className="hover:text-primary transition-colors">Articles</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground truncate max-w-[200px]">{article.title || 'Untitled'}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-10 items-start">
          <article className="max-w-3xl w-full">
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

              <h1 
                className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight tracking-tight"
                dangerouslySetInnerHTML={
                  (article.hasPendingDraft || pendingRevision) && diffViewMode === 'diff' && (isAdmin || isMasterAdmin) && (article as any).publishedTitle
                    ? { __html: computeWordDiff((article as any).publishedTitle, activeTitle) }
                    : undefined
                }
              >
                {!((article.hasPendingDraft || pendingRevision) && diffViewMode === 'diff' && (isAdmin || isMasterAdmin) && (article as any).publishedTitle) && activeTitle}
              </h1>

              {activeDescription && (
                <p 
                  className="text-xl text-muted-foreground mb-6 leading-relaxed"
                  dangerouslySetInnerHTML={
                    (article.hasPendingDraft || pendingRevision) && diffViewMode === 'diff' && (isAdmin || isMasterAdmin) && (article as any).publishedDescription
                      ? { __html: computeWordDiff((article as any).publishedDescription, activeDescription) }
                      : undefined
                  }
                >
                  {!((article.hasPendingDraft || pendingRevision) && diffViewMode === 'diff' && (isAdmin || isMasterAdmin) && (article as any).publishedDescription) && activeDescription}
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

                {articleState?.status === 'READ' || articleState?.isRead ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Read
                  </Badge>
                ) : articleState?.status === 'REFERRED' || articleState?.isReferred ? (
                  <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-bold flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> Referred
                  </Badge>
                ) : null}
              </div>

              {/* Topic chips */}
              {topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {topics.map((topic) => (
                    <TopicChip key={topic.id} name={topic.name} slug={topic.slug} />
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="pb-6 border-b border-border space-y-3">
                <InteractionBar
                  contentType="article"
                  contentId={article.id}
                  discussRef={discussRef as React.RefObject<HTMLElement>}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={articleState?.isRead ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={handleToggleRead}
                    className={cn(
                      'gap-2 font-bold rounded-xl text-xs',
                      articleState?.isRead ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-foreground'
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {articleState?.isRead ? 'Read Completed' : 'Mark as Read'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHighlightsPanelOpen(true)}
                    className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:border-amber-400 rounded-xl text-xs"
                  >
                    <Highlighter className="w-4 h-4" />
                    My Highlights &amp; Notes
                  </Button>
                </div>
              </div>
            </header>

            {/* Mobile table of contents (collapsible) */}
            {showToc && (
              <div className="lg:hidden mb-8 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setMobileTocOpen((open) => !open)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
                  aria-expanded={mobileTocOpen}
                >
                  <span className="flex items-center gap-2">
                    <List className="w-4 h-4" />
                    On this page
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', mobileTocOpen && 'rotate-180')} />
                </button>
                {mobileTocOpen && <div className="px-4 pb-4">{renderTocList()}</div>}
              </div>
            )}

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
                    ref={articleBodyRef}
                    className="educative-article-reader article-content text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayBodyHtml) }}
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

            {/* Related Content & Recommended Insights */}
            {relatedItems.length > 0 && (
              <section className="mt-12 pt-8 border-t border-border/80 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-primary" /> Recommended Articles &amp; Insights
                    </h2>
                    <p className="text-xs text-muted-foreground">Handpicked articles and deep reads related to {article.categoryName || 'this topic'}</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="text-xs font-semibold text-primary">
                    <Link to="/explore/articles">
                      View all articles <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {relatedItems.slice(0, 3).map((item) => (
                    <ContentCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Next Steps Learning Journey Banner */}
            <div className="mt-10 p-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 space-y-6 shadow-xs">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1 max-w-xl">
                  <Badge variant="outline" className="text-[10px] font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 uppercase tracking-wider">
                    Recommended Next Steps
                  </Badge>
                  <h3 className="text-xl font-extrabold text-foreground">
                    Deepen Your Knowledge in {article.categoryName || 'Software & Security'}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Take your reading further with hands-on practice quizzes and structured learning courses tailored to this topic.
                  </p>
                </div>
              </div>

              {/* Related Course & Practice Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:border-primary/40 transition-all">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary">Interactive Course</Badge>
                    <span className="text-[11px] text-muted-foreground font-semibold">4h 30m</span>
                  </div>
                  <h4 className="text-sm font-bold text-foreground">OAuth 2.0 & OIDC Fundamentals Course</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">Master PKCE flows, authorization server implementation, and JWT claims verification.</p>
                  <Button size="sm" asChild className="w-full rounded-xl text-xs font-bold gap-1 mt-1">
                    <Link to="/course/oauth-2-fundamentals">
                      Start Interactive Course <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:border-emerald-500/40 transition-all">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Practice Quiz</Badge>
                    <span className="text-[11px] text-muted-foreground font-semibold">10 mins</span>
                  </div>
                  <h4 className="text-sm font-bold text-foreground">OAuth 2.0 & OIDC Practice Test</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">Test your understanding of PKCE verifiers, implicit flow deprecation, and ID tokens.</p>
                  <Button size="sm" variant="outline" asChild className="w-full rounded-xl text-xs font-bold gap-1 mt-1 hover:bg-emerald-500/10 hover:text-emerald-600">
                    <Link to="/explore/practice">
                      Take Practice Quiz <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-10 pt-8 border-t border-border">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <Button variant="outline" asChild className="rounded-xl">
                  <Link to="/">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Article
                </Button>
              </div>
            </div>

            {/* Discuss / Comments section anchor */}
            <div ref={discussRef} className="mt-8 pt-6 border-t border-border">
              {article?.id && (
                <CommentsSection contentType="article" contentId={article.id} />
              )}
            </div>
          </article>

          {/* Desktop right-rail table of contents */}
          {showToc && (
            <aside className="hidden lg:block sticky top-24">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <List className="w-4 h-4" />
                On this page
              </h2>
              {renderTocList()}
            </aside>
          )}
        </div>
      </div>

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
        .article-content h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; line-height: 1.35; scroll-margin-top: 6rem; }
        .article-content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.4; scroll-margin-top: 6rem; }
        .article-content p { margin-bottom: 1rem; line-height: 1.75; }
        .article-content ul { list-style-type: disc; margin-bottom: 1rem; padding-left: 1.75rem; }
        .article-content ol { list-style-type: decimal; margin-bottom: 1rem; padding-left: 1.75rem; }
        .article-content li { margin-bottom: 0.35rem; line-height: 1.7; }
        .article-content li > p { margin-bottom: 0; }
        .article-content blockquote { border-left: 4px solid #2563eb; padding: 0.85rem 1.25rem; margin: 1.5rem 0; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 0 0.375rem 0.375rem 0; }
        .article-content blockquote p { color: #0f172a; font-style: normal; font-weight: 500; margin-bottom: 0; }
        .dark .article-content blockquote { background: #0f172a; border-color: #334155; border-left-color: #3b82f6; }
        .dark .article-content blockquote p { color: #f8fafc; }
        .article-content pre { background: #f8fafc; color: #0f172a; border: 1px solid #cbd5e1; padding: 1.25rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1.25rem; font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.9em; line-height: 1.6; white-space: pre; }
        .dark .article-content pre { background: #0f172a; color: #f8fafc; border-color: #334155; }
        .article-content code { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; font-weight: 500; }
        .dark .article-content code { background: #1e293b; color: #f8fafc; border-color: #334155; }
        .article-content pre code { background: none; color: inherit; padding: 0; font-size: inherit; white-space: pre; border: none; }
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
