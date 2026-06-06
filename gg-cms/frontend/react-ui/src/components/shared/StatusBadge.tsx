import { cn } from '@/lib/utils';
import { FileEdit, Send, Eye, CheckCircle, Globe, XCircle, RefreshCw } from 'lucide-react';

// Accepts both uppercase CMS format ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED')
// and lowercase task format ('draft', 'submitted', 'in_review', 'approved', 'published', 'rejected').
export type AnyStatus = string;

type NormalisedStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'published' | 'rejected';

const normalise = (s: AnyStatus): NormalisedStatus => {
  switch (s?.toUpperCase()) {
    case 'DRAFT':      return 'draft';
    case 'SUBMITTED':  return 'submitted';
    case 'REVIEW':
    case 'IN_REVIEW':  return 'in_review';
    case 'APPROVED':   return 'approved';
    case 'PUBLISHED':  return 'published';
    case 'REJECTED':   return 'rejected';
    default:           return 'draft';
  }
};

const statusConfig: Record<NormalisedStatus, {
  label: string;
  icon: React.ElementType;
  className: string;
}> = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    className: 'bg-muted text-muted-foreground border border-muted-foreground/20',
  },
  submitted: {
    label: 'Submitted',
    icon: Send,
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  in_review: {
    label: 'In Review',
    icon: Eye,
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  published: {
    label: 'Published',
    icon: Globe,
    className: 'bg-primary/10 text-primary border border-primary/20',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
};

interface StatusBadgeProps {
  status: AnyStatus;
  /** When true a secondary "Live vN" chip is shown — the public is still seeing the old published version */
  hasPendingDraft?: boolean;
  publishedVersion?: number | null;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  hasPendingDraft,
  publishedVersion,
  size = 'sm',
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const key = normalise(status);
  const config = statusConfig[key];
  const Icon = config.icon;

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
          config.className,
          sizeClasses[size],
          className,
        )}
      >
        {showIcon && <Icon className={iconSizes[size]} />}
        {config.label}
      </span>

      {hasPendingDraft && (
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
          'bg-amber-50 text-amber-700 border border-amber-200',
          sizeClasses[size],
        )}>
          <RefreshCw className={iconSizes[size]} />
          Live{publishedVersion != null ? ` v${publishedVersion}` : ''} · Revision pending
        </span>
      )}
    </span>
  );
}
