import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAndProceed: () => void;
  onDiscardAndProceed: () => void;
  onCancel: () => void;
}

export function UnsavedChangesModal({
  open,
  onOpenChange,
  onSaveAndProceed,
  onDiscardAndProceed,
  onCancel,
}: UnsavedChangesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-border shadow-xl bg-card">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-amber-500 font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <DialogTitle className="text-base font-extrabold">Unsaved Answer Attempt</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            You have unsaved text in your current interview answer. Would you like to save your draft before moving to the next question?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="rounded-xl text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDiscardAndProceed}
            className="rounded-xl text-xs font-semibold"
          >
            Discard & Proceed
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onSaveAndProceed}
            className="rounded-xl text-xs font-extrabold bg-primary text-primary-foreground"
          >
            Save Draft & Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
