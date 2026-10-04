import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useLearningPaths, useCreateLearningPath, useUpdateLearningPath, useDeleteLearningPath, useSetLearningPathCourses, useLearningPath } from '@/api/hooks/useLearningPaths';
import { useCmsList } from '@/api/hooks/useCms';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Loader2, Trash2, MoreHorizontal, Layout, List } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import { Textarea } from '@/components/ui/textarea';

type LearningPath = {
  id: number;
  title: string;
  description: string;
  kind: string;
  courseCount: number;
  createdAt: string;
  slug: string;
};

type CourseAssignment = {
  courseId: number;
  sortOrder: number;
};

export default function LearningPathManagement() {
  const { data: paths = [], isLoading, error, refetch } = useLearningPaths();
  const createLP = useCreateLearningPath();
  const updateLP = useUpdateLearningPath();
  const deleteLP = useDeleteLearningPath();
  const setCourses = useSetLearningPathCourses();
  
  // Use a query to fetch all courses for selection
  const { data: allCoursesData } = useCmsList({ type: 'COURSE' });
  const allCourses = allCoursesData?.items ?? [];

  const [formDialog, setFormDialog] = useState<{ open: boolean; lp: LearningPath | null }>({ open: false, lp: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; lp: LearningPath | null }>({ open: false, lp: null });
  
  const [coursesDialog, setCoursesDialog] = useState<{ open: boolean; lp: LearningPath | null }>({ open: false, lp: null });
  const [selectedCourses, setSelectedCourses] = useState<CourseAssignment[]>([]);

  const { data: currentPathData, isLoading: isLoadingCurrentPath } = useLearningPath(coursesDialog.lp?.id as number, coursesDialog.open && !!coursesDialog.lp);

  useEffect(() => {
    if (coursesDialog.open && currentPathData?.courses) {
      setSelectedCourses(currentPathData.courses.map((c: Record<string, unknown>) => ({
        courseId: (c.courseId as number) || (c.id as number),
        sortOrder: c.sortOrder as number
      })));
    } else {
      setSelectedCourses([]);
    }
  }, [coursesDialog.open, currentPathData]);

  const [formData, setFormData] = useState({ title: '', slug: '', kind: 'LEARNING_PLAN', description: '' });

  const handleOpenForm = (lp: LearningPath | null) => {
    if (lp) {
      setFormData({ title: lp.title || '', slug: lp.slug || '', kind: lp.kind || 'LEARNING_PLAN', description: lp.description || '' });
    } else {
      setFormData({ title: '', slug: '', kind: 'LEARNING_PLAN', description: '' });
    }
    setFormDialog({ open: true, lp });
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      if (formDialog.lp) {
        await updateLP.mutateAsync({ id: formDialog.lp.id, data: { title: formData.title, slug: formData.slug, kind: formData.kind, description: formData.description } });
        toast.success('Learning path updated');
      } else {
        await createLP.mutateAsync({ title: formData.title, slug: formData.slug, kind: formData.kind, description: formData.description });
        toast.success('Learning path created');
      }
      setFormDialog({ open: false, lp: null });
      refetch();
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to save learning path'));
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.lp) return;
    try {
      await deleteLP.mutateAsync(deleteDialog.lp.id);
      toast.success('Learning path deleted');
      setDeleteDialog({ open: false, lp: null });
      refetch();
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to delete learning path'));
    }
  };

  const handleSaveCourses = async () => {
    if (!coursesDialog.lp) return;
    try {
      await setCourses.mutateAsync({ id: coursesDialog.lp.id, courses: selectedCourses });
      toast.success('Courses updated successfully');
      setCoursesDialog({ open: false, lp: null });
      refetch();
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to update courses'));
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 h-full p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Learning Paths</h1>
            <p className="text-muted-foreground">Manage learning paths and tracks.</p>
          </div>
          <Button onClick={() => handleOpenForm(null)}>
            <Plus className="w-4 h-4 mr-2" /> Create Path
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load learning paths.
          </div>
        ) : paths.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No learning paths found.
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Courses</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paths.map((lp: LearningPath) => (
                    <TableRow key={lp.id}>
                      <TableCell className="font-medium">
                        {lp.title}
                        {lp.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-sm">
                            {lp.description}
                          </p>
                        )}
                        <p className="text-xs font-mono text-muted-foreground mt-1">/{lp.slug}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                          {lp.kind}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lp.courseCount || 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lp.createdAt), 'PP')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenForm(lp)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCoursesDialog({ open: true, lp })}>
                              <List className="w-4 h-4 mr-2" /> Manage Courses
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                window.open(`/explore/paths/${lp.slug}`, '_blank');
                            }}>
                              <Layout className="w-4 h-4 mr-2" /> View public page
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialog({ open: true, lp })}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={formDialog.open} onOpenChange={(open) => setFormDialog({ open, lp: open ? formDialog.lp : null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{formDialog.lp ? 'Edit Learning Path' : 'Create Learning Path'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Backend Engineering Track" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} placeholder="e.g. backend-engineering-track" disabled={!!formDialog.lp} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kind</label>
                <Select value={formData.kind} onValueChange={v => setFormData({ ...formData, kind: v })} disabled={!!formDialog.lp}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEARNING_PLAN">Learning Plan</SelectItem>
                    <SelectItem value="STRUCTURED_PATH">Structured Path</SelectItem>
                    <SelectItem value="SECURITY_TRACK">Security Track</SelectItem>
                    <SelectItem value="INTERVIEW_PREP">Interview Prep</SelectItem>
                    <SelectItem value="PRACTICE_TRACK">Practice Track</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Short description..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormDialog({ open: false, lp: null })}>Cancel</Button>
              <Button onClick={handleSave} disabled={createLP.isPending || updateLP.isPending}>
                {(createLP.isPending || updateLP.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={coursesDialog.open} onOpenChange={(open) => setCoursesDialog({ open, lp: open ? coursesDialog.lp : null })}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Manage Courses - {coursesDialog.lp?.title}</DialogTitle>
              <DialogDescription>Add, remove, and reorder courses in this learning path.</DialogDescription>
            </DialogHeader>
            
            {isLoadingCurrentPath ? (
              <div className="flex items-center justify-center py-12 flex-1">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Add Course</label>
                  <Select onValueChange={(v) => {
                    if (!selectedCourses.find(c => c.courseId === parseInt(v))) {
                      setSelectedCourses([...selectedCourses, { courseId: parseInt(v), sortOrder: selectedCourses.length + 1 }]);
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a course to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allCourses.filter((c: Record<string, unknown>) => !selectedCourses.find(sc => sc.courseId === c.id)).map((c: Record<string, unknown>) => (
                        <SelectItem key={c.id as number} value={(c.id as number).toString()}>{c.title as string}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="border rounded-md mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Order</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCourses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            No courses added yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...selectedCourses].sort((a, b) => a.sortOrder - b.sortOrder).map((sc, index) => {
                          const courseInfo = allCourses.find((c: Record<string, unknown>) => c.id === sc.courseId);
                          return (
                            <TableRow key={sc.courseId}>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  className="w-16 h-8 text-sm" 
                                  value={sc.sortOrder}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val)) {
                                      setSelectedCourses(selectedCourses.map(c => 
                                        c.courseId === sc.courseId ? { ...c, sortOrder: val } : c
                                      ));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{(courseInfo?.title as string) || 'Unknown Course'}</TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    setSelectedCourses(selectedCourses.filter(c => c.courseId !== sc.courseId));
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            
            <DialogFooter className="mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setCoursesDialog({ open: false, lp: null })}>Cancel</Button>
              <Button onClick={handleSaveCourses} disabled={setCourses.isPending || isLoadingCurrentPath}>
                {setCourses.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, lp: open ? deleteDialog.lp : null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Learning Path</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deleteDialog.lp?.title}"? This will not delete the underlying courses, but the path will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog({ open: false, lp: null })}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteLP.isPending}>
                {deleteLP.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
