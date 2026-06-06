import { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Layers, Plus, Trash2, Loader2, Pencil, Users, UserPlus, RefreshCw, Eye, Search, UserMinus, Shield, ChevronRight, FolderTree, X } from 'lucide-react';
import { GroupPermissions } from '@/api/types';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useGroupsQuery,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useGroupMembers,
  useAddGroupMember,
  useRemoveGroupMember,
} from '@/api/hooks/useGroups';
import { useUsersQuery } from '@/api/hooks/useUsers';
import {
  useCategories,
  useCategoriesPaged,
  useGroupCategories,
  useAddCategoryReviewerGroup,
  useRemoveCategoryReviewerGroup,
} from '@/api/hooks/useCategories';
import groupService from '@/api/services/groupService';
import { GroupResponseDto } from '@/api/types';

// ─── Role definitions ──────────────────────────────────────────────────────────

interface RoleDefinition {
  value: string;
  label: string;
  description: string;
  builtIn?: boolean;
}

const DEFAULT_ROLES: RoleDefinition[] = [
  { value: 'admin',     label: 'Admin',     description: 'Full access to all resources',        builtIn: true },
  { value: 'moderator', label: 'Moderator', description: 'View, edit and publish content',       builtIn: true },
  { value: 'editor',    label: 'Editor',    description: 'Create and edit content',              builtIn: true },
  { value: 'viewer',    label: 'Viewer',    description: 'Read-only access (default)',           builtIn: true },
];

const PERMISSION_RESOURCES: { key: keyof GroupPermissions; label: string; actions: string[] }[] = [
  { key: 'articles',   label: 'Articles',   actions: ['view','create','edit','delete','review','approve','publish'] },
  { key: 'courses',    label: 'Courses',    actions: ['view','create','edit','delete','review','approve','publish'] },
  { key: 'users',      label: 'Users',      actions: ['view','create','edit','delete'] },
  { key: 'groups',     label: 'Groups',     actions: ['view','manage'] },
  { key: 'categories', label: 'Categories', actions: ['view','create','edit','delete'] },
  { key: 'analytics',  label: 'Analytics',  actions: ['view'] },
  { key: 'settings',   label: 'Settings',   actions: ['view','manage'] },
];

