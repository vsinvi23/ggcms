import { useState, useEffect, useMemo } from 'react';
import { useUsers, useDeleteUser, useDeactivateUser, useActivateUser, useUpdateUser } from '@/api/hooks/useUsers';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserTabs } from '@/components/users/UserTabs';
import { UserTable } from '@/components/users/UserTable';
import { Pagination } from '@/components/users/Pagination';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { EditUserModal } from '@/components/users/EditUserModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, Loader2 } from 'lucide-react';
import { UserStatus, UserResponse } from '@/api/types';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type TabStatus = 'all' | 'active' | 'deactivated' | 'invited';

export default function UserManagementPage() {
  const {
    users,
    totalElements,
    currentPage,
    isLoading,
    error,
    fetchUsers,
  } = useUsers();

  const deleteUserMutation = useDeleteUser();
  const deactivateUserMutation = useDeactivateUser();
  const activateUserMutation = useActivateUser();
  const updateUserMutation = useUpdateUser();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserResponse | null>(null);

  useEffect(() => {
    fetchUsers({ page: 0, size: pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const counts = useMemo(() => ({
    all: totalElements,
    active: users.filter(u => u.status === 'ACTIVE').length,
    deactivated: users.filter(u => u.status === 'DEACTIVATED' || u.status === 'INACTIVE').length,
    invited: users.filter(u => u.status === 'PENDING').length,
  }), [users, totalElements]);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (activeTab === 'active') result = result.filter(u => u.status === 'ACTIVE');
    else if (activeTab === 'deactivated') result = result.filter(u => u.status === 'DEACTIVATED' || u.status === 'INACTIVE');
    else if (activeTab === 'invited') result = result.filter(u => u.status === 'PENDING');
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
    }
    return result;
  }, [users, activeTab, searchQuery]);

  const handleTabChange = (status: TabStatus) => setActiveTab(status);
  const handleSearch = (search: string) => setSearchQuery(search);
  const handleSort = (column: string) => {
    setSortOrder(sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc');
    setSortBy(column);
  };

  const handlePageChange = (page: number) => fetchUsers({ page: page - 1, size: pageSize });
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    fetchUsers({ page: 0, size });
  };

  const handleToggleStatus = async (userId: string, currentStatus: UserStatus) => {
    try {
      const numericId = parseInt(userId);
      if (currentStatus === 'ACTIVE') {
        await deactivateUserMutation.mutateAsync(numericId);
        toast.success('User deactivated successfully');
      } else {
        await activateUserMutation.mutateAsync(numericId);
        toast.success('User activated successfully');
      }
      fetchUsers({ page: currentPage, size: pageSize });
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleDeleteClick = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setUserToDelete(user);
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    try {
      await deleteUserMutation.mutateAsync(parseInt(userToDelete.id));
      toast.success(`User "${userToDelete.name}" deleted successfully`);
      fetchUsers({ page: currentPage, size: pageSize });
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleEditUser = (user: UserResponse) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const handleSaveUser = async (
    userId: string,
    data: { name: string; email: string; status: UserStatus; groupId?: number },
  ): Promise<boolean> => {
    try {
      await updateUserMutation.mutateAsync({
        userId: parseInt(userId),
        data: { name: data.name, status: data.status, groupId: data.groupId },
      });
      toast.success('User updated successfully');
      fetchUsers({ page: currentPage, size: pageSize });
      return true;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      toast.error(e?.response?.data?.error?.message || e?.message || 'Failed to update user');
      return false;
    }
  };

  const handleUserCreated = () => fetchUsers({ page: 0, size: pageSize });

  if (error) toast.error(error);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Manage Users</h1>
            <p className="text-muted-foreground mt-1">View and manage platform users</p>
          </div>
          <Button onClick={() => setInviteModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Invite User
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <UserTabs activeTab={activeTab} onTabChange={handleTabChange} counts={counts} />
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search user" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <UserTable users={filteredUsers} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} onToggleStatus={handleToggleStatus} onDeleteUser={handleDeleteClick} onEditUser={handleEditUser} />
              <div className="border-t border-border px-4">
                <Pagination currentPage={currentPage + 1} pageSize={pageSize} totalItems={totalElements} onPageChange={handlePageChange} onPageSizeChange={handlePageSizeChange} />
              </div>
            </>
          )}
        </div>
      </div>

      <InviteUserModal open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} onUserCreated={handleUserCreated} />
      <EditUserModal open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingUser(null); }} user={editingUser} onSave={handleSaveUser} />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{userToDelete?.name}"? This action cannot be undone and will permanently remove the user from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
