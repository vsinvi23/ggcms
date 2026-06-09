import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Pencil, Trash2, Route, BookOpen, ChevronUp, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useLearningPaths,
  useCreateLearningPath,
  useUpdateLearningPath,
  useDeleteLearningPath,
  useSetLearningPathCourses,
} from '@/api/hooks/useLearningPaths';
import { useCmsList } from '@/api/hooks/useCms';
import { LearningPathDto } from '@/api/services/learningPathService';
import { CmsResponseDto } from '@/api/types';

interface SelectedCourse {
  courseId: number;
  title: string;
  sortOrder: number;
}

interface PathBuilderProps {
  kind: 'LEARNING_PLAN' | 'INTERVIEW_PREP';
  path?: LearningPathDto;
  onClose: () => void;
}

function PathBuilder({ kind, path, onClose }: PathBuilderProps) {
  const createPath = useCreateLearningPath();
  const updatePath = useUpdateLearningPath();
  const setCourses = useSetLearningPathCourses();

  const [title, setTitle] = useState(path?.title ?? '');
  const [description, setDescription] = useState(path?.description ?? '');
  const [selectedCourses, setSelectedCourses] = useState<SelectedCourse[]>(
    (path?.courses ?? []).map((c, i) => ({ courseId: c.courseId, title: '', sortOrder: i }))
  );
  const [courseSearch, setCourseSearch] = useState('');

  const { data: coursesData } = useCmsList({
    type: 'COURSE',
    size: 200,
    search: courseSearch || undefined,
  });
  const allCourses: CmsResponseDto[] = coursesData?.items ?? [];

  // Enrich selected courses titles from allCourses
  const enrichedSelected = selectedCourses.map((sc) => {
    const course = allCourses.find((c) => c.id === sc.courseId);
    return { ...sc, title: course?.title ?? sc.title ?? `Course #${sc.courseId}` };
  });

  const addCourse = (course: CmsResponseDto) => {
    if (selectedCourses.some((c) => c.courseId === course.id)) return;
    setSelectedCourses((prev) => [
      ...prev,
      { courseId: course.id, title: course.title ?? '', sortOrder: prev.length },
    ]);
  };

  const removeCourse = (courseId: number) => {
    setSelectedCourses((prev) =>
      prev
        .filter((c) => c.courseId !== courseId)
        .map((c, i) => ({ ...c, sortOrder: i }))
    );
  };

  const moveCourse = (index: number, direction: 'up' | 'down') => {
    const newList = [...selectedCourses];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    setSelectedCourses(newList.map((c, i) => ({ ...c, sortOrder: i })));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    try {
      let pathId: number;
      if (path) {
        await updatePath.mutateAsync({ id: path.id, data: { title, description } });
        pathId = path.id;
      } else {
        const created = await createPath.mutateAsync({ kind, title, description });
        pathId = created.id;
      }
      await setCourses.mutateAsync({
        id: pathId,
        courses: enrichedSelected.map((c, i) => ({ courseId: c.courseId, sortOrder: i })),
      });
      toast.success(path ? 'Learning path updated' : 'Learning path created');
      onClose();
    } catch {
      toast.error('Failed to save learning path');
    }
  };

  const isSaving = createPath.isPending || updatePath.isPending || setCourses.isPending;
  const availableCourses = allCourses.filter(
    (c) => !selectedCourses.some((sc) => sc.courseId === c.id)
  );

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      {/* Title + description */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="path-title">Title *</Label>
          <Input
            id="path-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Full Stack Developer Path"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="path-desc">Description</Label>
          <Textarea
            id="path-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this learning path..."
            rows={2}
          />
        </div>
      </div>

      {/* Selected courses */}
      <div className="space-y-2">
        <Label>Selected Courses ({enrichedSelected.length})</Label>
        {enrichedSelected.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
            No courses added yet. Pick courses from the list below.
          </div>
        ) : (
          <div className="space-y-1 border rounded-lg p-2">
            {enrichedSelected.map((sc, i) => (
              <div key={sc.courseId} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                <span className="flex-1 text-sm truncate">{sc.title}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveCourse(i, 'up')} disabled={i === 0}>
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveCourse(i, 'down')} disabled={i === enrichedSelected.length - 1}>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCourse(sc.courseId)}>
                    <X className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Course picker */}
      <div className="space-y-2">
        <Label>Add Courses</Label>
        <Input
          placeholder="Search courses..."
          value={courseSearch}
          onChange={(e) => setCourseSearch(e.target.value)}
        />
        <div className="border rounded-lg max-h-48 overflow-y-auto">
          {availableCourses.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              {courseSearch ? 'No matching courses.' : 'All courses already added.'}
            </div>
          ) : (
            availableCourses.map((c) => (
              <button
                key={c.id}
                onClick={() => addCourse(c)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b last:border-0"
              >
                <BookOpen className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate flex-1">{c.title ?? 'Untitled'}</span>
                <Badge variant="outline" className="text-xs shrink-0">{c.status}</Badge>
                <Plus className="w-3 h-3 text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      <SheetFooter className="pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {path ? 'Update' : 'Create'} Path
        </Button>
      </SheetFooter>
    </div>
  );
}

interface PathsListProps {
  kind: 'LEARNING_PLAN' | 'INTERVIEW_PREP';
  title: string;
  description: string;
}

export function LearningPathsTab() {
  return <PathsList kind="LEARNING_PLAN" title="Learning Paths" description="Curated sequences of courses for structured learning." />;
}

function PathsList({ kind, title, description }: PathsListProps) {
  const { data: paths = [], isLoading } = useLearningPaths(kind);
  const deletePath = useDeleteLearningPath();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<LearningPathDto | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<LearningPathDto | null>(null);

  const openCreate = () => { setEditingPath(undefined); setSheetOpen(true); };
  const openEdit = (p: LearningPathDto) => { setEditingPath(p); setSheetOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePath.mutateAsync(deleteTarget.id);
      toast.success(`"${deleteTarget.title}" deleted`);
    } catch {
      toast.error('Failed to delete learning path');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Route className="w-5 h-5" /> {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Create Path
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : paths.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Route className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No paths created yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paths.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p.title}</span>
                      <Badge variant="secondary" className="text-xs">{p.courseCount} courses</Badge>
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Path builder sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingPath ? `Edit: ${editingPath.title}` : `Create Learning Path`}</SheetTitle>
            <SheetDescription>Build a curated sequence of courses.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {sheetOpen && (
              <PathBuilder
                kind={kind}
                path={editingPath}
                onClose={() => setSheetOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePath.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
