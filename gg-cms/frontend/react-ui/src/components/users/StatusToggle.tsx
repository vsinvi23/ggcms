import { cn } from '@/lib/utils';
import { UserStatus } from '@/types/user';

interface StatusToggleProps {
  status: UserStatus;
  onToggle: () => void;
  disabled?: boolean;
}

export function StatusToggle({ status, onToggle, disabled }: StatusToggleProps) {
  const isActive = status === 'active';
  const isInvited = status === 'invited';

  if (isInvited) {
    return (
      <span className="text-xs text-muted-foreground italic">Pending</span>
    );
  }

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive ? 'bg-success' : 'bg-muted-foreground/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform',
          isActive ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
