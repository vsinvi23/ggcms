import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useCmsList, useDeleteCms, useSubmitCmsForReview, useClaimReview, useAssignReviewer, useReassignReview } from '@/api/hooks/useCms';
import { useCategories, useCategoryReviewers } from '@/api/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { CmsResponseDto } from '@/api/types';
import { buildArticleUrl } from '@/lib/slug';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Pencil,
  Loader2,
  Trash2,
  MoreHorizontal,
  Eye,
  LayoutGrid,
  List,
  ArrowRight,
  SendHorizonal,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';


const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PUBLISHED', label: 'Published' },
];

function AssignDialog({ item, open, onClose }: { item: CmsResponseDto | null; open: boolean; onClose: () => void }) {
  const { data: reviewers = [], isLoading } = useCategoryReviewers(item?.categoryId ?? null);
  const assignReviewer = useAssignReviewer();
  const [selectedId, setSelectedId] = useState('');

  const handleAssign = async () => {
    if (!item || !selectedId) return;
    try {
      await assignReviewer.mutateAsync({ id: item.id, userId: Number(selectedId), type: 'ARTICLE' });
      toast.success('Reviewer assigned');
      setSelectedId('');
      onClose();
    } catch {
      toast.error('Failed to assign reviewer');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelectedId(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item?.status === 'APPROVED' ? 'Assign Publisher' : 'Assign Reviewer'}</DialogTitle>
          <DialogDescription>
            {item?.status === 'APPROVED' ? 'Assign a publisher for' : 'Assign a reviewer for'} &ldquo;{item?.title}&rdquo;
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : reviewers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No reviewer groups are configured for this category. Set them up in <strong>Configuration → Category Reviewer Groups</strong>.
          </p>
        ) : (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a person..." />
            </SelectTrigger>
            <SelectContent>
              {reviewers.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setSelectedId(''); onClose(); }}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!selectedId || assignReviewer.isPending}>
            {assignReviewer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArticleManagement() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('_all');
  const [categoryFilter, setCategoryFilter] = useState('_all');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const pageSize = 10;

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; article: CmsResponseDto | null }>({ open: false, article: null });
  const [submitDialog, setSubmitDialog] = useState<{ open: boolean; article: CmsResponseDto | null }>({ open: false, article: null });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; article: CmsResponseDto | null }>({ open: false, article: null });

  const { data: categoriesData } = useCategories();
  const categories = categoriesData || [];

  const { data: cmsData, isLoading, error, refetch } = useCmsList({
    page,
    size: pageSize,
    type: 'ARTICLE',
    search: searchQuery.trim() || undefined,
    status: statusFilter !== '_all' ? statusFilter : undefined,
    categoryId: categoryFilter !== '_all' ? parseInt(categoryFilter) : undefined,
  });
  const deleteCms = useDeleteCms();
  const submitForReview = useSubmitCmsForReview();
  const claimReview = useClaimReview();
  const reassignReview = useReassignReview();

  const handleUnassign = async (article: CmsResponseDto) => {
    try {
      await reassignReview.mutateAsync({ id: article.id, type: 'ARTICLE', note: '' });
      toast.success('Assignee removed');
    } catch {
      toast.error('Failed to remove assignee');
    }
  };

  const articles = cmsData?.items || [];
  const totalPages = Math.ceil((cmsData?.totalElements || 0) / pageSize);

  const handleDelete = async () => {
    if (!deleteDialog.article) return;
    try {
      await deleteCms.mutateAsync({ id: deleteDialog.article.id, type: 'ARTICLE' });
      toast.success('Article deleted');
      setDeleteDialog({ open: false, article: null });
      refetch();
    } catch {
      toast.error('Failed to delete article');
    }
  };

  const handleSubmitForReview = async () => {
    if (!submitDialog.article) return;
    try {
      await submitForReview.mutateAsync({ id: submitDialog.article.id, type: 'ARTICLE', data: {} });
      toast.success('Article submitted for review');
      setSubmitDialog({ open: false, article: null });
      refetch();
    } catch {
      toast.error('Failed to submit article for review');
    }
  };

  const handleClaimReview = async (article: CmsResponseDto) => {
    try {
      await claimReview.mutateAsync({ id: article.id, type: 'ARTICLE' });
      navigate(`/articles/${article.slug ?? article.id}/edit?mode=view`);
    } catch {
      toast.error('Failed to claim — it may have been taken by someone else');
    }
  };

  function ArticleStatus({ article }: { article: CmsResponseDto }) {
    const dot = (color: string) => <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
    if (article.status === 'DRAFT') return (
      <div className="flex items-center gap-1.5">{dot('bg-slate-400')}<span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Draft</span></div>
    );
    if (article.status === 'REVIEW') return (
      <div className="flex items-center gap-1.5">
        {dot('bg-yellow-500')}
        <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">In Review</span>
        {(article.requiredApprovals ?? 1) > 1 && article.approvalCount != null && (
          <Badge variant="outline" className="text-[10px] py-0 px-1 text-yellow-700 border-yellow-300">
            {article.approvalCount}/{article.requiredApprovals}
          </Badge>
        )}
      </div>
    );
    if (article.status === 'APPROVED') return (
      <div className="flex items-center gap-1.5">{dot('bg-blue-500')}<span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Approved</span></div>
    );
    if (article.status === 'PUBLISHED') return (
      <div className="flex items-center gap-1.5">
        {dot('bg-green-500')}
        <span className="text-xs font-semibold text-green-700 dark:text-green-400">Published</span>
        {article.hasPendingDraft && (
          <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-600 border-amber-300">draft</Badge>
        )}
      </div>
    );
    return <div className="flex items-center gap-1.5">{dot('bg-red-400')}<span className="text-xs font-semibold text-red-600">{article.status}</span></div>;
  }

  function ArticleAssignedTo({ article, onAssign, onUnassign }: { article: CmsResponseDto; onAssign?: () => void; onUnassign?: () => void }) {
    if (article.status === 'REVIEW') {
      if (!article.reviewerName) {
        return onAssign
          ? <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={onAssign}><UserPlus className="w-3 h-3" />Assign</Button>
          : <span className="text-xs text-amber-600 dark:text-amber-400">Unassigned</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{article.reviewerName} <span className="italic text-xs">reviewing</span></span>
          {onUnassign && <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={onUnassign}><UserX className="w-3 h-3" /></Button>}
        </div>
      );
    }
    if (article.status === 'APPROVED') {
      if (!article.reviewerName) {
        return onAssign
          ? <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={onAssign}><UserPlus className="w-3 h-3" />Assign</Button>
          : <span className="text-xs text-blue-600 dark:text-blue-400">Unassigned</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{article.reviewerName} <span className="italic text-xs">publishing</span></span>
          {onUnassign && <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={onUnassign}><UserX className="w-3 h-3" /></Button>}
        </div>
      );
    }
    if (article.status === 'PUBLISHED' && article.reviewerName) {
      return <span className="text-sm text-muted-foreground">{article.reviewerName}</span>;
    }
    return <span className="text-muted-foreground/50 text-sm">—</span>;
  }

  const ArticleActions = ({ article }: { article: CmsResponseDto }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background border">
        <DropdownMenuItem onClick={() => navigate(`/articles/${article.slug ?? article.id}/edit`)}>
          <Pencil className="w-4 h-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`${buildArticleUrl(article)}?preview=true`, '_blank')}>
          <Eye className="w-4 h-4 mr-2" /> Preview
        </DropdownMenuItem>

        {/* DRAFT: submit for review */}
        {article.status === 'DRAFT' && (
          <DropdownMenuItem onClick={() => setSubmitDialog({ open: true, article })}>
            <SendHorizonal className="w-4 h-4 mr-2" /> Submit for Review
          </DropdownMenuItem>
        )}

        {/* REVIEW phase */}
        {article.status === 'REVIEW' && (
          <DropdownMenuItem onClick={() => handleClaimReview(article)}>
            <UserCheck className="w-4 h-4 mr-2" /> Claim for Review
          </DropdownMenuItem>
        )}
        {article.status === 'REVIEW' && article.reviewerId && (
          <DropdownMenuItem onClick={() => navigate(`/articles/${article.slug ?? article.id}/edit?mode=view`)}>
            <ArrowRight className="w-4 h-4 mr-2" /> Open for Review
          </DropdownMenuItem>
        )}

        {/* APPROVED phase */}
        {article.status === 'APPROVED' && (
          <DropdownMenuItem onClick={() => handleClaimReview(article)}>
            <UserCheck className="w-4 h-4 mr-2" /> Claim for Publishing
          </DropdownMenuItem>
        )}
        {article.status === 'APPROVED' && article.reviewerId && (
          <DropdownMenuItem onClick={() => navigate(`/articles/${article.slug ?? article.id}/edit?mode=view`)}>
            <ArrowRight className="w-4 h-4 mr-2" /> Open to Publish
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => setDeleteDialog({ open: true, article })}
        >
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Article Management</h1>
            <p className="text-muted-foreground">Create, edit, and publish articles.</p>
          </div>
          <Button onClick={() => navigate('/articles/create')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Article
          </Button>
        </div>

        {/* Filters + view toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center border rounded-md overflow-hidden">
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none px-3"
              onClick={() => setView('list')}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none px-3"
              onClick={() => setView('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading articles...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load articles. Please try again.
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No articles found.
          </div>
        ) : view === 'grid' ? (
          /* Grid view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {articles.map((article: CmsResponseDto) => (
              <Card key={article.id} className="group hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors flex-1 min-w-0">
                      {article.title || 'Untitled'}
                    </h3>
                    <ArticleActions article={article} />
                  </div>
                  {article.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{article.description}</p>
                  )}
                  <div className="space-y-0.5">
                    <ArticleStatus article={article} />
                    <div className="pl-3.5"><ArticleAssignedTo article={article} onAssign={isAdmin ? () => setAssignDialog({ open: true, article }) : undefined} onUnassign={isAdmin && !!article.reviewerName ? () => handleUnassign(article) : undefined} /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* List / table view */
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article: CmsResponseDto) => (
                    <TableRow key={article.id}>
                      <TableCell className="font-medium">
                        {article.title || 'Untitled'}
                        {article.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {article.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <ArticleStatus article={article} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {article.createdByName || '—'}
                      </TableCell>
                      <TableCell>
                        <ArticleAssignedTo article={article} onAssign={isAdmin ? () => setAssignDialog({ open: true, article }) : undefined} onUnassign={isAdmin && !!article.reviewerName ? () => handleUnassign(article) : undefined} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(article.createdAt), 'PP')}
                      </TableCell>
                      <TableCell>
                        <ArticleActions article={article} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, article: open ? deleteDialog.article : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Article</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.article?.title || 'Untitled'}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, article: null })}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteCms.isPending}>
              {deleteCms.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Review Confirmation Dialog */}
      <Dialog open={submitDialog.open} onOpenChange={(open) => setSubmitDialog({ open, article: open ? submitDialog.article : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Review?</DialogTitle>
            <DialogDescription>
              "{submitDialog.article?.title || 'Untitled'}" will be queued for review. A reviewer will pick it up from the queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialog({ open: false, article: null })}>Cancel</Button>
            <Button onClick={handleSubmitForReview} disabled={submitForReview.isPending}>
              {submitForReview.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Reviewer / Publisher Dialog */}
      <AssignDialog
        item={assignDialog.article}
        open={assignDialog.open}
        onClose={() => setAssignDialog({ open: false, article: null })}
      />
    </DashboardLayout>
  );
}
