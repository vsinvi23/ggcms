import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Highlighter,
  Trash2,
  StickyNote,
  Check,
  X,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  useHighlights,
  useUpdateHighlight,
  useDeleteHighlight,
} from '@/api/hooks/useEngagement';
import { HighlightDto } from '@/api/types';

type ContentType = 'article' | 'course';
type HighlightColor = 'yellow' | 'green' | 'blue';

const COLOR_CLASS: Record<string, string> = {
  yellow: 'bg-yellow-100 border-yellow-300 text-yellow-900',
  green:  'bg-green-100  border-green-300  text-green-900',
  blue:   'bg-blue-100   border-blue-300   text-blue-900',
};

interface HighlightsPanelProps {
  open: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: number;
  /** URL path for the "View" link, e.g. /article/my-slug */
  contentUrl: string;
  contentTitle?: string;
}

export function HighlightsPanel({
  open,
  onClose,
  contentType,
  contentId,
  contentUrl,
  contentTitle,
}: HighlightsPanelProps) {
  const { data: highlights = [], isLoading } = useHighlights(contentType, contentId);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Highlighter className="w-5 h-5 text-amber-500" />
            My Highlights
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1 flex-wrap">
            <span>All your highlights for</span>
            <Link
              to={contentUrl}
              onClick={onClose}
              className="inline-flex items-center gap-1 text-primary font-medium hover:underline max-w-[200px] truncate"
            >
              {contentTitle || 'this article'}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </Link>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 min-h-0">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : highlights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Highlighter className="w-12 h-12 opacity-20" />
              <p className="text-sm text-center">
                No highlights yet. Select text in the article to add a highlight.
              </p>
            </div>
          ) : (
            highlights.map((hl) => (
              <HighlightCard
                key={hl.id}
                highlight={hl}
                contentType={contentType}
                contentId={contentId}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Individual highlight card ─────────────────────────────────────────────────

function HighlightCard({
  highlight,
  contentType,
  contentId,
}: {
  highlight: HighlightDto;
  contentType: ContentType;
  contentId: number;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText,    setNoteText]    = useState(highlight.note ?? '');

  const { mutateAsync: updateHighlight, isPending: saving } = useUpdateHighlight(contentType, contentId);
  const { mutateAsync: deleteHighlight, isPending: deleting } = useDeleteHighlight(contentType, contentId);

  const colorCls = COLOR_CLASS[(highlight.color as HighlightColor) ?? 'yellow'] ?? COLOR_CLASS['yellow'];

  const handleSaveNote = async () => {
    try {
      await updateHighlight({ id: highlight.id, note: noteText.trim() });
      toast.success(noteText.trim() ? 'Note saved' : 'Note cleared');
      setEditingNote(false);
    } catch {
      toast.error('Failed to save note');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHighlight(highlight.id);
    } catch {
      toast.error('Failed to remove highlight');
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Highlighted text */}
      <div className={`text-sm px-2 py-1 rounded border leading-relaxed ${colorCls}`}>
        &ldquo;{highlight.text}&rdquo;
      </div>

      {/* Existing note (read mode) */}
      {!editingNote && highlight.note && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">
          <StickyNote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-indigo-500" />
          <span className="leading-relaxed">{highlight.note}</span>
        </div>
      )}

      {/* Note edit area */}
      {editingNote && (
        <div className="space-y-1.5">
          <Textarea
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write your note here..."
            className="text-xs resize-none min-h-[70px] leading-relaxed"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={handleSaveNote} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setNoteText(highlight.note ?? ''); setEditingNote(false); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs text-muted-foreground">
          {new Date(highlight.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>

        <div className="flex items-center gap-1">
          {!editingNote && (
            <Button
              size="sm" variant="ghost"
              className="h-7 px-2 text-xs gap-1 text-indigo-600 hover:bg-indigo-50"
              onClick={() => { setNoteText(highlight.note ?? ''); setEditingNote(true); }}
            >
              <StickyNote className="h-3.5 w-3.5" />
              {highlight.note ? 'Edit Note' : 'Add Note'}
            </Button>
          )}

          <Button
            size="sm" variant="ghost"
            className="h-7 px-2 text-destructive hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default HighlightsPanel;
