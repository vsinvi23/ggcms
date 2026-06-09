import { useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, BookOpen, FileText, Clock, CheckCircle, XCircle,
  MessageSquare, Eye, Bell, ListTodo, Send, Edit, History, ArrowRight,
} from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ReviewerCommentThread } from '@/components/shared/ReviewerCommentThread';
import { format } from 'date-fns';
import { ReviewComment } from '@/types/content';
import { toast } from 'sonner';
import { useTasksQuery } from '@/api/hooks/useTasks';
import { useReviewComments, useCreateComment } from '@/api/hooks/useReviewComments';
import { useNotifications, useMarkRead, useMarkAllRead } from '@/api/hooks/useNotifications';
import { useApproveCms, useSendCmsBack, useRejectCms, useCmsActivity, useCmsById } from '@/api/hooks/useCms';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewCommentDto } from '@/api/types';

type ContentType = 'all' | 'courses' | 'articles';
type OwnershipFilter = 'all' | 'owned' | 'reviewing' | 'contributed';

interface TaskItem {
  id: number;
  contentId?: number;
  title: string;
  type: 'course' | 'article';
  status: string;        // stale task status column (kept for filters)
  liveStatus?: string;   // live CMS status from articles/courses table — always current
  ownershipType: string;
  updatedAt: string;
  version?: number;
  hasPendingDraft?: boolean;
  publishedVersion?: number | null;
}

// Adapter: maps ReviewCommentDto → ReviewComment (shape expected by ReviewerCommentThread)
function adaptComment(dto: ReviewCommentDto): ReviewComment {
  return {
    id: String(dto.id),
    authorId: dto.author ? String(dto.author.id ?? '') : '',
    authorName: dto.author?.name ?? 'Unknown',
    authorAvatar: undefined,
    content: dto.content,
    createdAt: dto.createdAt,
    replies: (dto.replies ?? []).map(adaptComment),
  };
}

const getOwnershipBadge = (ownershipType: string) => {
  switch (ownershipType) {
    case 'owned':
      return <Badge variant="default" className="bg-blue-500">My Content</Badge>;
    case 'reviewing':
      return <Badge variant="secondary" className="bg-orange-500 text-white">To Review</Badge>;
    case 'contributed':
      return <Badge variant="outline">Contributed</Badge>;
    default:
      return null;
  }
};

