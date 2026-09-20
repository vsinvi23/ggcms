import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Pencil, Eye, Send, Save, AlertCircle, Sparkles, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ContentRevisionDto } from '@/api/types';

interface PublicQuickEditBarProps {
  contentType: 'article' | 'course' | 'learning_path' | 'topic' | 'practice';
  contentId: number | string;
  currentTitle: string;
  currentDescription: string;
  currentBody?: string;
  pendingRevision?: ContentRevisionDto | null;
  isViewingPending?: boolean;
  onToggleView?: (showPending: boolean) => void;
  onStartInlineEdit?: () => void;
  onSaveRevision: (data: {
    title: string;
    description: string;
    body: string;
    submitForReview: boolean;
  }) => Promise<void>;
}

export function PublicQuickEditBar({
  contentType,
  contentId,
  currentTitle,
  currentDescription,
  currentBody = '',
  pendingRevision,
  isViewingPending = false,
  onToggleView,
  onStartInlineEdit,
  onSaveRevision,
}: PublicQuickEditBarProps) {
  const { user, canQuickEditPublic, isMasterAdmin } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(currentTitle);
  const [editDescription, setEditDescription] = useState(currentDescription);
  const [editBody, setEditBody] = useState(currentBody);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!canQuickEditPublic) return null;

  // Determine if pending revision state banner should be visible:
  // Visible ONLY to Master Admin / Super Admin OR the Editor who created the revision request.
  const isRevisionAuthor = pendingRevision && user && pendingRevision.requestedBy === user.id;
  const shouldShowRevisionBanner = pendingRevision && (isMasterAdmin || isRevisionAuthor);

  const handleOpenDrawer = () => {
    setEditTitle(pendingRevision?.title ?? currentTitle);
    setEditDescription(pendingRevision?.description ?? currentDescription);
    setEditBody(pendingRevision?.body ?? currentBody);
    setDrawerOpen(true);
  };

  const handleSave = async (submitForReview: boolean) => {
    setIsSubmitting(true);
    try {
      await onSaveRevision({
        title: editTitle,
        description: editDescription,
        body: editBody,
        submitForReview,
      });
      toast.success(
        submitForReview
          ? 'New version submitted for review!'
          : 'Draft revision saved successfully!'
      );
      setDrawerOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save revision request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* ── Specialized Quick Edit Floating Header Bar ──────────────────────── */}
      <div className="bg-slate-900 border-b border-emerald-500/30 text-white px-4 py-2.5 shadow-md flex items-center justify-between flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Badge className="bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 text-[11px] gap-1">
            <Sparkles className="w-3 h-3" /> Quick Edit Mode
          </Badge>
          <span className="text-slate-300 font-medium">
            Specialized Public Editor View &bull; {contentType.replace('_', ' ').toUpperCase()} #{contentId}
          </span>

          {shouldShowRevisionBanner && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 gap-1 text-[11px]">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              Specialized Preview: Version Request ({pendingRevision?.status ?? 'DRAFT'})
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {shouldShowRevisionBanner && onToggleView && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleView(!isViewingPending)}
              className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 gap-1 font-medium"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              {isViewingPending ? 'Switch to Live Published View' : 'Switch to My Pending Revision'}
            </Button>
          )}

          {onStartInlineEdit && (
            <Button
              size="sm"
              onClick={onStartInlineEdit}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1 shadow-sm rounded-lg"
            >
              <Pencil className="w-3.5 h-3.5" />
              Inline Canvas Edit
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenDrawer}
            className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 font-medium gap-1 shadow-sm rounded-lg"
          >
            Side Drawer Edit
          </Button>
        </div>
      </div>

      {/* ── Same-Layout Quick Edit Drawer ───────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl bg-card border-border overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                Version Revision Request
              </Badge>
              {isMasterAdmin && (
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                  Master Admin Privileged
                </Badge>
              )}
            </div>
            <SheetTitle className="text-xl font-bold text-foreground">
              Edit Public Content ({contentType.toUpperCase()})
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Edits will be saved as the next content version (`DRAFT` or `SUBMITTED_FOR_REVIEW`). The live public view remains unchanged until approved.
            </SheetDescription>
          </SheetHeader>

          <div className="py-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                Title
              </label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Enter content title..."
                className="text-sm font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                Summary / Description
              </label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="Brief summary of this item..."
                className="text-xs min-h-[70px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                Body Content (HTML / Markdown)
              </label>
              <Textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                placeholder="Content body text..."
                className="font-mono text-xs min-h-[260px]"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Version Control & Approval Policy
              </div>
              <p className="leading-relaxed">
                Saving will create a new content revision. The draft/review version is visible <strong>only to you and Master Admin</strong> in specialized view until approved.
              </p>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDrawerOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={isSubmitting}
                className="gap-1 font-semibold"
              >
                <Save className="w-4 h-4" /> Save Draft Revision
              </Button>
              <Button
                size="sm"
                onClick={() => handleSave(true)}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
              >
                <Send className="w-4 h-4" /> Submit Version for Review
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
