import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNote, useUpsertNote, useDeleteNote } from '@/api/hooks/useEngagement';

type ContentType = 'article' | 'course';

interface NotePanelProps {
  open: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: number;
}

export function NotePanel({ open, onClose, contentType, contentId }: NotePanelProps) {
  const { data: existingNote, isLoading } = useNote(contentType, contentId);
  const { mutateAsync: upsert, isPending: saving } = useUpsertNote(contentType, contentId);
  const { mutateAsync: deleteNote, isPending: deleting } = useDeleteNote();

  const [body, setBody] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when existing note loads
  useEffect(() => {
    if (!isLoading) {
      setBody(existingNote?.body ?? '');
    }
  }, [existingNote, isLoading]);

  const handleSave = async () => {
    if (!body.trim()) return;
    try {
      await upsert(body);
      toast.success('Note saved');
    } catch {
      toast.error('Failed to save note');
    }
  };

  const handleDelete = async () => {
    if (!existingNote?.id) return;
    try {
      await deleteNote(existingNote.id);
      setBody('');
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  // Auto-save on blur / debounce after 1.5s of inactivity
  const handleChange = (value: string) => {
    setBody(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!value.trim()) return;
      try {
        await upsert(value);
      } catch {
        // Silent auto-save failure — user can retry with the Save button
      }
    }, 1500);
  };

  const lastUpdated = existingNote?.updatedAt
    ? new Date(existingNote.updatedAt).toLocaleString()
    : null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            Personal Note
          </SheetTitle>
          <SheetDescription>
            Your private notes for this {contentType}. Auto-saved as you type.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Textarea
              placeholder="Write your notes here... they are private to you."
              value={body}
              onChange={(e) => handleChange(e.target.value)}
              className="flex-1 resize-none min-h-[300px] text-sm leading-relaxed"
            />
          )}

          {lastUpdated && (
            <p className="text-xs text-muted-foreground">Last saved: {lastUpdated}</p>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={handleSave}
              disabled={saving || !body.trim()}
              size="sm"
              className="flex-1"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Note
            </Button>

            {existingNote?.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default NotePanel;