const MyTasks = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [contentFilter, setContentFilter] = useState<ContentType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [selectedItem, setSelectedItem] = useState<TaskItem | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [activeTab, setActiveTab] = useState('tasks');

  // ── Server-side data ───────────────────────────────────────────────────────
  const { data: tasksData, isLoading: tasksLoading } = useTasksQuery({
    type: contentFilter !== 'all' ? contentFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    ownershipType: ownershipFilter !== 'all' ? ownershipFilter : undefined,
    pageSize: 50,
  });
  const tasks: TaskItem[] = (tasksData?.items ?? []).map(t => ({
    id: t.id,
    contentId: t.contentId,
    title: t.title,
    type: t.type,
    status: t.status,
    liveStatus: t.liveStatus,
    ownershipType: t.ownershipType,
    updatedAt: t.updatedAt,
    version: t.version,
    hasPendingDraft: t.hasPendingDraft,
    publishedVersion: t.publishedVersion,
  }));

  const { data: notifData } = useNotifications();
  const notifications = notifData?.items ?? [];
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead } = useMarkAllRead();

  const selectedTaskId = selectedItem?.id;
  const selectedTaskType = selectedItem?.type;
  const { data: rawComments = [] } = useReviewComments(
    selectedTaskType ?? 'article',
    String(selectedTaskId ?? ''),
    !!selectedTaskId,
  );
  const comments: ReviewComment[] = (rawComments as ReviewCommentDto[]).map(adaptComment);

  const { user } = useAuth();
  const { mutateAsync: createComment } = useCreateComment();
  const { mutateAsync: approveCms } = useApproveCms();
  const { mutateAsync: sendBackCms } = useSendCmsBack();
  const { mutateAsync: rejectCms } = useRejectCms();

  // Fetch full CMS content + activity for the selected task (shown in review dialog)
  const selectedCmsId = selectedItem?.contentId ?? 0;
  const selectedCmsTypeStr = selectedItem?.type === 'course' ? ('COURSE' as const) : ('ARTICLE' as const);
  const isDialogOpen = showReviewDialog && selectedCmsId > 0;
  const { data: selectedCmsItem } = useCmsById(selectedCmsId, isDialogOpen, selectedCmsTypeStr);
  const { data: selectedActivity = [] } = useCmsActivity(selectedCmsId, selectedCmsTypeStr, isDialogOpen);
  // Derive rendered body HTML from the fetched item (handles both JSON-blocks and legacy HTML)
  const selectedBodyHtml = selectedCmsItem?.body ? parseBodyToHtml(selectedCmsItem.body) : '';

  // ── Client-side search filter ──────────────────────────────────────────────
  const filteredItems = tasks.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Stats — use liveStatus (live CMS state) if available, else fall back to task status ──
  const effectiveStatus = (t: TaskItem) => (t.liveStatus || t.status).toUpperCase();
  const stats = {
    pendingReview: tasks.filter(t => effectiveStatus(t) === 'REVIEW' || effectiveStatus(t) === 'IN_REVIEW').length,
    myContent: tasks.filter(t => t.ownershipType === 'owned').length,
    drafts: tasks.filter(t => effectiveStatus(t) === 'DRAFT').length,
    published: tasks.filter(t => effectiveStatus(t) === 'PUBLISHED').length,
    unreadNotifs: notifications.filter(n => !n.read).length,
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  // contentId is the CMS item ID; item.id is just the task ID
  const cmsType = (item: TaskItem) =>
    item.type === 'course' ? ('COURSE' as const) : ('ARTICLE' as const);

  const handleApprove = async (item: TaskItem) => {
    const cmsId = item.contentId ?? item.id;
    try {
      await approveCms({ id: cmsId, type: cmsType(item), data: undefined });
      toast.success('Content approved — ready to be published');
      setShowReviewDialog(false);
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleSendBack = async (item: TaskItem, comment: string) => {
    const cmsId = item.contentId ?? item.id;
    try {
      await sendBackCms({
        id: cmsId,
        type: cmsType(item),
        data: { reviewerId: user?.id ?? 0, comment },
      });
      if (comment.trim()) {
        await createComment({
          content: comment,
          contentType: item.type,
          contentId: String(cmsId),
        });
      }
      toast.success('Content sent back for revision');
      setShowReviewDialog(false);
      setReviewComment('');
    } catch {
      toast.error('Failed to send back');
    }
  };

  const handleReject = async (item: TaskItem, comment: string) => {
    const cmsId = item.contentId ?? item.id;
    if (!comment.trim()) {
      toast.error('A reason is required to reject content');
      return;
    }
    try {
      await rejectCms({
        id: cmsId,
        type: cmsType(item),
        data: { reviewerId: user?.id ?? 0, comment },
      });
      toast.success('Content rejected');
      setShowReviewDialog(false);
      setReviewComment('');
    } catch {
      toast.error('Failed to reject');
    }
  };

  const handleAddComment = async (content: string) => {
    if (!selectedItem || !content.trim()) return;
    await createComment({
      content,
      contentType: selectedItem.type,
      contentId: String(selectedItem.id),
    });
  };

  const openReviewDialog = (item: TaskItem) => {
    setSelectedItem(item);
    setShowReviewDialog(true);
  };

  const getActionButton = (item: TaskItem) => {
    const editPath = (i: TaskItem) => {
      const id = i.contentId ?? i.id;
      return i.type === 'course' ? `/courses/${id}/edit` : `/articles/${id}/edit`;
    };
    const reviewPath = (i: TaskItem) => {
      const id = i.contentId ?? i.id;
      return i.type === 'course' ? `/courses/${id}/edit?mode=view` : `/articles/${id}/edit?mode=view`;
    };

    if (item.ownershipType === 'owned') {
      const liveStatus = effectiveStatus(item);
      if (liveStatus === 'DRAFT') {
        return (
          <Button size="sm" variant="outline" onClick={() => navigate(editPath(item))}>
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
        );
      }
      return (
        <Button size="sm" variant="outline" onClick={() => openReviewDialog(item)}>
          <Eye className="w-4 h-4 mr-1" />
          View Status
        </Button>
      );
    }
    if (item.ownershipType === 'reviewing') {
      return (
        <Button size="sm" variant="default" onClick={() => navigate(reviewPath(item))}>
          <Eye className="w-4 h-4 mr-1" />
          Review
        </Button>
      );
    }
    return (
      <Button size="sm" variant="ghost" onClick={() => openReviewDialog(item)}>
        <Eye className="w-4 h-4 mr-1" />
        View
      </Button>
    );
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
          <p className="text-muted-foreground mt-1">
            View your content, pending reviews, and notifications
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setOwnershipFilter('reviewing')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Clock className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-2xl font-bold">{stats.pendingReview}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setOwnershipFilter('owned')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <ListTodo className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">My Content</p>
                  <p className="text-2xl font-bold">{stats.myContent}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <Edit className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">My Drafts</p>
                  <p className="text-2xl font-bold">{stats.drafts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Published</p>
                  <p className="text-2xl font-bold">{stats.published}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab('notifications')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg relative">
                  <Bell className="w-5 h-5 text-primary" />
                  {stats.unreadNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {stats.unreadNotifs}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Notifications</p>
                  <p className="text-2xl font-bold">{stats.unreadNotifs}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="tasks" className="gap-2">
              <ListTodo className="w-4 h-4" />
              Tasks &amp; Content
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              Notifications
              {stats.unreadNotifs > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {stats.unreadNotifs}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by title..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={ownershipFilter} onValueChange={(v) => setOwnershipFilter(v as OwnershipFilter)}>
                    <SelectTrigger className="w-full lg:w-[160px]">
                      <SelectValue placeholder="Ownership" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="owned">My Content</SelectItem>
                      <SelectItem value="reviewing">To Review</SelectItem>
                      <SelectItem value="contributed">Contributed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={contentFilter} onValueChange={(v) => setContentFilter(v as ContentType)}>
                    <SelectTrigger className="w-full lg:w-[140px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="courses">Courses</SelectItem>
                      <SelectItem value="articles">Articles</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full lg:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tasks Table */}
            <Card>
              <CardHeader>
                <CardTitle>Content &amp; Tasks ({filteredItems.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ListTodo className="mx-auto h-12 w-12 mb-4 opacity-40" />
                    <p className="text-lg font-medium">No tasks yet</p>
                    <p className="text-sm">Content assigned to you will appear here.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Ownership</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              {item.type === 'course' ? (
                                <BookOpen className="w-3 h-3" />
                              ) : (
                                <FileText className="w-3 h-3" />
                              )}
                              {item.type === 'course' ? 'Course' : 'Article'}
                            </Badge>
                          </TableCell>
                          <TableCell>{getOwnershipBadge(item.ownershipType)}</TableCell>
                          <TableCell>
                            <StatusBadge
                              status={item.liveStatus || item.status}
                              hasPendingDraft={item.hasPendingDraft}
                              publishedVersion={item.publishedVersion}
                            />
                          </TableCell>
                          <TableCell>
                            {item.updatedAt
                              ? format(new Date(item.updatedAt), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {getActionButton(item)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    Notifications
                  </CardTitle>
                  {notifications.some(n => !n.read) && (
                    <Button variant="outline" size="sm" onClick={() => markAllRead()}>
                      Mark all read
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-12">
                    <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground">No notifications</h3>
                    <p className="text-muted-foreground mt-1">You&apos;re all caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={`p-4 rounded-lg border flex items-start gap-3 cursor-pointer ${
                          !notification.read ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
                        }`}
                        onClick={() => {
                          if (!notification.read) {
                            markRead(notification.id);
                          }
                          if (notification.link) {
                            navigate(notification.link);
                          }
                        }}
                      >
                        <div className="p-2 rounded-full bg-primary/10">
                          <Bell className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(notification.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Review Dialog */}
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedItem?.type === 'course' ? (
                  <BookOpen className="w-5 h-5 text-blue-500" />
                ) : (
                  <FileText className="w-5 h-5 text-purple-500" />
                )}
                {selectedItem?.ownershipType === 'reviewing' ? 'Review: ' : 'View: '}
                {selectedItem?.title}
              </DialogTitle>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-6">
                {/* Meta strip — status, version, author */}
                <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-lg text-sm">
                  <StatusBadge
                    status={selectedItem.liveStatus || selectedItem.status}
                    hasPendingDraft={selectedItem.hasPendingDraft}
                    publishedVersion={selectedItem.publishedVersion}
                  />
                  {selectedItem.version && (
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                      v{selectedItem.version}
                    </span>
                  )}
                  {selectedCmsItem?.createdByName && (
                    <span className="text-muted-foreground">
                      by <span className="font-medium text-foreground">{selectedCmsItem.createdByName}</span>
                    </span>
                  )}
                  {selectedCmsItem?.categoryName && (
                    <span className="text-muted-foreground">
                      in <span className="font-medium text-foreground">{selectedCmsItem.categoryName}</span>
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto gap-1.5 text-xs"
                    onClick={() => {
                      const id = selectedItem.contentId ?? selectedItem.id;
                      const path = selectedItem.type === 'course'
                        ? `/courses/${id}/edit?mode=view`
                        : `/articles/${id}/edit?mode=view`;
                      window.open(path, '_blank');
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open editor
                  </Button>
                </div>

                {/* Inline content preview */}
                <div className="rounded-lg border bg-background">
                  <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold leading-snug">{selectedItem.title}</h2>
                    {selectedCmsItem?.description && (
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        {selectedCmsItem.description}
                      </p>
                    )}
                  </div>
                  {selectedBodyHtml ? (
                    <div
                      className="p-4 prose prose-sm max-w-none max-h-72 overflow-y-auto text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedBodyHtml) }}
                    />
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground italic">
                      {isDialogOpen && !selectedCmsItem ? 'Loading content…' : 'No body content.'}
                    </div>
                  )}
                </div>

                {/* Reviewer comment from a previous review cycle */}
                {selectedCmsItem?.reviewerComment && (
                  <div className="flex gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
                    <MessageSquare className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        Previous reviewer note
                        {selectedCmsItem.reviewerName ? ` (${selectedCmsItem.reviewerName})` : ''}
                      </p>
                      <p className="text-amber-700 mt-0.5">{selectedCmsItem.reviewerComment}</p>
                    </div>
                  </div>
                )}

                {/* Change History — highlighted for reviewers */}
                {selectedActivity.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Change History
                      <span className="text-xs font-normal text-muted-foreground">(most recent first)</span>
                    </h3>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {[...selectedActivity].reverse().map((ev, i) => {
                        const isLatest = i === 0;
                        const isEdit = ev.action === 'EDIT' || ev.action === 'UPDATE';
                        const isReview = ev.action === 'SUBMIT';
                        return (
                          <div
                            key={ev.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                              isLatest
                                ? 'border-primary/40 bg-primary/5'
                                : isEdit
                                ? 'border-amber-200 bg-amber-50/50'
                                : 'border-muted bg-muted/30'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-medium text-xs uppercase tracking-wide ${
                                  isEdit ? 'text-amber-700' :
                                  isReview ? 'text-blue-700' :
                                  'text-foreground'
                                }`}>
                                  {ev.action.replace(/_/g, ' ')}
                                </span>
                                {ev.version && (
                                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                                    v{ev.version}
                                  </span>
                                )}
                                {isLatest && (
                                  <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-[10px]">
                                    Latest
                                  </span>
                                )}
                              </div>
                              {ev.fromStatus && ev.toStatus && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <span>{ev.fromStatus}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>{ev.toStatus}</span>
                                </div>
                              )}
                              {ev.userName && (
                                <div className="text-xs text-muted-foreground mt-0.5">by {ev.userName}</div>
                              )}
                              {ev.comment && (
                                <div className="text-xs text-amber-700 italic mt-1">"{ev.comment}"</div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(ev.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Comments &amp; Feedback
                  </h3>
                  <ReviewerCommentThread
                    comments={comments}
                    onAddComment={handleAddComment}
                  />
                </div>

                {/* Review Actions — only for reviewers when content is actually in review */}
                {selectedItem.ownershipType === 'reviewing' && (effectiveStatus(selectedItem) === 'REVIEW' || effectiveStatus(selectedItem) === 'IN_REVIEW') && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-3">Review Decision</h3>
                    <Textarea
                      placeholder="Enter your review comments or feedback..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(selectedItem)}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleSendBack(selectedItem, reviewComment)}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Send Back
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(selectedItem, reviewComment)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* Owner Actions */}
                {selectedItem.ownershipType === 'owned' && selectedItem.status === 'draft' && (
                  <div className="border-t pt-4">
                    <div className="flex gap-2">
                      <Button variant="outline">
                        <Edit className="w-4 h-4 mr-2" />
                        Continue Editing
                      </Button>
                      <Button>
                        <Send className="w-4 h-4 mr-2" />
                        Submit for Review
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default MyTasks;
