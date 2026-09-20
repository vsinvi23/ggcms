import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { HelpCircle } from 'lucide-react';

export interface QuestionItem {
  id?: string;
  title?: string;
  question?: string;
}

export interface QuestionNavigatorProps {
  totalQuestions: number;
  currentIndex: number;
  /** Map of question indices or IDs to boolean/value indicating if attempted */
  attemptedMap: Record<number | string, any>;
  onSelectQuestion: (index: number) => void;
  questions?: QuestionItem[];
  title?: string;
  className?: string;
  gridColsClass?: string;
  maxHeightClass?: string;
  /** Function to check if a question at index qIdx or question object is attempted */
  isAttemptedFn?: (qIdx: number, item?: QuestionItem) => boolean;
}

export const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  totalQuestions,
  currentIndex,
  attemptedMap,
  onSelectQuestion,
  questions = [],
  title = 'Questions Navigator',
  className,
  gridColsClass = 'grid-cols-4 sm:grid-cols-5',
  maxHeightClass = 'max-h-[360px]',
  isAttemptedFn,
}) => {
  // Calculate attempted count
  const attemptedCount = React.useMemo(() => {
    let count = 0;
    for (let i = 0; i < totalQuestions; i++) {
      const qItem = questions[i];
      const isAttempted = isAttemptedFn
        ? isAttemptedFn(i, qItem)
        : attemptedMap[i] !== undefined || (qItem?.id && attemptedMap[qItem.id] !== undefined);
      if (isAttempted) count++;
    }
    return count;
  }, [totalQuestions, questions, attemptedMap, isAttemptedFn]);

  const remainingCount = Math.max(0, totalQuestions - attemptedCount);
  const progressPercent = totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0;

  return (
    <div className={cn('bg-card border border-border rounded-2xl p-4 space-y-4 shadow-2xs', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-blue-500" />
          {title}
        </span>
        <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
          {attemptedCount} / {totalQuestions} Attempted
        </span>
      </div>

      {/* Status Legend */}
      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground px-2.5 py-1.5 bg-muted/40 rounded-lg">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" /> Attempted ({attemptedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-muted border border-border shrink-0" /> Remaining ({remainingCount})
        </span>
      </div>

      {/* Grid of Questions with Radio Indicators */}
      <div className={cn('grid gap-2 overflow-y-auto p-1', gridColsClass, maxHeightClass)}>
        {Array.from({ length: totalQuestions }).map((_, qIdx) => {
          const qItem = questions[qIdx];
          const isCurrent = currentIndex === qIdx;
          const isAnswered = isAttemptedFn
            ? isAttemptedFn(qIdx, qItem)
            : attemptedMap[qIdx] !== undefined || (qItem?.id && attemptedMap[qItem.id] !== undefined);

          const displayLabel = `Q${qIdx + 1}`;
          const tooltipText = qItem?.title || qItem?.question || `Question ${qIdx + 1}`;

          return (
            <button
              key={qItem?.id || qIdx}
              onClick={() => onSelectQuestion(qIdx)}
              title={`${displayLabel}: ${tooltipText}`}
              className={cn(
                'flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition-all cursor-pointer relative select-none',
                isCurrent
                  ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background font-extrabold z-10'
                  : '',
                isAnswered
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30'
              )}
            >
              <div
                className={cn(
                  'w-3.5 h-3.5 rounded-full border flex items-center justify-center mb-1 transition-colors',
                  isAnswered
                    ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:border-blue-500'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {isAnswered && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>

              <span className="text-[11px] font-bold">{displayLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Progress Bar & Footer */}
      <div className="pt-2 border-t border-border space-y-1.5">
        <Progress value={progressPercent} className="h-1.5 bg-muted" />
        <p className="text-[10px] text-muted-foreground text-center font-medium">
          Click any radio bubble to navigate questions.
        </p>
      </div>
    </div>
  );
};
