import { useRef, useEffect, useState, useCallback, ReactNode } from 'react';
import { Highlighter, Copy, Trash2, StickyNote, Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHighlights, useCreateHighlight, useUpdateHighlight, useDeleteHighlight } from '@/api/hooks/useEngagement';
import { HighlightDto } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type ContentType = 'article' | 'course';
type HighlightColor = 'yellow' | 'green' | 'blue';

const COLOR_STYLES: Record<HighlightColor, string> = {
  yellow: 'background-color: rgba(250,204,21,0.45); border-radius: 2px;',
  green:  'background-color: rgba(134,239,172,0.45); border-radius: 2px;',
  blue:   'background-color: rgba(147,197,253,0.45); border-radius: 2px;',
};

const COLOR_BTN: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-300 hover:bg-yellow-400 ring-yellow-400',
  green:  'bg-green-300 hover:bg-green-400 ring-green-400',
  blue:   'bg-blue-300 hover:bg-blue-400 ring-blue-400',
};

type PopupMode = 'new' | 'existing' | 'new-note' | 'existing-note';

interface SelectionInfo {
  text: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

interface HighlightOverlayProps {
  contentType: ContentType;
  contentId: number;
  /** Optional: article/course slug used to store the deep-link with each highlight. */
  contentSlug?: string;
  /** Optional: article/course title stored for display in My Learning. */
  contentTitle?: string;
  children: ReactNode;
}

/**
 * HighlightOverlay wraps body content enabling text-selection highlighting with notes.
 *
 * UX flow:
 * 1. Select fresh text → popup: color swatches (save highlight instantly) | "Note" (expand note input) | Copy
 * 2. Select already-highlighted text → popup: Remove | Note icon (add/edit note) | Copy
 * 3. "Note" in new-selection mode: shows a textarea, color picker + "Save" button — saves highlight + note together
 * 4. "Note" in existing mode: shows textarea pre-filled with existing note, Save/Clear/Cancel
 */
export function HighlightOverlay({
  contentType,
  contentId,
  contentSlug,
  contentTitle,
  children,
}: HighlightOverlayProps) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef       = useRef<HTMLDivElement>(null);

  const [selectionInfo,   setSelectionInfo]   = useState<SelectionInfo | null>(null);
  const [popupMode,       setPopupMode]       = useState<PopupMode>('new');
  const [matchedHighlight, setMatchedHighlight] = useState<HighlightDto | null>(null);
  const [pendingColor,    setPendingColor]    = useState<HighlightColor>('yellow');
  const [noteText,        setNoteText]        = useState('');

  const { data: highlights = [] } = useHighlights(contentType, contentId);
  const { mutateAsync: createHighlight, isPending: creating } = useCreateHighlight(contentType, contentId);
  const { mutateAsync: updateHighlight, isPending: updating } = useUpdateHighlight(contentType, contentId);
  const { mutateAsync: deleteHighlight, isPending: deleting } = useDeleteHighlight(contentType, contentId);

