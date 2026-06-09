import { cn } from '@/lib/utils';
import { WorkflowStatus } from '@/types/content';
import { Check } from 'lucide-react';

interface WorkflowStatusBarProps {
  currentStatus: WorkflowStatus;
  className?: string;
  showLabels?: boolean;
}

const workflowSteps: { status: WorkflowStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'submitted', label: 'Submitted' },
  { status: 'in_review', label: 'In Review' },
  { status: 'approved', label: 'Approved' },
  { status: 'published', label: 'Published' },
];

const statusOrder: Record<WorkflowStatus, number> = {
  draft: 0,
  submitted: 1,
  in_review: 2,
  approved: 3,
  published: 4,
  rejected: -1,
};

export function WorkflowStatusBar({
  currentStatus,
  className,
  showLabels = true,
}: WorkflowStatusBarProps) {
  const currentOrder = statusOrder[currentStatus];
  const isRejected = currentStatus === 'rejected';

  return (
    <div className={cn('w-full', className)}>
      {isRejected ? (
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-destructive">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-lg font-bold">×</span>
            </div>
            <span className="font-medium">Rejected</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center">
          {workflowSteps.map((step, index) => {
            const stepOrder = statusOrder[step.status];
            const isCompleted = stepOrder < currentOrder;
            const isCurrent = step.status === currentStatus;
            const isLast = index === workflowSteps.length - 1;

            return (
              <div
                key={step.status}
                className={cn('flex-1 flex items-center', !isLast && 'flex-grow')}
              >
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      isCompleted && 'bg-primary text-primary-foreground',
                      isCurrent && 'bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background',
                      !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {showLabels && (
                    <span
                      className={cn(
                        'mt-2 text-xs font-medium text-center whitespace-nowrap',
                        isCurrent && 'text-primary',
                        !isCurrent && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  )}
                </div>

                {!isLast && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2',
                      isCompleted ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
