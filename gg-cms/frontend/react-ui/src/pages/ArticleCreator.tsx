import { useState, useRef, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryTreeSelect } from '@/components/ui/CategoryTreeSelect';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { DiffField, ContentBlockDiff } from '@/components/shared/DiffViewer';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Save,
  Send,
  ArrowLeft,
  FileText,
  Loader2,
  Image as ImageIcon,
  MessageSquare,
  Eye,
  History,
  CheckCircle,
  XCircle,
  ArrowRight,
  GitBranch,
  PenLine,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ContentBlock } from '@/types/content';
import {
  useCreateCms,
  useUpdateCms,
  useUploadCmsBody,
  useUploadCmsThumbnail,
  useCmsBySlug,
  useSubmitCmsForReview,
  useDownloadCmsBody,
  useCmsActivity,
  useApproveCms,
  useSendCmsBack,
  useRejectCms,
  usePublishCms,
  useClaimReview,
  useReassignReview,
  useSaveReviewNote,
} from '@/api/hooks/useCms';
import { useCategories } from '@/api/hooks/useCategories';
import { useContentTypes } from '@/api/hooks/useContentTypes';
import { parseBodyToBlocks, parseBodyToHtml, stripHtmlTags } from '@/lib/htmlParser';
import { useAllowedCategories } from '@/hooks/useAllowedCategories';
import { useAuth } from '@/contexts/AuthContext';