  // ── Apply saved highlights to DOM ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    applyHighlights(containerRef.current, highlights);
  }, [highlights]);

  // ── Detect text selection inside content ─────────────────────────────────────
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      if (!user) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionInfo(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        setSelectionInfo(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) {
        setSelectionInfo(null);
        return;
      }

      // Compute char offsets relative to container
      const preRange = range.cloneRange();
      preRange.selectNodeContents(containerRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;
      const endOffset   = startOffset + text.length;

      const rect = range.getBoundingClientRect();

      // Check for overlap with an existing highlight
      const matched = highlights.find(
        (hl) => hl.startOffset < endOffset && hl.endOffset > startOffset,
      ) ?? null;

      setMatchedHighlight(matched);
      if (matched) {
        setNoteText(matched.note ?? '');
        setPopupMode('existing');
      } else {
        setNoteText('');
        setPendingColor('yellow');
        setPopupMode('new');
      }

      setSelectionInfo({ text, startOffset, endOffset, rect });
    },
    [user, highlights],
  );

  const dismiss = useCallback(() => {
    setSelectionInfo(null);
    setMatchedHighlight(null);
    setNoteText('');
    setPopupMode('new');
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      if (containerRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
    const onScroll = () => dismiss();

    document.addEventListener('mouseup',   handleMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll',      onScroll, { passive: true });
    return () => {
      document.removeEventListener('mouseup',   handleMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll',      onScroll);
    };
  }, [handleMouseUp, dismiss]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Save a new highlight (no note) with the selected color */
  const handleHighlight = async (color: HighlightColor) => {
    if (!selectionInfo) return;
    const { text, startOffset, endOffset } = selectionInfo;
    dismiss();
    try {
      await createHighlight({ text, startOffset, endOffset, color, contentTitle, contentSlug });
    } catch {
      toast.error('Failed to save highlight');
    }
  };

  /** Save a new highlight WITH a note */
  const handleSaveWithNote = async () => {
    if (!selectionInfo) return;
    const { text, startOffset, endOffset } = selectionInfo;
    dismiss();
    try {
      await createHighlight({
        text, startOffset, endOffset,
        color: pendingColor,
        note: noteText.trim() || undefined,
        contentTitle,
        contentSlug,
      });
    } catch {
      toast.error('Failed to save highlight');
    }
  };

  /** Update the note on an existing highlight */
  const handleUpdateNote = async () => {
    if (!matchedHighlight) return;
    dismiss();
    try {
      await updateHighlight({ id: matchedHighlight.id, note: noteText.trim() });
      toast.success(noteText.trim() ? 'Note saved' : 'Note removed');
    } catch {
      toast.error('Failed to update note');
    }
  };

  /** Delete an existing highlight (and its note) */
  const handleRemove = async () => {
    if (!matchedHighlight) return;
    dismiss();
    try {
      await deleteHighlight(matchedHighlight.id);
      toast.success('Highlight removed');
    } catch {
      toast.error('Failed to remove highlight');
    }
  };

  const handleCopy = () => {
    if (!selectionInfo) return;
    navigator.clipboard.writeText(selectionInfo.text).then(() => {
      toast.success('Copied to clipboard');
      dismiss();
    });
  };

  // ── Bar position ─────────────────────────────────────────────────────────────
  const isNoteMode = popupMode === 'new-note' || popupMode === 'existing-note';

  const barStyle = selectionInfo
    ? {
        position: 'fixed' as const,
        top:  selectionInfo.rect.top - (isNoteMode ? 170 : 50),
        left: selectionInfo.rect.left + selectionInfo.rect.width / 2,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 320,
        width: isNoteMode ? 300 : undefined,
      }
    : undefined;

  if (!selectionInfo) return <div ref={containerRef}>{children}</div>;

  return (
    <div ref={containerRef}>
      {children}

      {/* Floating action bar */}
      <div
        ref={barRef}
        style={barStyle}
        className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* ── NEW selection — compact row ──────────────────────────────── */}
        {popupMode === 'new' && (
          <div className="flex items-center gap-1 px-2 py-1.5">
            {/* Color swatches */}
            {(['yellow', 'green', 'blue'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                title={`Highlight ${c}`}
                disabled={creating}
                onClick={() => handleHighlight(c)}
                className={`h-5 w-5 rounded-full border-2 border-white transition-transform hover:scale-110 ring-2 ring-transparent hover:ring-offset-1 ${COLOR_BTN[c]}`}
              />
            ))}

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {/* Add Note */}
            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              onClick={() => setPopupMode('new-note')}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </Button>

            <div className="h-4 w-px bg-gray-200" />

            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* ── EXISTING highlight — compact row ─────────────────────────── */}
        {popupMode === 'existing' && (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-medium text-red-500 hover:bg-red-50"
              onClick={handleRemove}
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>

            <div className="h-4 w-px bg-gray-200" />

            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              onClick={() => setPopupMode('existing-note')}
            >
              <StickyNote className="h-3.5 w-3.5" />
              {matchedHighlight?.note ? 'Edit Note' : 'Add Note'}
            </Button>

            <div className="h-4 w-px bg-gray-200" />

            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* ── NEW selection + note input ───────────────────────────────── */}
        {popupMode === 'new-note' && (
          <div className="p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">Add a note &amp; highlight</p>

            <Textarea
              autoFocus
              placeholder="Write your note here..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="text-xs resize-none min-h-[80px] leading-relaxed"
            />

            {/* Color choice */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Color:</span>
              {(['yellow', 'green', 'blue'] as HighlightColor[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setPendingColor(c)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${
                    pendingColor === c ? 'border-gray-500 scale-110' : 'border-white'
                  } ${COLOR_BTN[c]}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1"
                onClick={handleSaveWithNote}
                disabled={creating}
              >
                <Check className="h-3.5 w-3.5" />
                Save Highlight
              </Button>
              <Button
                size="sm" variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setPopupMode('new')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── EXISTING + note edit ─────────────────────────────────────── */}
        {popupMode === 'existing-note' && (
          <div className="p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">
              {matchedHighlight?.note ? 'Edit note' : 'Add note'}
            </p>

            <Textarea
              autoFocus
              placeholder="Write your note here..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="text-xs resize-none min-h-[80px] leading-relaxed"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1"
                onClick={handleUpdateNote}
                disabled={updating}
              >
                <Check className="h-3.5 w-3.5" />
                Save Note
              </Button>
              {matchedHighlight?.note && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs text-red-500 hover:text-red-600 gap-1"
                  onClick={() => {
                    setNoteText('');
                    handleUpdateNote();
                  }}
                  disabled={updating}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              <Button
                size="sm" variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setPopupMode('existing')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Downward arrow tip */}
        {!isNoteMode && (
          <>
            <span
              className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-200"
              style={{ zIndex: -1 }}
              aria-hidden
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Walks the text nodes within a container and wraps matching text ranges with
 * <mark> elements styled by highlight color.
 * Existing marks are removed first to avoid duplication on re-render.
 */
function applyHighlights(container: HTMLDivElement, highlights: HighlightDto[]) {
  // Remove previously injected marks
  container.querySelectorAll('mark[data-highlight-id]').forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      parent.normalize();
    }
  });

  for (const hl of highlights) {
    highlightRange(container, hl);
  }
}

function highlightRange(container: Element, hl: HighlightDto) {
  const color  = (hl.color as HighlightColor) ?? 'yellow';
  const style  = COLOR_STYLES[color] ?? COLOR_STYLES.yellow;

  let charCount = 0;
  const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  while (treeWalker.nextNode()) {
    const node       = treeWalker.currentNode as Text;
    const nodeLength = node.textContent?.length ?? 0;

    if (charCount + nodeLength > hl.startOffset && charCount < hl.endOffset) {
      const start = Math.max(0, hl.startOffset - charCount);
      const end   = Math.min(nodeLength, hl.endOffset - charCount);

      if (start >= end) { charCount += nodeLength; continue; }

      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);

      const mark = document.createElement('mark');
      mark.setAttribute('data-highlight-id', hl.id);
      mark.setAttribute('style', style);
      mark.title        = hl.note ? `Note: ${hl.note}` : 'Select to edit or remove';
      mark.style.cursor = 'pointer';

      try { range.surroundContents(mark); } catch { /* spans multiple elements — skip */ }
      break;
    }
    charCount += nodeLength;
  }
}

export default HighlightOverlay;
