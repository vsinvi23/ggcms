import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Pencil, Trash2, BookOpen, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  useContentTypes,
  useCreateContentType,
  useUpdateContentType,
  useDeleteContentType,
} from '@/api/hooks/useContentTypes';
import { ContentTypeDto } from '@/api/services/contentTypeService';

interface TypeFormState {
  value: string;
  label: string;
  description: string;
}

interface TypesSectionProps {
  kind: 'article' | 'course';
  title: string;
  icon: React.ElementType;
}

function TypesSection({ kind, title, icon: Icon }: TypesSectionProps) {
  const { data: types = [], isLoading } = useContentTypes(kind);
  const createMutation = useCreateContentType();
  const updateMutation = useUpdateContentType();
  const deleteMutation = useDeleteContentType();

  const [formOpen, setFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<ContentTypeDto | null>(null);
  const [form, setForm] = useState<TypeFormState>({ value: '', label: '', description: '' });
  const [deleteTarget, setDeleteTarget] = useState<ContentTypeDto | null>(null);

  const openCreate = () => {
    setEditingType(null);
    setForm({ value: '', label: '', description: '' });
    setFormOpen(true);
  };

  const openEdit = (ct: ContentTypeDto) => {
    setEditingType(ct);
    setForm({ value: ct.value, label: ct.label, description: ct.description });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.value.trim() || !form.label.trim()) {
      toast.error('Value and label are required');
      return;
    }
    try {
      if (editingType) {
        await updateMutation.mutateAsync({
          id: editingType.id,
          data: { label: form.label, description: form.description },
          kind,
        });
        toast.success(`"${form.label}" updated`);
      } else {
        await createMutation.mutateAsync({
          kind,
          value: form.value.toUpperCase().replace(/\s+/g, '_'),
          label: form.label,
          description: form.description,
        });
        toast.success(`"${form.label}" created`);
      }
      setFormOpen(false);
    } catch {
      toast.error(editingType ? 'Failed to update type' : 'Failed to create type');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id, kind });
      toast.success(`"${deleteTarget.label}" deleted`);
    } catch {
      toast.error('Failed to delete type');
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
                <Icon className="w-5 h-5" /> {title}
              </CardTitle>
              <CardDescription>
                {types.length} type{types.length !== 1 ? 's' : ''} configured
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Add Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : types.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No types configured. Add your first type above.
            </div>
          ) : (
            <div className="space-y-2">
              {types.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{ct.label}</span>
                      <Badge variant="outline" className="text-xs font-mono">{ct.value}</Badge>
                    </div>
                    {ct.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{ct.description}</p>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ct)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(ct)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? `Edit ${title.replace(' Types', '')} Type` : `Add ${title.replace(' Types', '')} Type`}</DialogTitle>
            <DialogDescription>
              {editingType ? 'Update the type details.' : 'The value is auto-formatted to UPPER_SNAKE_CASE.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingType && (
              <div className="space-y-2">
                <Label htmlFor="value">Value (identifier)</Label>
                <Input
                  id="value"
                  value={form.value}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="e.g. BLOG, HOW_TO"
                />
                <p className="text-xs text-muted-foreground">Will be stored as {form.value.toUpperCase().replace(/\s+/g, '_') || 'VALUE'}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="label">Label (display name)</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Blog Post, How-To Guide"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this content type..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingType ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Type</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{deleteTarget?.label}&rdquo;? Existing content using this type will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ContentTypesTab() {
  return (
    <div className="space-y-6">
      <TypesSection kind="article" title="Article Types" icon={FileText} />
      <TypesSection kind="course" title="Course Types" icon={BookOpen} />
    </div>
  );
}
