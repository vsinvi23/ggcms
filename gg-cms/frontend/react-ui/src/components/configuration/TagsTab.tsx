import { useState, KeyboardEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Tag as TagIcon, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { useTags, useCreateTag, useDeleteTag } from '@/api/hooks/useTags';
import { TagDto } from '@/api/types';

export function TagsTab() {
  const { data: tags = [], isLoading } = useTags();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const [newTagInput, setNewTagInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TagDto | null>(null);

  const handleCreate = async () => {
    const name = newTagInput.trim().toLowerCase();
    if (!name) return;
    try {
      await createTag.mutateAsync(name);
      setNewTagInput('');
      toast.success(`Tag "${name}" created`);
    } catch {
      toast.error('Failed to create tag (it may already exist)');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTag.mutateAsync(deleteTarget.id);
      toast.success(`Tag "${deleteTarget.name}" deleted`);
    } catch {
      toast.error('Failed to delete tag');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="w-5 h-5" /> Tags
          </CardTitle>
          <CardDescription>
            Tags are stored in lowercase. Press Enter or click Add.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter tag name (e.g. golang, spring-boot)"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value.toLowerCase())}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={!newTagInput.trim() || createTag.isPending}>
              {createTag.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TagIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tags yet. Add your first tag above.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-2">
              {tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-sm px-3 py-1.5 gap-1.5 cursor-default">
                  {tag.name}
                  <button
                    className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                    onClick={() => setDeleteTarget(tag)}
                    title={`Delete tag "${tag.name}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Delete tag &ldquo;{deleteTarget?.name}&rdquo;? This will remove it from all categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTag.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
