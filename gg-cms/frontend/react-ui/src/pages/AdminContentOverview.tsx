import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useCmsList, useApproveCms, usePublishCms, useSendCmsBack, useAssignReviewer } from '@/api/hooks/useCms';
import { useCategories, useCategoryReviewers } from '@/api/hooks/useCategories';
import { CmsResponseDto } from '@/api/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Loader2, CheckCircle, Globe, MoreHorizontal, Undo2, Eye, ClipboardCheck, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';


type ContentType = 'ARTICLE' | 'COURSE';

function AssignReviewerCell({ item, contentType }: { item: CmsResponseDto; contentType: ContentType }) {
  const [open, setOpen] = useState(false);
  const { data: reviewers = [] } = useCategoryReviewers(item.categoryId);
  const assignReviewer = useAssignReviewer();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
          <UserPlus className="w-3.5 h-3.5" />
          Assign
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Select reviewer from category group:
        </p>
        {reviewers.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">No reviewer groups assigned to this category.</p>
        ) : (
          reviewers.map((r) => (
            <Button
              key={r.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={assignReviewer.isPending}
              onClick={() => {
                assignReviewer.mutate(
                  { id: item.id, userId: r.id, type: contentType },
                  { onSuccess: () => { setOpen(false); toast.success(`Assigned to ${r.name}`); },
                    onError: () => toast.error('Failed to assign reviewer') }
                );
              }}
            >
              {r.name}
            </Button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

function ContentTable({
  contentType,
  search,
  status,
  categoryId,
}: {
  contentType: ContentType;
  search: string;
  status: string;
  categoryId: number | undefined;
}) {
  const navigate = useNavigate();
  const { data, isLoading } = useCmsList({
    type: contentType,
    page: 0,
    size: 100,
    search: search || undefined,
    status: status !== 'ALL' ? status : undefined,
    categoryId,
  });
  const approveMutation = useApproveCms();
  const publishMutation = usePublishCms();
  const sendBackMutation = useSendCmsBack();

  const [sendBackItem, setSendBackItem] = useState<CmsResponseDto | null>(null);
  const [sendBackComment, setSendBackComment] = useState('');

  const items = data?.items ?? [];

  const handleApprove = async (item: CmsResponseDto) => {
    try {
      await approveMutation.mutateAsync({ id: item.id, type: item.type });
      toast.success(`"${item.title}" approved`);
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handlePublish = async (item: CmsResponseDto) => {
    try {
      await publishMutation.mutateAsync({ id: item.id, type: item.type });
      toast.success(`"${item.title}" published`);
    } catch {
      toast.error('Failed to publish');
    }
  };

  const handleSendBack = async () => {
    if (!sendBackItem || !sendBackComment.trim()) return;
    try {
      await sendBackMutation.mutateAsync({ id: sendBackItem.id, type: sendBackItem.type, data: { comment: sendBackComment } });
      toast.success('Sent back for revision');
      setSendBackItem(null);
      setSendBackComment('');
    } catch {
      toast.error('Failed to send back');
    }
  };

  const editPath = (item: CmsResponseDto) => {
    const key = item.slug ?? item.id;
    return contentType === 'COURSE' ? `/courses/${key}/edit` : `/articles/${key}/edit`;
  };

  const reviewPath = (item: CmsResponseDto) => {
    const key = item.slug ?? item.id;
    return contentType === 'COURSE' ? `/courses/${key}/edit?mode=view` : `/articles/${key}/edit?mode=view`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No {contentType.toLowerCase()}s found.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-xs">
                <p className="font-medium truncate">{item.title}</p>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.createdByName || `User #${item.createdBy}`}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.categoryName ?? '—'}
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={item.status}
                  hasPendingDraft={item.hasPendingDraft}
                  publishedVersion={item.publishedVersion}
                />
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {(item.status === 'REVIEW' || item.status === 'APPROVED') && !item.reviewerId ? (
                  <AssignReviewerCell item={item} contentType={contentType} />
                ) : item.reviewerName ? (
                  <div>
                    <span className="text-muted-foreground">{item.reviewerName}</span>
                    <span className="ml-1 text-xs text-muted-foreground/60 italic">
                      {item.status === 'APPROVED' ? '(publisher)' : item.status === 'REVIEW' ? '(reviewer)' : ''}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {item.updatedAt ? format(new Date(item.updatedAt), 'MMM d, yyyy') : '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {/* Prominent state-aware action button */}
                  {item.status === 'REVIEW' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => navigate(reviewPath(item))}
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      Review
                    </Button>
                  )}
                  {item.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => navigate(reviewPath(item))}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Publish
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(
                        item.status === 'REVIEW' || item.status === 'APPROVED'
                          ? reviewPath(item)
                          : editPath(item)
                      )}>
                        <Eye className="w-4 h-4 mr-2" />
                        {item.status === 'REVIEW' ? 'Open Review View' : item.status === 'APPROVED' ? 'Open Approved View' : 'View / Edit'}
                      </DropdownMenuItem>
                      {(item.status === 'DRAFT' || item.status === 'REJECTED') && (
                        <DropdownMenuItem onClick={() => navigate(editPath(item))}>
                          <Eye className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                      )}
                      {item.status === 'REVIEW' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleApprove(item)}>
                            <CheckCircle className="w-4 h-4 mr-2 text-green-600" /> Approve (quick)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSendBackItem(item)}>
                            <Undo2 className="w-4 h-4 mr-2 text-amber-600" /> Send Back
                          </DropdownMenuItem>
                        </>
                      )}
                      {item.status === 'APPROVED' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handlePublish(item)}>
                            <Globe className="w-4 h-4 mr-2 text-blue-600" /> Publish (quick)
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!sendBackItem} onOpenChange={(open) => { if (!open) { setSendBackItem(null); setSendBackComment(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back for Revision</DialogTitle>
            <DialogDescription>
              Provide feedback so the author knows what to fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-comment">Comment</Label>
            <Textarea
              id="send-back-comment"
              placeholder="Explain what needs to be changed..."
              value={sendBackComment}
              onChange={(e) => setSendBackComment(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendBackItem(null); setSendBackComment(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={!sendBackComment.trim() || sendBackMutation.isPending}
            >
              {sendBackMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminContentOverview() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ContentType>('ARTICLE');

  const { data: categoriesRaw } = useCategories();
  const categories = categoriesRaw ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Overview</h1>
          <p className="text-muted-foreground">All articles and courses with owner and workflow state</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="REVIEW">In Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryId != null ? String(categoryId) : 'ALL'}
            onValueChange={(v) => setCategoryId(v === 'ALL' ? undefined : Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentType)}>
          <TabsList>
            <TabsTrigger value="ARTICLE">Articles</TabsTrigger>
            <TabsTrigger value="COURSE">Courses</TabsTrigger>
          </TabsList>

          <TabsContent value="ARTICLE" className="mt-4">
            <ContentTable
              contentType="ARTICLE"
              search={search}
              status={status}
              categoryId={categoryId}
            />
          </TabsContent>

          <TabsContent value="COURSE" className="mt-4">
            <ContentTable
              contentType="COURSE"
              search={search}
              status={status}
              categoryId={categoryId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