const ROLE_PRESETS: Record<string, GroupPermissions> = {
  admin: {
    articles:   { view:true, create:true, edit:true, delete:true, review:true, approve:true, publish:true },
    courses:    { view:true, create:true, edit:true, delete:true, review:true, approve:true, publish:true },
    users:      { view:true, create:true, edit:true, delete:true },
    groups:     { view:true, manage:true },
    categories: { view:true, create:true, edit:true, delete:true },
    analytics:  { view:true },
    settings:   { view:true, manage:true },
  },
  moderator: {
    articles:   { view:true, create:true, edit:true, delete:false, review:true, approve:true, publish:true },
    courses:    { view:true, create:true, edit:true, delete:false, review:true, approve:true, publish:true },
    users:      { view:true, create:false, edit:false, delete:false },
    groups:     { view:true, manage:false },
    categories: { view:true, create:true, edit:true, delete:false },
    analytics:  { view:false },
    settings:   { view:true, manage:false },
  },
  editor: {
    articles:   { view:true, create:true, edit:true, delete:false, review:true, approve:false, publish:false },
    courses:    { view:true, create:true, edit:true, delete:false, review:true, approve:false, publish:false },
    users:      { view:true, create:false, edit:false, delete:false },
    groups:     { view:true, manage:false },
    categories: { view:true, create:true, edit:true, delete:false },
    analytics:  { view:false },
    settings:   { view:false, manage:false },
  },
  viewer: {
    articles:   { view:true, create:false, edit:false, delete:false, review:false, approve:false, publish:false },
    courses:    { view:true, create:false, edit:false, delete:false, review:false, approve:false, publish:false },
    users:      { view:true, create:false, edit:false, delete:false },
    groups:     { view:true, manage:false },
    categories: { view:true, create:false, edit:false, delete:false },
    analytics:  { view:false },
    settings:   { view:false, manage:false },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadgeClass(role: string | undefined) {
  switch (role) {
    case 'admin':     return 'border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/30';
    case 'moderator': return 'border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-950/30';
    case 'editor':    return 'border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30';
    default:          return 'border-muted-foreground/30 text-muted-foreground';
  }
}

// ─── GroupCategorySection ─────────────────────────────────────────────────────
// Shown inside the Edit Group dialog. Lets admins see and manage which
// categories this group is assigned to as a reviewer group.
// Supports multi-select: checkboxes let the admin pick several categories at
// once and add them all with a single "Add Selected" button.

interface GroupCategorySectionProps {
  groupId: number;
  flatCategories: { id: number; name: string; isVirtual?: boolean }[];
  onAddMultiple: (catIds: number[]) => void;
  onRemove: (catId: number) => void;
  isAdding: boolean;
  isRemoving: boolean;
}

function GroupCategorySection({
  groupId, flatCategories, onAddMultiple, onRemove, isAdding, isRemoving,
}: GroupCategorySectionProps) {
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const { data: assignedCategories = [], isLoading } = useGroupCategories(groupId);
  const assignedIds = new Set(assignedCategories.map((c) => c.id));
  const available = flatCategories.filter((c) => !assignedIds.has(c.id));
  const filtered = search.trim()
    ? available.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : available;

  const toggle = (id: number) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (filtered.every((c) => pendingIds.has(c.id))) {
      setPendingIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setPendingIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const handleAdd = () => {
    if (!pendingIds.size) return;
    onAddMultiple([...pendingIds]);
    setPendingIds(new Set());
    setSearch('');
  };

  const allFilteredChecked = filtered.length > 0 && filtered.every((c) => pendingIds.has(c.id));

  return (
    <div className="space-y-2 pt-2 border-t">
      <Label className="font-semibold flex items-center gap-2">
        <FolderTree className="w-4 h-4" />
        Reviewer Categories
        <span className="text-xs font-normal text-muted-foreground">(this group reviews content in these)</span>
      </Label>

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Assigned chips ── */}
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {assignedCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">No categories assigned yet.</p>
            ) : (
              assignedCategories.map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full border"
                >
                  {cat.name}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() => onRemove(cat.id)}
                    disabled={isRemoving}
                    aria-label={`Remove ${cat.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* ── Multi-select checklist ── */}
          {available.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              {/* Search + select-all header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                <Checkbox
                  id="select-all-cats"
                  checked={allFilteredChecked}
                  onCheckedChange={toggleAll}
                  disabled={filtered.length === 0}
                />
                <Input
                  placeholder="Search categories…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 text-xs flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Checkbox list */}
              <ScrollArea className="max-h-44">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No categories match.</p>
                ) : (
                  filtered.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={pendingIds.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))
                )}
              </ScrollArea>

              {/* Footer: count + add button */}
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {pendingIds.size > 0 ? `${pendingIds.size} selected` : 'Select categories above'}
                </span>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleAdd}
                  disabled={pendingIds.size === 0 || isAdding}
                >
                  {isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add{pendingIds.size > 0 ? ` (${pendingIds.size})` : ''}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── GroupCategoryBadges ──────────────────────────────────────────────────────
// Inline cell component — calls the hook at component level (no hook-in-map).
// Shows up to 2 category name chips + "+N more" overflow badge.

function GroupCategoryBadges({ groupId }: { groupId: number }) {
  const { data: cats = [], isLoading } = useGroupCategories(groupId);
  if (isLoading) return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
  if (cats.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const visible = cats.slice(0, 2);
  const overflow = cats.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((c) => (
        <span key={c.id} className="inline-flex items-center text-xs bg-muted px-1.5 py-0.5 rounded-full border leading-tight">
          {c.name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">+{overflow}</span>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, refetch } = useGroupsQuery({ page, size: pageSize });
  const { data: categoriesData } = useCategoriesPaged({ page: 0, size: 100 });
  const { data: allCategoriesTree = [] } = useCategories();
  const { data: usersData } = useUsersQuery({ page: 0, size: 100 });
  const createMutation = useCreateGroup();
  const updateMutation = useUpdateGroup();
  const deleteMutation = useDeleteGroup();
  const addMemberMutation = useAddGroupMember();
  const removeMemberMutation = useRemoveGroupMember();
  const addCategoryGroupMutation = useAddCategoryReviewerGroup();
  const removeCategoryGroupMutation = useRemoveCategoryReviewerGroup();

  // Flatten the category tree for the "add category" reviewer dropdown (excludes virtual).
  const reviewerFlatCategories = useMemo(() => {
    const flatten = (cats: typeof allCategoriesTree): typeof allCategoriesTree => {
      return cats.flatMap((c) => [c, ...flatten(c.children ?? [])]);
    };
    return flatten(allCategoriesTree).filter((c) => !c.isVirtual);
  }, [allCategoriesTree]);

  // ── Dynamic role list (built-ins + any custom roles created this session) ──
  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [rolePresets, setRolePresets] = useState<Record<string, GroupPermissions>>(ROLE_PRESETS);

  // ── Create/edit Group ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupResponseDto | null>(null);
  const [groupName, setGroupName] = useState('');
  const [isManualName, setIsManualName] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('viewer');
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string[]>([]);

  // ── Create/edit Role ──
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [roleEditPermissions, setRoleEditPermissions] = useState<GroupPermissions>({});

  // ── Delete dialog ──
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupResponseDto | null>(null);

  // ── User management sheet ──
  const [userSheetOpen, setUserSheetOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [addUserSearchQuery, setAddUserSearchQuery] = useState('');

  const { data: groupMembers, isLoading: membersLoading, refetch: refetchMembers } = useGroupMembers(
    selectedGroupId || 0,
    selectedGroupId !== null && userSheetOpen
  );

  const groups = data?.items || [];
  const totalElements = data?.total || data?.totalElements || 0;
  const totalPages = Math.ceil(totalElements / pageSize);
  const categories = categoriesData?.items || [];

  const [memberCounts, setMemberCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!groups.length) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          groups.map(async (g) => {
            const members = await groupService.getGroupMembers(g.id);
            return [g.id, members.length] as const;
          })
        );
        if (cancelled) return;
        setMemberCounts((prev) => {
          const next = { ...prev };
          for (const [id, count] of entries) next[id] = count;
          return next;
        });
      } catch { /* fall back to group.users length */ }
    })();
    return () => { cancelled = true; };
  }, [groups]);

  const flatCategories = useMemo(() => {
    const flat: { id: number; name: string; parentId: number | null }[] = [];
    const walk = (items: any[], parentId: number | null = null) => {
      for (const c of items) {
        flat.push({ id: c.id, name: c.name, parentId });
        if (c.children?.length) walk(c.children, c.id);
      }
    };
    walk(categories);
    return flat;
  }, [categories]);

  const categoryChildMap = useMemo(() => {
    const map: Record<number | 'root', { id: number; name: string }[]> = { root: [] };
    for (const c of flatCategories) {
      const key = c.parentId ?? 'root';
      if (!map[key]) map[key] = [];
      map[key].push({ id: c.id, name: c.name });
    }
    return map;
  }, [flatCategories]);

  const generatedName = useMemo(() => {
    if (isManualName) return groupName;
    if (!selectedCategoryPath.length) return '';
    return selectedCategoryPath
      .map(id => flatCategories.find(c => c.id.toString() === id)?.name ?? '')
      .filter(Boolean)
      .join('_');
  }, [selectedCategoryPath, flatCategories, isManualName, groupName]);

  // ── Group handlers ──────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setGroupName('');
    setIsManualName(false);
    setSelectedRole('viewer');
    setSelectedCategoryPath([]);
    setFormOpen(true);
  };

  const handleOpenEdit = (group: GroupResponseDto) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setIsManualName(true);
    setSelectedRole(group.role || 'viewer');
    setSelectedCategoryPath([]);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const finalName = isManualName ? groupName : generatedName;
    if (!finalName.trim()) {
      toast.error('Group name is required');
      return;
    }
    const permissions = rolePresets[selectedRole] || rolePresets.viewer;
    const payload = { name: finalName, role: selectedRole, permissions };
    try {
      if (editingGroup) {
        await updateMutation.mutateAsync({ id: editingGroup.id, data: payload });
        toast.success(`Group "${finalName}" updated`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Group "${finalName}" created`);
      }
      setFormOpen(false);
      setGroupName('');
      setEditingGroup(null);
    } catch {
      toast.error(editingGroup ? 'Failed to update group' : 'Failed to create group');
    }
  };

  const handleDeleteClick = (group: GroupResponseDto) => {
    setGroupToDelete(group);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    try {
      await deleteMutation.mutateAsync(groupToDelete.id);
      toast.success(`Group "${groupToDelete.name}" deleted`);
    } catch {
      toast.error('Failed to delete group');
    } finally {
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
    }
  };

  const handleViewUsers = (group: GroupResponseDto) => {
    setSelectedGroupId(group.id);
    setSelectedGroupName(group.name);
    setUserSheetOpen(true);
    setUserSearchQuery('');
    setAddUserSearchQuery('');
  };

  // ── Role handlers ──────────────────────────────────────────────────────────

  const handleOpenCreateRole = () => {
    setIsCreatingRole(true);
    setEditingRoleKey(null);
    setNewRoleLabel('');
    setRoleEditPermissions({ ...rolePresets.viewer });
    setRoleDialogOpen(true);
  };

  const handleOpenEditRole = (roleKey: string) => {
    setIsCreatingRole(false);
    setEditingRoleKey(roleKey);
    setNewRoleLabel('');
    setRoleEditPermissions({ ...rolePresets[roleKey] });
    setRoleDialogOpen(true);
  };

  const handleRolePermissionToggle = (resource: keyof GroupPermissions, action: string) => {
    setRoleEditPermissions(prev => {
      const current = (prev[resource] as any) || {};
      return { ...prev, [resource]: { ...current, [action]: !current[action] } };
    });
  };

  const handleSaveRole = () => {
    if (isCreatingRole) {
      if (!newRoleLabel.trim()) { toast.error('Role name is required'); return; }
      const newKey = newRoleLabel.toLowerCase().replace(/\s+/g, '_');
      if (rolePresets[newKey]) { toast.error('A role with that name already exists'); return; }
      setRoles(prev => [...prev, { value: newKey, label: newRoleLabel, description: 'Custom role' }]);
      setRolePresets(prev => ({ ...prev, [newKey]: roleEditPermissions }));
      toast.success(`Role "${newRoleLabel}" created`);
    } else {
      if (!editingRoleKey) return;
      setRolePresets(prev => ({ ...prev, [editingRoleKey]: roleEditPermissions }));
      toast.success('Role updated');
    }
    setRoleDialogOpen(false);
    setEditingRoleKey(null);
    setIsCreatingRole(false);
    setNewRoleLabel('');
  };

  // ── Member handlers ─────────────────────────────────────────────────────────

  const handleAddMember = async (userId: number, userName: string) => {
    if (!selectedGroupId) return;
    try {
      await addMemberMutation.mutateAsync({ groupId: selectedGroupId, userId });
      toast.success(`Added "${userName}" to group`);
      refetchMembers();
      refetch();
    } catch {
      toast.error('Failed to add user to group');
    }
  };

  const handleRemoveMember = async (userId: number, userName: string) => {
    if (!selectedGroupId) return;
    try {
      await removeMemberMutation.mutateAsync({ groupId: selectedGroupId, userId });
      toast.success(`Removed "${userName}" from group`);
      refetchMembers();
      refetch();
    } catch {
      toast.error('Failed to remove user from group');
    }
  };

  const filteredMembers = useMemo(() => {
    const members = groupMembers || [];
    if (!userSearchQuery.trim()) return members;
    const q = userSearchQuery.toLowerCase();
    return members.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [groupMembers, userSearchQuery]);

  const availableUsers = useMemo(() => {
    const allUsers = usersData?.items || [];
    const memberIds = new Set((groupMembers || []).map(m => m.id));
    const filtered = allUsers.filter(u => !memberIds.has(u.id));
    if (!addUserSearchQuery.trim()) return filtered;
    const q = addUserSearchQuery.toLowerCase();
    return filtered.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [usersData, groupMembers, addUserSearchQuery]);

  useEffect(() => {
    if (selectedGroupId && groupMembers) {
      setMemberCounts(prev => ({ ...prev, [selectedGroupId]: groupMembers.length }));
    }
  }, [selectedGroupId, groupMembers]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">User Groups & Roles</h1>
            <p className="text-muted-foreground mt-1">
              Organise users into groups and control what each group can do via roles
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* ══════════════════════════════════════════════════
            SECTION 1 — USER GROUPS
        ══════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5 text-primary" />
                User Groups
              </CardTitle>
              <CardDescription className="mt-1">
                {totalElements} group{totalElements !== 1 ? 's' : ''} — each group is assigned a role that defines what its members can do
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreate} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              New Group
            </Button>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p className="font-medium">No groups yet</p>
                <p className="text-sm mt-1">Create a group, assign a role, then add members.</p>
                <Button variant="outline" className="mt-4" onClick={handleOpenCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first group
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Reviewer Categories</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-mono text-muted-foreground text-sm">{group.id}</TableCell>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={roleBadgeClass(group.role)}
                          >
                            {roles.find(r => r.value === group.role)?.label ?? (group.role || 'Viewer')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 h-7 px-2"
                            onClick={() => handleViewUsers(group)}
                          >
                            <Users className="w-3 h-3" />
                            {memberCounts[group.id] !== undefined
                              ? memberCounts[group.id]
                              : (group.users?.length ?? 0)} users
                          </Button>
                        </TableCell>
                        <TableCell>
                          <GroupCategoryBadges groupId={group.id} />
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewUsers(group)} title="Manage members">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(group)} title="Edit group">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(group)} title="Delete group">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => handlePageSizeChange(Number(v))}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {[5, 10, 20, 50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">per page</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalElements)} of {totalElements}
                    </p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i;
                        else if (page < 3) pageNum = i;
                        else if (page > totalPages - 4) pageNum = totalPages - 5 + i;
                        else pageNum = page - 2 + i;
                        return (
                          <Button key={pageNum} variant={page === pageNum ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0" onClick={() => setPage(pageNum)}>
                            {pageNum + 1}
                          </Button>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next</Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════
            SECTION 2 — ROLES
        ══════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="w-5 h-5 text-primary" />
                Roles
              </CardTitle>
              <CardDescription className="mt-1">
                Roles define what members of a group are allowed to do. Assign a role when creating a group.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleOpenCreateRole} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              New Role
            </Button>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {roles.map((roleDef) => {
                const perms = rolePresets[roleDef.value] || {};
                return (
                  <div
                    key={roleDef.value}
                    className="rounded-lg border bg-card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                  >
                    {/* Role header */}
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={roleBadgeClass(roleDef.value)}>
                        {roleDef.label}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditRole(roleDef.value)} title="Edit role">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground leading-snug">{roleDef.description}</p>

                    {/* Permission summary */}
                    <div className="space-y-1 text-[11px] border-t pt-2">
                      {PERMISSION_RESOURCES.map(res => {
                        const p = perms[res.key] as any;
                        const granted = res.actions.filter(a => p?.[a]);
                        if (!granted.length) return null;
                        return (
                          <div key={res.key} className="flex items-start gap-1.5">
                            <span className="text-muted-foreground w-16 shrink-0 pt-0.5">{res.label}</span>
                            <div className="flex flex-wrap gap-0.5">
                              {granted.map(a => (
                                <span key={a} className="bg-muted px-1 py-0.5 rounded text-[10px] capitalize">{a}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Groups using this role */}
                    <div className="text-xs text-muted-foreground border-t pt-2 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {groups.filter(g => g.role === roleDef.value).length} group{groups.filter(g => g.role === roleDef.value).length !== 1 ? 's' : ''} using this role
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ══════════ CREATE / EDIT GROUP DIALOG ══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? 'Update the group name or its assigned role.'
                : 'Give the group a name and pick a role. The default role is Viewer.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="font-semibold">Group Name</Label>
              {!editingGroup && (
                <div className="flex items-center gap-2 mb-2">
                  <Button variant={!isManualName ? 'default' : 'outline'} size="sm" onClick={() => setIsManualName(false)}>
                    Use Dropdowns
                  </Button>
                  <Button variant={isManualName ? 'default' : 'outline'} size="sm" onClick={() => setIsManualName(true)}>
                    Custom Name
                  </Button>
                </div>
              )}
              {(isManualName || editingGroup) ? (
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Content Reviewers"
                  className="font-medium"
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Select up to 4 category levels to auto-generate the group name.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((level) => {
                      const parentId = level === 0 ? 'root' : selectedCategoryPath[level - 1];
                      const options = parentId !== undefined ? (categoryChildMap[parentId as any] ?? []) : [];
                      if (level > 0 && !selectedCategoryPath[level - 1]) return null;
                      if (level > 0 && options.length === 0) return null;
                      return (
                        <Select
                          key={level}
                          value={selectedCategoryPath[level] ?? ''}
                          onValueChange={(val) => {
                            setSelectedCategoryPath(prev => {
                              const next = prev.slice(0, level);
                              next[level] = val;
                              return next;
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={level === 0 ? 'Category' : `Sub-category ${level}`} />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg z-50">
                            {options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id.toString()}>{opt.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })}
                  </div>
                  {generatedName && (
                    <div className="p-2 bg-muted rounded text-sm">
                      <span className="text-muted-foreground">Generated: </span>
                      <span className="font-mono font-semibold">{generatedName}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role selector */}
            <div className="space-y-2">
              <Label className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Role
                <span className="text-xs font-normal text-muted-foreground">(default: Viewer)</span>
              </Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.label}</span>
                        <span className="text-xs text-muted-foreground">— {r.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Show role summary */}
              {selectedRole && rolePresets[selectedRole] && (
                <div className="p-3 rounded-lg bg-muted/50 border text-xs space-y-1">
                  {PERMISSION_RESOURCES.map(res => {
                    const p = rolePresets[selectedRole][res.key] as any;
                    const granted = res.actions.filter(a => p?.[a]);
                    if (!granted.length) return null;
                    return (
                      <div key={res.key} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">{res.label}</span>
                        <div className="flex gap-1 flex-wrap">
                          {granted.map(a => <span key={a} className="bg-background px-1.5 py-0.5 rounded border capitalize">{a}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                To change role permissions, go to the <span className="font-medium">Roles</span> section below.
              </p>
            </div>

            {/* ── Reviewer Categories (edit mode only) ── */}
            {editingGroup && (
              <GroupCategorySection
                groupId={editingGroup.id}
                flatCategories={reviewerFlatCategories}
                onAddMultiple={(catIds) => {
                  const gid = editingGroup.id;
                  Promise.allSettled(
                    catIds.map((catId) =>
                      addCategoryGroupMutation.mutateAsync({ categoryId: catId, groupId: gid })
                    )
                  ).then((results) => {
                    const failed = results.filter((r) => r.status === 'rejected').length;
                    if (failed === 0) {
                      toast.success(`${catIds.length} categor${catIds.length === 1 ? 'y' : 'ies'} assigned`);
                    } else {
                      toast.error(`${failed} of ${catIds.length} failed to assign`);
                    }
                  });
                }}
                onRemove={(catId) => {
                  removeCategoryGroupMutation.mutate(
                    { categoryId: catId, groupId: editingGroup.id },
                    {
                      onSuccess: () => toast.success('Category removed'),
                      onError: () => toast.error('Failed to remove category'),
                    }
                  );
                }}
                isAdding={addCategoryGroupMutation.isPending}
                isRemoving={removeCategoryGroupMutation.isPending}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={
                createMutation.isPending || updateMutation.isPending ||
                (!isManualName && !editingGroup && !generatedName) ||
                ((isManualName || !!editingGroup) && !groupName)
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingGroup ? 'Update Group' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════ CREATE / EDIT ROLE DIALOG ══════════ */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {isCreatingRole ? 'Create Role' : `Edit Role: ${roles.find(r => r.value === editingRoleKey)?.label ?? editingRoleKey}`}
            </DialogTitle>
            <DialogDescription>
              {isCreatingRole
                ? 'Name the new role and define what permissions it grants.'
                : 'Adjust the permissions for this role. Changes take effect for all groups using it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role name (only when creating) */}
            {isCreatingRole && (
              <div className="space-y-2">
                <Label className="font-semibold">Role Name</Label>
                <Input
                  placeholder="e.g., Reviewer"
                  value={newRoleLabel}
                  onChange={(e) => setNewRoleLabel(e.target.value)}
                />
              </div>
            )}

            {/* Permissions matrix */}
            <div className="space-y-1">
              <Label className="font-semibold">Permissions</Label>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left px-3 py-2 font-medium w-28">Resource</th>
                      {['view','create','edit','delete','review','approve','publish'].map(a => (
                        <th key={a} className="text-center px-2 py-2 font-medium capitalize text-xs">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_RESOURCES.map((res, idx) => (
                      <tr key={res.key} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <td className="px-3 py-2 font-medium text-sm">{res.label}</td>
                        {['view','create','edit','delete','review','approve','publish'].map(action => {
                          const applicable = res.actions.includes(action);
                          const checked = applicable ? !!((roleEditPermissions[res.key] as any)?.[action]) : false;
                          return (
                            <td key={action} className="text-center px-2 py-2">
                              {applicable ? (
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => handleRolePermissionToggle(res.key, action)}
                                  className="mx-auto"
                                />
                              ) : (
                                <span className="text-muted-foreground/30 text-lg">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole}>
              {isCreatingRole ? 'Create Role' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════ USER MANAGEMENT SHEET ══════════ */}
      <Sheet open={userSheetOpen} onOpenChange={setUserSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {selectedGroupName}
            </SheetTitle>
            <SheetDescription>
              {groupMembers?.length || 0} user{(groupMembers?.length || 0) !== 1 ? 's' : ''} in this group
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Add User */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Add User to Group ({availableUsers.length} available)
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users to add..."
                  value={addUserSearchQuery}
                  onChange={(e) => setAddUserSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-48 border rounded-lg">
                {availableUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No users available to add</p>
                    <p className="text-xs">All users are already members</p>
                  </div>
                ) : (
                  <div className="p-1">
                    {availableUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 ml-2"
                          onClick={() => handleAddMember(user.id, user.name)}
                          disabled={addMemberMutation.isPending}
                        >
                          {addMemberMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3" />Add</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Current Members */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Current Members</Label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-[calc(100vh-450px)]">
                {membersLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">{userSearchQuery ? 'No users match your search' : 'No users in this group'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMembers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveMember(user.id, user.name)}
                          disabled={removeMemberMutation.isPending}
                        >
                          {removeMemberMutation.isPending
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <><UserMinus className="w-3 h-3 mr-1" />Remove</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ══════════ DELETE CONFIRMATION ══════════ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{groupToDelete?.name}"?
              {groupToDelete?.users && groupToDelete.users.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning: This group has {groupToDelete.users.length} users assigned.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