export default function ArticleCreator() {
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isViewMode = searchParams.get('mode') === 'view';

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const { user, isAdmin, userGroups } = useAuth();

  // API hooks — edit
  const createCms = useCreateCms();
  const updateCms = useUpdateCms();
  const uploadBody = useUploadCmsBody();
  const uploadThumbnail = useUploadCmsThumbnail();
  const submitForReview = useSubmitCmsForReview();

  // API hooks — review actions
  const { mutateAsync: approveCms } = useApproveCms();
  const { mutateAsync: sendBackCms } = useSendCmsBack();
  const { mutateAsync: rejectCms } = useRejectCms();
  const { mutateAsync: publishCms } = usePublishCms();
  const { mutateAsync: claimReview } = useClaimReview();
  const { mutateAsync: reassignReview } = useReassignReview();
  const { mutateAsync: saveReviewNote } = useSaveReviewNote();

  const { data: categoriesData, isLoading: categoriesLoading } = useCategories();
  const { data: articleTypes = [] } = useContentTypes('article');
  const { data: existingCms, isLoading: cmsLoading, isError: cmsError } = useCmsBySlug(paramId, !!paramId);
  const existingCmsId = existingCms?.id ?? 0;
  const { data: existingBody } = useDownloadCmsBody(existingCmsId, !!paramId && existingCmsId > 0);
  const { data: activityLog = [] } = useCmsActivity(existingCmsId, 'ARTICLE', !!paramId && existingCmsId > 0);

  const allCategories = categoriesData || [];
  const categories = useAllowedCategories(allCategories, 'ARTICLE');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [articleType, setArticleType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [isReviewActing, setIsReviewActing] = useState(false);
  const [reassignNote, setReassignNote] = useState('');
  const [showReassignPanel, setShowReassignPanel] = useState(false);
  const [reviewerEditMode, setReviewerEditMode] = useState(false);
  const [reviewerEditBaseline, setReviewerEditBaseline] = useState<{ title: string; description: string; bodyHtml: string } | null>(null);
  const [publisherEditMode, setPublisherEditMode] = useState(false);
  const [publisherEditBaseline, setPublisherEditBaseline] = useState<{ title: string; description: string; bodyHtml: string } | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Derived review state
  const isCurrentUserReviewer =
    !!user && !!existingCms?.reviewerId &&
    existingCms.reviewerId === user.id &&
    existingCms.status === 'REVIEW';

  const isUnclaimedReview = isViewMode && existingCms?.status === 'REVIEW' && !existingCms?.reviewerId;
  const isOtherReviewerClaimed = isViewMode && existingCms?.status === 'REVIEW' && !!existingCms?.reviewerId && existingCms.reviewerId !== user?.id;

  // APPROVED state — only the assigned publisher (reviewerId === current user) with publish permission can publish
  const isApprovedState = existingCms?.status === 'APPROVED';
  const hasPublishPermission = isAdmin || userGroups.some(g => g.permissions?.articles?.publish === true);
  const isAssignedPublisher = isApprovedState && !!user && existingCms?.reviewerId === user.id;
  const canPublish = isViewMode && isApprovedState && hasPublishPermission && isAssignedPublisher;
  const isUnclaimedApproved = isViewMode && isApprovedState && !existingCms?.reviewerId;
  const isOtherPublisherClaimed = isViewMode && isApprovedState && !!existingCms?.reviewerId && existingCms?.reviewerId !== user?.id;

  // Rendered HTML for view mode (handles JSON blocks + legacy HTML)
  const bodyHtml = isViewMode ? parseBodyToHtml(existingBody || '') : '';

  // Diff baseline: use review baseline (from send-back snapshot) if available,
  // else fall back to published snapshot, else no diff available.
  const diffBaselineTitle = existingCms?.reviewBaselineTitle ?? existingCms?.publishedTitle ?? null;
  const diffBaselineDescription = existingCms?.reviewBaselineDescription ?? existingCms?.publishedDescription ?? null;
  const diffBaselineBody = isViewMode
    ? parseBodyToHtml(existingCms?.reviewBaselineBody ?? existingCms?.publishedBody ?? '')
    : '';
  const hasDiff = isViewMode && !!(diffBaselineTitle || diffBaselineDescription || diffBaselineBody);
  const hasReviewBaseline = !!(existingCms?.reviewBaselineTitle || existingCms?.reviewBaselineDescription || existingCms?.reviewBaselineBody);
  const hasPublishedSnapshot = !!(existingCms?.publishedTitle || existingCms?.publishedDescription || existingCms?.publishedBody);
  const diffLabel = hasReviewBaseline ? 'Changes since last send-back' : hasPublishedSnapshot ? 'Changes from published version' : null;

  // Load existing data if editing
  useEffect(() => {
    if (existingCms && !isDataLoaded) {
      setTitle(existingCms.title || '');
      setDescription(existingCms.description || '');
      setArticleType(existingCms.articleType || '');
      setCategoryId(existingCms.categoryId?.toString() || '');
      if (existingCms.thumbnailUrl) setThumbnailPreview(existingCms.thumbnailUrl);
      setIsDataLoaded(true);
    }
  }, [existingCms, isDataLoaded]);

  useEffect(() => {
    if (!isViewMode && existingBody && isDataLoaded && contentBlocks.length === 0) {
      try {
        const parsedBlocks = parseBodyToBlocks(existingBody);
        if (parsedBlocks.length > 0) setContentBlocks(parsedBlocks);
      } catch (error) {
        console.error('Failed to parse body content:', error);
      }
    }
  }, [existingBody, isDataLoaded, contentBlocks.length, isViewMode]);

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    } else {
      toast.error('Please select an image file');
    }
  };

  const handleSave = async (submitForReviewAfter = false) => {
    if (!title.trim()) { toast.error('Please enter an article title'); return; }
    if (!categoryId) { toast.error('Please select a category'); return; }
    setIsSaving(true);
    try {
      let cmsId: number;
      let cmsSlug: string | undefined;
      if (paramId) {
        cmsId = existingCmsId;
        await updateCms.mutateAsync({
          id: cmsId,
          data: { type: 'ARTICLE', categoryId: parseInt(categoryId), title: title || undefined, description: description || undefined, articleType: articleType || undefined },
        });
      } else {
        const created = await createCms.mutateAsync({
          type: 'ARTICLE', categoryId: parseInt(categoryId), title: title || undefined, description: description || undefined, articleType: articleType || undefined,
        });
        cmsId = created.id;
        cmsSlug = created.slug;
      }
      if (contentBlocks.length > 0) await uploadBody.mutateAsync({ id: cmsId, content: JSON.stringify(contentBlocks) });
      if (thumbnailFile) await uploadThumbnail.mutateAsync({ id: cmsId, file: thumbnailFile });
      if (submitForReviewAfter) {
        await submitForReview.mutateAsync({ id: cmsId });
        toast.success('Article submitted for review');
        navigate('/articles');
      } else {
        toast.success(paramId ? 'Article updated' : 'Article saved as draft');
        if (!paramId && cmsSlug) navigate(`/articles/${cmsSlug}/edit`, { replace: true });
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save article');
    } finally {
      setIsSaving(false);
    }
  };

  // Review action handlers
  const handleApprove = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await approveCms({ id: existingCmsId, type: 'ARTICLE', data: undefined });
      toast.success('Article approved — a publisher will pick it up from the queue');
      navigate('/my-tasks');
    } catch { toast.error('Failed to approve'); }
    finally { setIsReviewActing(false); }
  };

  const handlePublish = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await publishCms({ id: existingCmsId, type: 'ARTICLE', data: undefined });
      toast.success('Article published successfully');
      navigate('/articles');
    } catch { toast.error('Failed to publish'); }
    finally { setIsReviewActing(false); }
  };

  const handleSendBack = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await sendBackCms({ id: existingCmsId, type: 'ARTICLE', data: { reviewerId: user?.id ?? 0, comment: reviewComment } });
      toast.success('Article sent back for revision');
      navigate('/my-tasks');
    } catch { toast.error('Failed to send back'); }
    finally { setIsReviewActing(false); }
  };

  const handleReject = async () => {
    if (!existingCmsId) return;
    if (!reviewComment.trim()) { toast.error('Please provide a reason for rejection'); return; }
    setIsReviewActing(true);
    try {
      await rejectCms({ id: existingCmsId, type: 'ARTICLE', data: { reviewerId: user?.id ?? 0, comment: reviewComment } });
      toast.success('Article rejected');
      navigate('/my-tasks');
    } catch { toast.error('Failed to reject'); }
    finally { setIsReviewActing(false); }
  };

  const handleClaimReview = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await claimReview({ id: existingCmsId, type: 'ARTICLE' });
      toast.success('You are now the assigned reviewer');
    } catch { toast.error('Failed to claim review — it may have been claimed by someone else'); }
    finally { setIsReviewActing(false); }
  };

  const handleClaimForPublishing = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await claimReview({ id: existingCmsId, type: 'ARTICLE' });
      toast.success('You are now the assigned publisher');
    } catch { toast.error('Failed to claim — it may have been taken by someone else'); }
    finally { setIsReviewActing(false); }
  };

  const handleReassignReview = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await reassignReview({ id: existingCmsId, type: 'ARTICLE', note: reassignNote });
      toast.success('Review released — another reviewer can now claim it');
      setShowReassignPanel(false);
      setReassignNote('');
      navigate('/my-tasks');
    } catch { toast.error('Failed to release review'); }
    finally { setIsReviewActing(false); }
  };

  const handleSaveReviewNote = async () => {
    if (!existingCmsId || !reviewComment.trim()) return;
    setIsReviewActing(true);
    try {
      await saveReviewNote({ id: existingCmsId, type: 'ARTICLE', note: reviewComment });
      toast.success('Review notes saved');
    } catch { toast.error('Failed to save review notes'); }
    finally { setIsReviewActing(false); }
  };

  const enterReviewerEditMode = () => {
    setReviewerEditBaseline({ title, description, bodyHtml });
    if (contentBlocks.length === 0 && existingBody) {
      try {
        const blocks = parseBodyToBlocks(existingBody);
        if (blocks.length > 0) setContentBlocks(blocks);
      } catch (e) {
        console.error('Failed to parse body:', e);
      }
    }
    setReviewerEditMode(true);
  };

  const handleSaveAndApprove = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await updateCms.mutateAsync({
        id: existingCmsId,
        data: { type: 'ARTICLE', categoryId: parseInt(categoryId), title: title || undefined, description: description || undefined, articleType: articleType || undefined },
      });
      if (contentBlocks.length > 0) {
        await uploadBody.mutateAsync({ id: existingCmsId, content: JSON.stringify(contentBlocks) });
      }
      await approveCms({ id: existingCmsId, type: 'ARTICLE', data: undefined });
      toast.success('Article saved and approved — a publisher will pick it up from the queue');
      navigate('/my-tasks');
    } catch {
      toast.error('Failed to save and approve');
    } finally {
      setIsReviewActing(false);
    }
  };

  const enterPublisherEditMode = () => {
    setPublisherEditBaseline({ title, description, bodyHtml });
    if (contentBlocks.length === 0 && existingBody) {
      try {
        const blocks = parseBodyToBlocks(existingBody);
        if (blocks.length > 0) setContentBlocks(blocks);
      } catch (e) { console.error('Failed to parse body:', e); }
    }
    setPublisherEditMode(true);
  };

  const handleSaveAndPublish = async () => {
    if (!existingCmsId) return;
    setIsReviewActing(true);
    try {
      await updateCms.mutateAsync({
        id: existingCmsId,
        data: { type: 'ARTICLE', categoryId: parseInt(categoryId), title: title || undefined, description: description || undefined, articleType: articleType || undefined },
      });
      if (contentBlocks.length > 0) {
        await uploadBody.mutateAsync({ id: existingCmsId, content: JSON.stringify(contentBlocks) });
      }
      await publishCms({ id: existingCmsId, type: 'ARTICLE', data: undefined });
      toast.success('Article saved and published');
      navigate('/articles');
      setPublisherEditMode(false);
    } catch {
      toast.error('Failed to save and publish');
    } finally {
      setIsReviewActing(false);
    }
  };

  const isLoading = !!paramId && (cmsLoading || (!isDataLoaded && !!existingCms));

  if (paramId && cmsError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-lg font-medium text-foreground">Article not found</p>
          <p className="text-sm text-muted-foreground">
            Could not load <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{paramId}</span>.
            The article may have been deleted or the server is unavailable.
          </p>
          <Button variant="outline" onClick={() => navigate('/articles')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Articles
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(isViewMode ? '/my-tasks' : '/articles')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">
                  {isViewMode ? 'Reviewing Article' : paramId ? 'Edit Article' : 'Create Article'}
                </h1>
                {existingCms?.version && (
                  <Badge variant="outline" className="text-xs">v{existingCms.version}</Badge>
                )}
                {isViewMode && (
                  <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">
                    Review Mode
                  </Badge>
                )}
                {!isViewMode && existingCms?.hasPendingDraft && (
                  <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                    Pending Revision
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {isViewMode ? 'Read-only view — approve, send back, or reject below' : 'Add title, description, category and content'}
              </p>
            </div>
          </div>

          {/* Header actions */}
          {!isViewMode && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {paramId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const s = existingCms?.slug || (existingCms?.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    window.open(`/article/${s}?preview=true`, '_blank');
                  }}
                  className="flex-1 sm:flex-none gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={isSaving || isLoading} className="flex-1 sm:flex-none gap-2">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Draft
              </Button>
              <Button size="sm" onClick={() => setSubmitDialogOpen(true)} disabled={isSaving || isLoading} className="flex-1 sm:flex-none gap-2">
                <Send className="w-4 h-4" />
                Submit for Review
              </Button>
            </div>
          )}
        </div>

        {/* View-mode banner */}
        {isViewMode && (
          <Alert className={isApprovedState
            ? 'border-green-300 bg-green-50 dark:bg-green-950/20'
            : 'border-blue-300 bg-blue-50 dark:bg-blue-950/20'
          }>
            {isApprovedState
              ? <CheckCircle className="h-4 w-4 text-green-600" />
              : <Eye className="h-4 w-4 text-blue-600" />
            }
            <AlertDescription className={isApprovedState
              ? 'text-green-800 dark:text-green-200'
              : 'text-blue-800 dark:text-blue-200'
            }>
              {isApprovedState ? (
                <>
                  <strong>Approved</strong> — this article has been approved and is ready to publish.
                  {existingCms?.version && (
                    <span> v{existingCms.version} will go live once published.</span>
                  )}
                </>
              ) : existingCms?.status === 'PUBLISHED' ? (
                <>
                  <strong>Published</strong> — this is the currently live version of this article.
                </>
              ) : (
                <>
                  <strong>Review Mode</strong> — all fields are read-only.
                  {existingCms?.publishedVersion ? (
                    <span> Reviewing <strong>v{existingCms.version}</strong> — live version is <strong>v{existingCms.publishedVersion}</strong>.
                      {hasPublishedSnapshot && <span className="ml-1">Use the <strong>Published Version</strong> tab in Content to compare.</span>}
                    </span>
                  ) : hasPublishedSnapshot ? (
                    <span> Use the <strong>Published Version</strong> tab in Content to compare against the previous live version.</span>
                  ) : (
                    <span> <strong>No previously published version</strong> — this content has not been published before. No comparison is available.</span>
                  )}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Edit-mode versioning banner */}
        {!isViewMode && paramId && existingCms && (existingCms.status === 'PUBLISHED' || existingCms.hasPendingDraft) && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              {existingCms.hasPendingDraft
                ? `You are editing revision v${existingCms.version}. The published version (v${existingCms.publishedVersion}) is still live until this revision is approved and published.`
                : 'This article is published. Saving changes will create a new draft revision that must go through review before it replaces the live content.'}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* Main area */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              {/* Article Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Article Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter article title..."
                      className="text-lg"
                      disabled={isViewMode && !reviewerEditMode && !publisherEditMode}
                    />
                    {isViewMode && !reviewerEditMode && !publisherEditMode && diffBaselineTitle && diffBaselineTitle !== existingCms?.title && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-amber-600">Was:</span>{' '}
                        <span className="line-through text-amber-700">{diffBaselineTitle}</span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the article..."
                      rows={3}
                      disabled={isViewMode && !reviewerEditMode && !publisherEditMode}
                    />
                    {isViewMode && !reviewerEditMode && !publisherEditMode && diffBaselineDescription && diffBaselineDescription !== existingCms?.description && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-amber-600">Was:</span>{' '}
                        <span className="line-through text-amber-700">{diffBaselineDescription}</span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Article Type</Label>
                    <Select value={articleType || 'none'} onValueChange={(v) => setArticleType(v === 'none' ? '' : v)} disabled={isViewMode && !reviewerEditMode && !publisherEditMode}>
                      <SelectTrigger disabled={isViewMode && !reviewerEditMode && !publisherEditMode}>
                        <SelectValue placeholder="Select article type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {articleTypes.map(at => (
                          <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    {categoriesLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <CategoryTreeSelect
                        categories={categories}
                        value={categoryId}
                        onChange={setCategoryId}
                        placeholder="Select category"
                        disabled={isViewMode && !reviewerEditMode && !publisherEditMode}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Content */}
              <Card>
                <CardHeader>
                  <CardTitle>Content</CardTitle>
                </CardHeader>
                <CardContent>
                  {isViewMode && !reviewerEditMode && !publisherEditMode ? (
                    diffBaselineBody ? (
                      <Tabs defaultValue="submitted">
                        <TabsList className="mb-4">
                          <TabsTrigger value="submitted">Submitted Version</TabsTrigger>
                          <TabsTrigger value="published" className="gap-1.5">
                            {hasReviewBaseline ? 'Sent-Back Version' : 'Published Version'}
                            {stripHtmlTags(diffBaselineBody) !== stripHtmlTags(bodyHtml) && (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] py-0 px-1">Changed</Badge>
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="diff" className="gap-1.5">
                            Body Diff
                            {stripHtmlTags(diffBaselineBody) !== stripHtmlTags(bodyHtml) && (
                              <Badge variant="outline" className="text-violet-600 border-violet-300 text-[10px] py-0 px-1">Δ</Badge>
                            )}
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="submitted">
                          {bodyHtml
                            ? <div className="article-content min-h-32 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }} />
                            : <p className="text-sm text-muted-foreground italic">No body content.</p>
                          }
                        </TabsContent>
                        <TabsContent value="published">
                          <div className="rounded-lg border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 p-1 mb-3">
                            <p className="text-xs text-amber-700 dark:text-amber-300 px-2 py-1">
                              {hasReviewBaseline ? 'Version at last send-back' : 'Previously published version'} — compare against the submitted version above
                            </p>
                          </div>
                          <div className="article-content min-h-32 text-sm opacity-80" dangerouslySetInnerHTML={{ __html: sanitizeHtml(diffBaselineBody) }} />
                        </TabsContent>
                        <TabsContent value="diff">
                          <div className="rounded-lg border border-violet-200 bg-violet-50/30 dark:bg-violet-950/10 p-2 mb-3 flex items-center gap-3 text-xs text-violet-700 dark:text-violet-300">
                            <span className="border-l-4 border-red-400 bg-red-50 pl-1 rounded-r text-red-700">removed block</span>
                            <span className="border-l-4 border-green-500 bg-green-50 pl-1 rounded-r text-green-700">added block</span>
                            <span className="border-l-4 border-amber-400 bg-amber-50 pl-1 rounded-r text-amber-700">modified block</span>
                          </div>
                          <div className="rounded border border-border bg-muted/10 p-3 min-h-32">
                            <ContentBlockDiff
                              oldBody={existingCms?.publishedBody ?? existingCms?.reviewBaselineBody ?? ''}
                              newBody={existingBody ?? ''}
                            />
                          </div>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <>
                        {existingCms?.status === 'REVIEW' && (
                          <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-muted/40 border border-border text-xs text-muted-foreground">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                              <strong className="text-foreground">No comparison available</strong> — this article has not been published before.
                              The submitted content is shown below.
                            </span>
                          </div>
                        )}
                        {bodyHtml
                          ? <div className="article-content min-h-32 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }} />
                          : <p className="text-sm text-muted-foreground italic">No body content.</p>
                        }
                      </>
                    )
                  ) : (
                    <RichContentEditor blocks={contentBlocks} onChange={setContentBlocks} />
                  )}
                </CardContent>
              </Card>

              {/* Diff panel — word-level diff for title/description (body changes visible via tabs above) */}
              {isViewMode && diffLabel && (
                (diffBaselineTitle && diffBaselineTitle !== existingCms?.title) ||
                (diffBaselineDescription && diffBaselineDescription !== existingCms?.description)
              ) && (
                <Card className="border-violet-200 bg-violet-50/30 dark:bg-violet-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-200">
                      <GitBranch className="w-4 h-4" />
                      {diffLabel} — word-level changes
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      <span className="inline-block bg-red-100 text-red-700 line-through rounded px-1 mr-1">removed</span>
                      <span className="inline-block bg-green-100 text-green-700 rounded px-1">added</span>
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <DiffField
                      label="Title"
                      oldValue={diffBaselineTitle}
                      newValue={existingCms?.title}
                    />
                    <DiffField
                      label="Description"
                      oldValue={diffBaselineDescription}
                      newValue={existingCms?.description}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Claim Review — no reviewer assigned yet (REVIEW phase) */}
              {isUnclaimedReview && (
                <Card className="border-purple-200 bg-purple-50/30 dark:bg-purple-950/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-200">
                      <CheckCircle className="w-5 h-5" />
                      Claim This Review
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">No reviewer is assigned yet. Claim it to lock it for yourself — others won't be able to take review actions while you hold it.</p>
                    <Button onClick={handleClaimReview} disabled={isReviewActing} className="bg-purple-600 hover:bg-purple-700">
                      {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Assign to Me
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Claim for Publishing — APPROVED phase, no publisher assigned yet */}
              {isUnclaimedApproved && (
                <Card className="border-purple-200 bg-purple-50/30 dark:bg-purple-950/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-200">
                      <CheckCircle className="w-5 h-5" />
                      Claim for Publishing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">This article is approved and awaiting a publisher. Claim it to start the publishing process.</p>
                    <Button onClick={handleClaimForPublishing} disabled={isReviewActing} className="bg-purple-600 hover:bg-purple-700">
                      {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Assign to Me
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Review Decision — shown for the assigned reviewer when in view mode */}
              {isViewMode && isCurrentUserReviewer && (
                <Card className={reviewerEditMode
                  ? 'border-orange-200 bg-orange-50/30 dark:bg-orange-950/10'
                  : 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/10'
                }>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${reviewerEditMode ? 'text-orange-800 dark:text-orange-200' : 'text-blue-800 dark:text-blue-200'}`}>
                      {reviewerEditMode ? <PenLine className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                      {reviewerEditMode ? 'Assigned Edit Mode' : 'Review Decision'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {reviewerEditMode ? (
                      <>
                        {reviewerEditBaseline && (
                          <div className="space-y-2 p-3 rounded-md border border-orange-200 bg-orange-50/50">
                            <p className="text-xs font-medium text-orange-800">Your changes vs. original:</p>
                            <DiffField label="Title" oldValue={reviewerEditBaseline.title} newValue={title} />
                            <DiffField label="Description" oldValue={reviewerEditBaseline.description} newValue={description} />
                            {reviewerEditBaseline.title === title && reviewerEditBaseline.description === description && (
                              <p className="text-xs text-muted-foreground italic">No changes to title or description yet — body changes are visible in the editor above.</p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveAndApprove} disabled={isReviewActing}>
                            {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Save & Approve
                          </Button>
                          <Button variant="outline" onClick={() => setReviewerEditMode(false)} disabled={isReviewActing}>
                            Cancel Editing
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-muted-foreground">Approve, send back with feedback, or make direct corrections.</p>
                          <Button variant="outline" size="sm" onClick={enterReviewerEditMode} className="flex-shrink-0 gap-1.5">
                            <PenLine className="w-3.5 h-3.5" />
                            Make Corrections
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Add review notes — required when rejecting, optional for approval or send-back..."
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          rows={3}
                          className="bg-white dark:bg-background"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={isReviewActing}>
                            {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Approve
                          </Button>
                          <Button variant="outline" onClick={handleSendBack} disabled={isReviewActing}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Send Back for Revision
                          </Button>
                          <Button variant="destructive" onClick={handleReject} disabled={isReviewActing}>
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                          {reviewComment.trim() && (
                            <Button variant="ghost" size="sm" onClick={handleSaveReviewNote} disabled={isReviewActing} className="text-muted-foreground">
                              <Save className="w-3.5 h-3.5 mr-1.5" />
                              Save Notes
                            </Button>
                          )}
                        </div>
                        {/* Pass to another reviewer */}
                        <div className="border-t border-border/30 pt-3 space-y-2">
                          {!showReassignPanel ? (
                            <Button variant="ghost" size="sm" onClick={() => setShowReassignPanel(true)} className="text-muted-foreground gap-1.5">
                              <ArrowRight className="w-3.5 h-3.5" />
                              Pass to Another Reviewer
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Handoff note for the next reviewer:</p>
                              <Textarea
                                placeholder="Describe what you've reviewed and what still needs checking..."
                                value={reassignNote}
                                onChange={(e) => setReassignNote(e.target.value)}
                                rows={2}
                                className="bg-white dark:bg-background text-xs"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={handleReassignReview} disabled={isReviewActing}>
                                  {isReviewActing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
                                  Release Review
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setShowReassignPanel(false); setReassignNote(''); }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Publish Decision — shown in view mode when article is APPROVED */}
              {canPublish && (
                <Card className={publisherEditMode
                  ? 'border-orange-200 bg-orange-50/30 dark:bg-orange-950/10'
                  : 'border-green-200 bg-green-50/30 dark:bg-green-950/10'
                }>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${publisherEditMode ? 'text-orange-800 dark:text-orange-200' : 'text-green-800 dark:text-green-200'}`}>
                      {publisherEditMode ? <PenLine className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                      {publisherEditMode ? 'Publisher Edit Mode' : 'Publish Decision'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {publisherEditMode ? (
                      <>
                        {publisherEditBaseline && (
                          <div className="space-y-2 p-3 rounded-md border border-orange-200 bg-orange-50/50">
                            <p className="text-xs font-medium text-orange-800">Your changes vs. approved version:</p>
                            <DiffField label="Title" oldValue={publisherEditBaseline.title} newValue={title} />
                            <DiffField label="Description" oldValue={publisherEditBaseline.description} newValue={description} />
                            {publisherEditBaseline.title === title && publisherEditBaseline.description === description && (
                              <p className="text-xs text-muted-foreground italic">No changes to title or description yet — content changes visible in editor above.</p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveAndPublish} disabled={isReviewActing}>
                            {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Save & Publish
                          </Button>
                          <Button variant="outline" onClick={() => setPublisherEditMode(false)} disabled={isReviewActing}>
                            Cancel Editing
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-muted-foreground">
                            This article has been approved and is ready to go live.
                          </p>
                          <Button variant="outline" size="sm" onClick={enterPublisherEditMode} className="flex-shrink-0 gap-1.5">
                            <PenLine className="w-3.5 h-3.5" />
                            Edit & Publish
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button className="bg-green-600 hover:bg-green-700" onClick={handlePublish} disabled={isReviewActing}>
                            {isReviewActing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Publish Now
                          </Button>
                        </div>
                        <div className="border-t border-border/30 pt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Send back for revision</p>
                          <Textarea
                            placeholder="Comment for the author — required to send back..."
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={2}
                            className="bg-white dark:bg-background"
                          />
                          <Button
                            variant="outline"
                            onClick={handleSendBack}
                            disabled={isReviewActing || !reviewComment.trim()}
                            className="gap-1.5"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Send Back for Revision
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* View mode: note for non-reviewers when someone else holds the review */}
              {isOtherReviewerClaimed && (
                <Alert className="border-muted">
                  <Eye className="h-4 w-4" />
                  <AlertDescription className="text-muted-foreground">
                    This article is under review by <strong>{existingCms?.reviewerName ?? 'another reviewer'}</strong>. Review actions are locked to the assigned reviewer.
                  </AlertDescription>
                </Alert>
              )}

              {/* View mode: note when another publisher has claimed the APPROVED article */}
              {isOtherPublisherClaimed && (
                <Alert className="border-muted">
                  <Eye className="h-4 w-4" />
                  <AlertDescription className="text-muted-foreground">
                    Publishing is being handled by <strong>{existingCms?.reviewerName ?? 'another user'}</strong>. Publish actions are locked to the assigned publisher.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Sidebar */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              {/* Reviewer Feedback (edit mode) */}
              {!isViewMode && existingCms?.reviewerComment && (
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-amber-600">
                      <MessageSquare className="w-5 h-5" />
                      Reviewer Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">From: {existingCms.reviewerName || 'Reviewer'}</p>
                    <p className="text-sm">{existingCms.reviewerComment}</p>
                  </CardContent>
                </Card>
              )}

              {/* Version comparison (view mode) */}
              {isViewMode && existingCms && (
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <GitBranch className="w-4 h-4" />
                      Version
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Under review</span>
                      <Badge variant="secondary">v{existingCms.version}</Badge>
                    </div>
                    {existingCms.publishedVersion ? (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Last published</span>
                        <Badge variant="outline">v{existingCms.publishedVersion}</Badge>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">First submission — nothing published yet</p>
                    )}
                    {existingCms.reviewerName && (
                      <div className="pt-1 border-t text-xs text-muted-foreground">
                        Assigned reviewer: <span className="font-medium text-foreground">{existingCms.reviewerName}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Status */}
              {existingCms && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Badge variant={
                      existingCms.status === 'PUBLISHED' ? 'default' :
                      existingCms.status === 'REVIEW' ? 'secondary' : 'outline'
                    }>
                      {existingCms.status}
                    </Badge>
                    {existingCms.articleType && (
                      <div className="mt-2">
                        <Badge variant="outline" className="text-xs">
                          {articleTypes.find(at => at.value === existingCms.articleType)?.label ?? existingCms.articleType}
                        </Badge>
                      </div>
                    )}
                    {(existingCms.categoryName || (existingCms.categoryId && categories.length > 0)) && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Category</p>
                        <p className="text-sm font-medium">
                          {existingCms.categoryName ||
                            (() => {
                              const find = (cats: typeof categories): string | undefined => {
                                for (const c of cats) {
                                  if (c.id === existingCms.categoryId) return c.name;
                                  if (c.children) { const found = find(c.children); if (found) return found; }
                                }
                              };
                              return find(categories) ?? `Category ${existingCms.categoryId}`;
                            })()
                          }
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Activity Log — shows what changed */}
              {paramId && activityLog.length > 0 && (
                <Card className={isViewMode ? 'border-blue-200' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <History className="w-4 h-4" />
                      {isViewMode ? 'Changes & History' : 'Activity'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {[...activityLog].reverse().map((ev, i) => {
                      const isEdit = ev.action === 'EDIT' || ev.action === 'UPDATE';
                      const isSubmit = ev.action === 'SUBMIT';
                      const isLatest = i === 0;
                      return (
                        <div
                          key={ev.id ?? i}
                          className={`text-xs border-l-2 pl-3 space-y-0.5 ${
                            isLatest && isViewMode ? 'border-primary' :
                            isEdit ? 'border-amber-400' :
                            isSubmit ? 'border-blue-400' :
                            'border-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-medium ${
                                isEdit ? 'text-amber-700' :
                                isSubmit ? 'text-blue-700' :
                                'text-foreground'
                              }`}>
                                {ev.action.replace(/_/g, ' ')}
                              </span>
                              {ev.version && (
                                <span className="bg-muted text-muted-foreground rounded px-1 py-0.5 text-[10px]">v{ev.version}</span>
                              )}
                              {isLatest && isViewMode && (
                                <span className="bg-primary text-primary-foreground rounded px-1 py-0.5 text-[10px]">Latest</span>
                              )}
                            </div>
                            <span className="text-muted-foreground whitespace-nowrap">
                              {new Date(ev.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {ev.fromStatus && ev.toStatus && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span>{ev.fromStatus}</span>
                              <ArrowRight className="w-3 h-3" />
                              <span>{ev.toStatus}</span>
                            </div>
                          )}
                          {ev.userName && <div className="text-muted-foreground">by {ev.userName}</div>}
                          {ev.comment && <div className="text-amber-600 italic">"{ev.comment}"</div>}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Thumbnail */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Thumbnail
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!isViewMode && (
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleThumbnailSelect}
                    />
                  )}
                  {thumbnailPreview ? (
                    <div className="relative">
                      <img
                        src={thumbnailPreview}
                        alt="Thumbnail preview"
                        className="w-full aspect-video object-cover rounded-lg"
                      />
                      {!isViewMode && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute bottom-2 right-2"
                          onClick={() => thumbnailInputRef.current?.click()}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                  ) : isViewMode ? (
                    <p className="text-sm text-muted-foreground italic">No thumbnail.</p>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => thumbnailInputRef.current?.click()}
                    >
                      <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to upload thumbnail</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary */}
              {!isViewMode && (
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Content Blocks</span>
                      <span className="font-medium">{contentBlocks.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium">
                        {categories.find(c => c.id.toString() === categoryId)?.name || 'Not selected'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Article Type</span>
                      <span className="font-medium">{(articleTypes.find(at => at.value === articleType)?.label ?? articleType) || 'None'}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Submit for Review confirmation dialog */}
      <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for Review?</AlertDialogTitle>
            <AlertDialogDescription>
              Your article will be queued for the reviewer group assigned to this category.
              A reviewer will pick it up from the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSubmitDialogOpen(false); handleSave(true); }}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
