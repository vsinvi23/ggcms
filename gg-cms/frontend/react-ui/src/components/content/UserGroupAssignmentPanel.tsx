import { useState } from 'react';
import { cn } from '@/lib/utils';
import { UserGroup, GroupMember } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';

interface UserGroupAssignmentPanelProps {
  groups: UserGroup[];
  availableGroups: UserGroup[];
  onAssignGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddMember?: (groupId: string, email: string) => void;
  onRemoveMember?: (groupId: string, memberId: string) => void;
  onChangeMemberRole?: (groupId: string, memberId: string, role: GroupMember['role']) => void;
  className?: string;
}

const roleColors: Record<GroupMember['role'], string> = {
  admin: 'bg-primary/10 text-primary',
  member: 'bg-secondary text-secondary-foreground',
  viewer: 'bg-muted text-muted-foreground',
};

export function UserGroupAssignmentPanel({
  groups,
  availableGroups,
  onAssignGroup,
  onRemoveGroup,
  onAddMember,
  onRemoveMember,
  onChangeMemberRole,
  className,
}: UserGroupAssignmentPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');

  const unassignedGroups = availableGroups.filter(
    (g) => !groups.some((assigned) => assigned.id === g.id)
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAssignGroup = () => {
    if (selectedGroupId) {
      onAssignGroup(selectedGroupId);
      setAssignDialogOpen(false);
      setSelectedGroupId('');
    }
  };

  const handleAddMember = (groupId: string) => {
    if (newMemberEmail && onAddMember) {
      onAddMember(groupId, newMemberEmail);
      setNewMemberEmail('');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Assigned Groups
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAssignDialogOpen(true)}
          disabled={unassignedGroups.length === 0}
        >
          <Plus className="w-4 h-4 mr-1" />
          Assign Group
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {filteredGroups.map((group) => {
          const isExpanded = expandedGroupId === group.id;
          
          return (
            <div
              key={group.id}
              className="border border-border rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
              >
                <div>
                  <h4 className="font-medium">{group.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveGroup(group.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 bg-muted/30 space-y-3">
                  {group.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                  
                  <div className="space-y-2">
                    {group.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(member.userName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{member.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {onChangeMemberRole ? (
                            <Select
                              value={member.role}
                              onValueChange={(value: GroupMember['role']) =>
                                onChangeMemberRole(group.id, member.id, value)
                              }
                            >
                              <SelectTrigger className="w-24 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={cn('capitalize', roleColors[member.role])}>
                              {member.role}
                            </Badge>
                          )}
                          
                          {onRemoveMember && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onRemoveMember(group.id, member.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {onAddMember && (
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Input
                        placeholder="Email address"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAddMember(group.id)}
                        disabled={!newMemberEmail}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {groups.length === 0
                ? 'No groups assigned to this category'
                : 'No groups match your search'}
            </p>
          </div>
        )}
      </div>

      {/* Assign Group Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User Group</DialogTitle>
            <DialogDescription>
              Select a group to assign to this category.
            </DialogDescription>
          </DialogHeader>
          
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              {unassignedGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignGroup} disabled={!selectedGroupId}>
              Assign Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
