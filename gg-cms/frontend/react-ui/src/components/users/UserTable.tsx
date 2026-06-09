import { useState } from 'react';
import { UserResponse, UserStatus } from '@/api/types';
import { format } from 'date-fns';
import { RoleBadge } from './RoleBadge';
import { StatusToggle } from './StatusToggle';
import { UserProfileModal } from './UserProfileModal';
import { ChevronDown, ChevronUp, Edit, MoreHorizontal, Trash2, User, UserX, UserCheck } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface UserTableProps {
  users: UserResponse[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onToggleStatus: (userId: string, currentStatus: UserStatus) => void;
  onDeleteUser: (userId: string) => void;
  onEditUser: (user: UserResponse) => void;
}

interface SortableHeaderProps {
  label: string;
  column: string;
  currentSort: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

function SortableHeader({ label, column, currentSort, sortOrder, onSort }: SortableHeaderProps) {
  const isActive = currentSort === column;

  return (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <span className="flex flex-col">
        <ChevronUp
          className={cn(
            'w-3 h-3 -mb-1',
            isActive && sortOrder === 'asc' ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
        <ChevronDown
          className={cn(
            'w-3 h-3',
            isActive && sortOrder === 'desc' ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </span>
    </button>
  );
}

// Map API status to display
const statusDisplayMap: Record<UserStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  PENDING: { label: 'Invited', variant: 'outline' },
  DEACTIVATED: { label: 'Deactivated', variant: 'destructive' },
};

export function UserTable({ users, sortBy, sortOrder, onSort, onToggleStatus, onDeleteUser, onEditUser }: UserTableProps) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<UserResponse | null>(null);

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const handleViewProfile = (user: UserResponse) => {
    setViewingUser(user);
    setProfileModalOpen(true);
  };

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No users found</p>
        <p className="text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-table-border bg-table-header">
            <th className="text-left py-3 px-4 text-sm font-medium">
              <SortableHeader
                label="User"
                column="name"
                currentSort={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium">
              <SortableHeader
                label="Email Id"
                column="email"
                currentSort={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium">
              <SortableHeader
                label="Status"
                column="status"
                currentSort={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium">
              <SortableHeader
                label="Created"
                column="createdAt"
                currentSort={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            </th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr
              key={user.id}
              className={cn(
                'border-b border-table-border hover:bg-table-row-hover transition-colors',
                index % 2 === 0 ? 'bg-card' : 'bg-background'
              )}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{user.name}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-muted-foreground">
                {user.email}
              </td>
              <td className="py-3 px-4">
                <Badge variant={statusDisplayMap[user.status].variant}>
                  {statusDisplayMap[user.status].label}
                </Badge>
              </td>
              <td className="py-3 px-4 text-muted-foreground text-sm">
                {format(new Date(user.createdAt), 'MM/dd/yyyy, hh:mm a')}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditUser(user)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit User</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewProfile(user)}>
                        <User className="w-4 h-4 mr-2" />
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggleStatus(user.id, user.status)}>
                        {user.status === 'ACTIVE' ? (
                          <>
                            <UserX className="w-4 h-4 mr-2" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {user.name}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeleteUser(user.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* User Profile Modal */}
      <UserProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={viewingUser}
      />
    </div>
  );
}
