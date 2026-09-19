import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Pencil, Trash2, BookOpen, FileText, Gauge, Sparkles } from 'lucide-react';
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
import { toUserMessage } from '@/lib/errors';

interface TypeFormState {
  value: string;
  label: string;
  description: string;
}

interface TypesSectionProps {
  kind: string;
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
    } catch (err) {
      toast.error(toUserMessage(err, editingType ? 'Failed to update type' : 'Failed to create type'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id, kind });
      toast.success(`"${deleteTarget.label}" deleted`);
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to delete type'));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <Card className="border border-border/80 shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                <Icon className="w-4 h-4 text-primary" /> {title}
              </CardTitle>
              <CardDescription className="text-xs">
                {types.length} configured option{types.length !== 1 ? 's' : ''} (persisted in database)
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-1.5 h-8 text-xs font-bold rounded-xl">
              <Plus className="w-3.5 h-3.5" /> Add Option
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : types.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs">
              No options configured for &ldquo;{kind}&rdquo;. Click &ldquo;Add Option&rdquo; to configure.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {types.map((ct) => (
                <div key={ct.id} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-all group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-foreground">{ct.label}</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{ct.value}</Badge>
                    </div>
                    {ct.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ct.description}</p>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ct)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(ct)}>
                      <Trash2 className="w-3 h-3" />
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
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? `Edit ${title}` : `Add ${title} Option`}</DialogTitle>
            <DialogDescription className="text-xs">
              {editingType ? 'Update display label and description.' : 'Identifiers are saved in UPPER_SNAKE_CASE in the database.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            {!editingType && (
              <div className="space-y-1.5">
                <Label htmlFor="value" className="text-xs font-bold">Value Identifier</Label>
                <Input
                  id="value"
                  value={form.value}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="e.g. BEGINNER, HANDS_ON, DEEP_DIVE"
                  className="h-9 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Database Key: {form.value.toUpperCase().replace(/\s+/g, '_') || 'VALUE'}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs font-bold">Display Label</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Intermediate, Hands-on, Cheat Sheet"
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-bold">Description (optional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this taxonomy option..."
                rows={2}
                className="text-xs rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} className="rounded-xl text-xs">Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="rounded-xl text-xs font-bold">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {editingType ? 'Update' : 'Create Option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-extrabold">Delete Taxonomy Option</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete &ldquo;{deleteTarget?.label}&rdquo;? Content tagged with this option will remain intact in the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl text-xs font-bold"
            >
              {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Delete Option
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
      <div className="p-4 rounded-2xl bg-card border border-border shadow-2xs flex items-start gap-3">
        <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
          <Gauge className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="text-sm font-extrabold text-foreground">Tier 1 Taxonomy Enums & Filter Options</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All values defined here are pre-seeded in the database (`content_types` table) and dynamically populate the search & filter options on public Courses, Explore, and Practice hubs.
          </p>
        </div>
      </div>

      <TypesSection kind="level" title="Difficulty Levels (Beginner / Intermediate / Advanced)" icon={Gauge} />
      <TypesSection kind="learning_style" title="Learning Styles (Theory / Hands-on / Project based)" icon={Sparkles} />
      <TypesSection kind="article" title="Content Formats & Article Types" icon={FileText} />
      <TypesSection kind="course" title="Course Format Types" icon={BookOpen} />
    </div>
  );
}

export default ContentTypesTab;
