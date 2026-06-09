import { UserResponse } from '@/api/types';
import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Mail, Calendar, Clock, User } from 'lucide-react';

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
  user: UserResponse | null;
}

const statusDisplayMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  PENDING: { label: 'Invited', variant: 'outline' },
  DEACTIVATED: { label: 'Deactivated', variant: 'destructive' },
};

export function UserProfileModal({ open, onClose, user }: UserProfileModalProps) {
  if (!user) return null;

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const statusInfo = statusDisplayMap[user.status] || statusDisplayMap.INACTIVE;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Profile Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-sm font-medium font-mono text-xs">{user.id}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created At</p>
                <p className="text-sm font-medium">
                  {format(new Date(user.createdAt), 'MMM dd, yyyy hh:mm a')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Login</p>
                <p className="text-sm font-medium">
                  {user.lastLogin 
                    ? format(new Date(user.lastLogin), 'MMM dd, yyyy hh:mm a')
                    : 'Never logged in'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
