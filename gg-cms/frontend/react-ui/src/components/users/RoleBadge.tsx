import { cn } from '@/lib/utils';
import { UserRole } from '@/types/user';

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

const roleStyles: Record<UserRole, string> = {
  Admin: 'bg-role-admin/15 text-role-admin border-role-admin/30',
  Viewer: 'bg-role-viewer/15 text-role-viewer border-role-viewer/30',
  Editor: 'bg-role-editor/15 text-role-editor border-role-editor/30',
  Moderator: 'bg-role-moderator/15 text-role-moderator border-role-moderator/30',
};

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border',
        roleStyles[role],
        className
      )}
    >
      {role}
    </span>
  );
}
