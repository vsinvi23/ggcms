import { useState } from 'react';
import { cn } from '@/lib/utils';
import { WorkflowStatus, WorkflowAction } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, MessageSquare, Send, Globe, RotateCcw } from 'lucide-react';

interface ReviewActionsPanelProps {
  currentStatus: WorkflowStatus;
  onAction: (action: WorkflowAction['action'], comment?: string) => void;
  className?: string;
  isLoading?: boolean;
}

const getAvailableActions = (status: WorkflowStatus): WorkflowAction[] => {
  switch (status) {
    case 'draft':
      return [
        { action: 'submit', label: 'Submit for Review', variant: 'default' },
      ];
    case 'submitted':
    case 'in_review':
      return [
        { action: 'approve', label: 'Approve', variant: 'default' },
        { action: 'request_changes', label: 'Request Changes', variant: 'outline' },
        { action: 'reject', label: 'Reject', variant: 'destructive' },
      ];
    case 'approved':
      return [
        { action: 'publish', label: 'Publish', variant: 'default' },
        { action: 'request_changes', label: 'Send Back', variant: 'outline' },
      ];
    case 'published':
      return [
        { action: 'unpublish', label: 'Unpublish', variant: 'outline' },
      ];
    case 'rejected':
      return [
        { action: 'submit', label: 'Resubmit', variant: 'default' },
      ];
    default:
      return [];
  }
};

const actionIcons: Record<WorkflowAction['action'], React.ElementType> = {
  submit: Send,
  approve: CheckCircle,
  reject: XCircle,
  request_changes: MessageSquare,
  publish: Globe,
  unpublish: RotateCcw,
};

export function ReviewActionsPanel({
  currentStatus,
  onAction,
  className,
  isLoading = false,
}: ReviewActionsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<WorkflowAction | null>(null);
  const [comment, setComment] = useState('');

  const actions = getAvailableActions(currentStatus);
  const requiresComment = selectedAction?.action === 'reject' || selectedAction?.action === 'request_changes';

  const handleActionClick = (action: WorkflowAction) => {
    if (action.action === 'reject' || action.action === 'request_changes') {
      setSelectedAction(action);
      setDialogOpen(true);
    } else {
      onAction(action.action);
    }
  };

  const handleConfirm = () => {
    if (selectedAction) {
      onAction(selectedAction.action, comment);
      setDialogOpen(false);
      setComment('');
      setSelectedAction(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {actions.map((action) => {
          const Icon = actionIcons[action.action];
          return (
            <Button
              key={action.action}
              variant={action.variant}
              onClick={() => handleActionClick(action)}
              disabled={isLoading}
              className="gap-2"
            >
              <Icon className="w-4 h-4" />
              {action.label}
            </Button>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction?.action === 'reject' ? 'Reject Content' : 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              {selectedAction?.action === 'reject'
                ? 'Please provide a reason for rejecting this content.'
                : 'Please describe the changes you would like the author to make.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={requiresComment ? 'Enter your comments...' : 'Optional comments...'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedAction?.variant}
              onClick={handleConfirm}
              disabled={requiresComment && !comment.trim()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
