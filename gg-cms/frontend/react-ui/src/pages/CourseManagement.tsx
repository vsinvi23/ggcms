import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useCmsList, useDeleteCms, useSubmitCmsForReview, useClaimReview, useAssignReviewer, useReassignReview } from '@/api/hooks/useCms';
import { useCategories, useCategoryReviewers } from '@/api/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { CmsResponseDto } from '@/api/types';
import { buildCourseUrl } from '@/lib/slug';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  Pencil,
  Loader2,
  Trash2,
  MoreHorizontal,
  Eye,
  Grid,
  List,
  ArrowRight,
  SendHorizonal,
  UserCheck,
  UserPlus,
  UserX,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';


function AssignDialog({ item, open, onClose }: { item: CmsResponseDto | null; open: boolean; onClose: () => void }) {
  const { data: reviewers = [], isLoading } = useCategoryReviewers(item?.categoryId ?? null);
  const assignReviewer = useAssignReviewer();
  const [selectedId, setSelectedId] = useState('');

  const handleAssign = async () => {
    if (!item || !selectedId) return;
    try {
      await assignReviewer.mutateAsync({ id: item.id, userId: Number(selectedId), type: 'COURSE' });
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
            {item?.status === 'APPROVED'
              ? 'Select a person to publish this course.'
              : 'Select a person to review this course.'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : reviewers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No reviewer groups are configured for this category. Set them up in Configuration → Category Reviewer Groups.
          </p>
        ) : (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Select a person..." /></SelectTrigger>
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

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PUBLISHED', label: 'Published' },
];

export default function CourseManagement() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('_all');
  const [categoryFilter, setCategoryFilter] = useState('_all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const pageSize = 10;

  const { isAdmin } = useAuth();
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; course: CmsResponseDto | null }>({ open: false, course: null });
  const [submitDialog, setSubmitDialog] = useState<{ open: boolean; course: CmsResponseDto | null }>({ open: false, course: null });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; course: CmsResponseDto | null }>({ open: false, course: null });

  const { data: categoriesData } = useCategories();
  const categories = categoriesData || [];

  const { data: cmsData, isLoading, error, refetch } = useCmsList({
    page,
    size: pageSize,
    type: 'COURSE',
    search: searchQuery.trim() || undefined,
    status: statusFilter !== '_all' ? statusFilter : undefined,
    categoryId: categoryFilter !== '_all' ? parseInt(categoryFilter) : undefined,
  });
  const deleteCms = useDeleteCms();
  const submitForReview = useSubmitCmsForReview();
  const claimReview = useClaimReview();
  const reassignReview = useReassignReview();

  const handleUnassign = async (course: CmsResponseDto) => {
    try {
      await reassignReview.mutateAsync({ id: course.id, type: 'COURSE', note: '' });
      toast.success('Assignee removed');
    } catch {
      toast.error('Failed to remove assignee');
    }
  };

  const courses = cmsData?.items || [];
  const totalPages = Math.ceil((cmsData?.totalElements || 0) / pageSize);

  const handleDelete = async () => {
    if (!deleteDialog.course) return;
    try {
      await deleteCms.mutateAsync({ id: deleteDialog.course.id, type: 'COURSE' });
      toast.success('Course deleted');
      setDeleteDialog({ open: false, course: null });
      refetch();
    } catch {
      toast.error('Failed to delete course');
    }
  };

  const handleSubmitForReview = async () => {
    if (!submitDialog.course) return;
    try {
      await submitForReview.mutateAsync({ id: submitDialog.course.id, type: 'COURSE', data: {} });
      toast.success('Course submitted for review');
      setSubmitDialog({ open: false, course: null });
      refetch();
    } catch {
      toast.error('Failed to submit course for review');
    }
  };

  const handleClaimReview = async (course: CmsResponseDto) => {
    try {
      await claimReview.mutateAsync({ id: course.id, type: 'COURSE' });
      navigate(`/courses/${course.slug ?? course.id}/edit?mode=view`);
    } catch {
      toast.error('Failed to claim — it may have been taken by someone else');
    }
  };

  function CourseStatus({ course }: { course: CmsResponseDto }) {
    const dot = (color: string) => <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
    if (course.status === 'DRAFT') return (
      <div className="flex items-center gap-1.5">{dot('bg-slate-400')}<span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Draft</span></div>
    );
    if (course.status === 'REVIEW') return (
      <div className="flex items-center gap-1.5">
        {dot('bg-yellow-500')}
        <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">In Review</span>
        {(course.requiredApprovals ?? 1) > 1 && course.approvalCount != null && (
          <Badge variant="outline" className="text-[10px] py-0 px-1 text-yellow-700 border-yellow-300">
            {course.approvalCount}/{course.requiredApprovals}
          </Badge>
        )}
      </div>
    );
    if (course.status === 'APPROVED') return (
      <div className="flex items-center gap-1.5">{dot('bg-blue-500')}<span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Approved</span></div>
    );
    if (course.status === 'PUBLISHED') return (
      <div className="flex items-center gap-1.5">
        {dot('bg-green-500')}
        <span className="text-xs font-semibold text-green-700 dark:text-green-400">Published</span>
        {course.hasPendingDraft && (
          <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-600 border-amber-300">draft</Badge>
        )}
      </div>
    );
    return <div className="flex items-center gap-1.5">{dot('bg-red-400')}<span className="text-xs font-semibold text-red-600">{course.status}</span></div>;
  }

  function CourseAssignedTo({ course, onAssign, onUnassign }: { course: CmsResponseDto; onAssign?: () => void; onUnassign?: () => void }) {
    if (course.status === 'REVIEW') {
      if (!course.reviewerName) {
        return onAssign
          ? <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={onAssign}><UserPlus className="w-3 h-3" />Assign</Button>
          : <span className="text-xs text-amber-600 dark:text-amber-400">Unassigned</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{course.reviewerName} <span className="italic text-xs">reviewing</span></span>
          {onUnassign && <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={onUnassign}><UserX className="w-3 h-3" /></Button>}
        </div>
      );
    }
    if (course.status === 'APPROVED') {
      if (!course.reviewerName) {
        return onAssign
          ? <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={onAssign}><UserPlus className="w-3 h-3" />Assign</Button>
          : <span className="text-xs text-blue-600 dark:text-blue-400">Unassigned</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{course.reviewerName} <span className="italic text-xs">publishing</span></span>
          {onUnassign && <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={onUnassign}><UserX className="w-3 h-3" /></Button>}
        </div>
      );
    }
    if (course.status === 'PUBLISHED' && course.reviewerName) {
      return <span className="text-sm text-muted-foreground">{course.reviewerName}</span>;
    }
    return <span className="text-muted-foreground/50 text-sm">—</span>;
  }

  const CourseActions = ({ course }: { course: CmsResponseDto }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background border">
        <DropdownMenuItem onClick={() => navigate(`/courses/${course.slug ?? course.id}/edit`)}>
          <Pencil className="w-4 h-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`${buildCourseUrl(course)}?preview=true`, '_blank')}>
          <Eye className="w-4 h-4 mr-2" /> Preview
        </DropdownMenuItem>

        {course.status === 'DRAFT' && (
          <DropdownMenuItem onClick={() => setSubmitDialog({ open: true, course })}>
            <SendHorizonal className="w-4 h-4 mr-2" /> Submit for Review
          </DropdownMenuItem>
        )}

        {course.status === 'REVIEW' && (
          <DropdownMenuItem onClick={() => handleClaimReview(course)}>
            <UserCheck className="w-4 h-4 mr-2" /> Claim for Review
          </DropdownMenuItem>
        )}
        {course.status === 'REVIEW' && course.reviewerId && (
          <DropdownMenuItem onClick={() => navigate(`/courses/${course.slug ?? course.id}/edit?mode=view`)}>
            <ArrowRight className="w-4 h-4 mr-2" /> Open for Review
          </DropdownMenuItem>
        )}

        {course.status === 'APPROVED' && (
          <DropdownMenuItem onClick={() => handleClaimReview(course)}>
            <UserCheck className="w-4 h-4 mr-2" /> Claim for Publishing
          </DropdownMenuItem>
        )}
        {course.status === 'APPROVED' && course.reviewerId && (
          <DropdownMenuItem onClick={() => navigate(`/courses/${course.slug ?? course.id}/edit?mode=view`)}>
            <ArrowRight className="w-4 h-4 mr-2" /> Open to Publish
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => setDeleteDialog({ open: true, course })}
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
            <h1 className="text-2xl font-bold">Course Management</h1>
            <p className="text-muted-foreground">Create, edit, and publish courses.</p>
          </div>
          <Button onClick={() => navigate('/courses/create')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Course
          </Button>
        </div>

        {/* Filters + view toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
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
              <Grid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading courses...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load courses. Please try again.
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No courses found.
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {courses.map((course: CmsResponseDto) => (
              <Card key={course.id} className="group hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                      <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {course.title || 'Untitled Course'}
                      </h3>
                    </div>
                    <CourseActions course={course} />
                  </div>
                  {course.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{course.description}</p>
                  )}
                  <div className="space-y-0.5">
                    <CourseStatus course={course} />
                    <div className="pl-3.5"><CourseAssignedTo course={course} onAssign={isAdmin ? () => setAssignDialog({ open: true, course }) : undefined} onUnassign={isAdmin && !!course.reviewerName ? () => handleUnassign(course) : undefined} /></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(course.createdAt), 'PP')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
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
                  {courses.map((course: CmsResponseDto) => (
                    <TableRow key={course.id}>
                      <TableCell className="font-medium">
                        {course.title || 'Untitled'}
                        {course.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {course.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <CourseStatus course={course} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {course.createdByName || '—'}
                      </TableCell>
                      <TableCell>
                        <CourseAssignedTo course={course} onAssign={isAdmin ? () => setAssignDialog({ open: true, course }) : undefined} onUnassign={isAdmin && !!course.reviewerName ? () => handleUnassign(course) : undefined} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(course.createdAt), 'PP')}
                      </TableCell>
                      <TableCell>
                        <CourseActions course={course} />
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
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, course: open ? deleteDialog.course : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.course?.title || 'Untitled'}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, course: null })}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteCms.isPending}>
              {deleteCms.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Review Confirmation Dialog */}
      <Dialog open={submitDialog.open} onOpenChange={(open) => setSubmitDialog({ open, course: open ? submitDialog.course : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Review?</DialogTitle>
            <DialogDescription>
              "{submitDialog.course?.title || 'Untitled'}" will be queued for review. A reviewer will pick it up from the queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialog({ open: false, course: null })}>Cancel</Button>
            <Button onClick={handleSubmitForReview} disabled={submitForReview.isPending}>
              {submitForReview.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Reviewer / Publisher Dialog (admin only) */}
      <AssignDialog
        item={assignDialog.course}
        open={assignDialog.open}
        onClose={() => setAssignDialog({ open: false, course: null })}
      />
    </DashboardLayout>
  );
}
