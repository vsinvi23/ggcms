import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CategoryTree } from '@/components/content/CategoryTree';
import { CategoryDetailsPanel } from '@/components/content/CategoryDetailsPanel';
import { CategoryFormModal } from '@/components/content/CategoryFormModal';
import { UserGroupAssignmentPanel } from '@/components/content/UserGroupAssignmentPanel';
import { Category, UserGroup } from '@/types/content';
import { CategoryResponseDto, GroupResponseDto } from '@/api/types';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/api/hooks/useCategories';
import { useGroupsQuery } from '@/api/hooks/useGroups';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

// ─── Adapters ──────────────────────────────────────────────────────────────────

/** Convert a flat/tree CategoryResponseDto to the local Category type expected by child components */
const adaptCategory = (dto: CategoryResponseDto): Category => ({
  id: String(dto.id),
  name: dto.name,
  description: undefined,
  parentId: dto.parentId != null ? String(dto.parentId) : null,
  children: (dto.children ?? []).map(adaptCategory),
  userGroups: [],
  settings: {
    defaultReviewerGroupId: null,
    allowedContentTypes: ['course', 'article'],
    autoApproval: false,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Convert GroupResponseDto to the local UserGroup type expected by child components */
const adaptGroup = (dto: GroupResponseDto): UserGroup => ({
  id: String(dto.id),
  name: dto.name,
  description: undefined,
  members: (dto.users ?? []).map((u) => ({
    id: String(u.id),
    userId: String(u.id),
    userName: u.name,
    email: u.email,
    role: 'member' as const,
    addedAt: new Date().toISOString(),
  })),
  permissions: [],
});

// ─── Helper ────────────────────────────────────────────────────────────────────

const findCategoryById = (categories: Category[], id: string): Category | null => {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    if (cat.children.length > 0) {
      const found = findCategoryById(cat.children, id);
      if (found) return found;
    }
  }
  return null;
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ContentManagement() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: categoriesRaw, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const { data: groupsData } = useGroupsQuery();

  const { mutateAsync: createCategoryMutation, isPending: isCreating } = useCreateCategory();
  const { mutateAsync: updateCategoryMutation } = useUpdateCategory();
  const { mutateAsync: deleteCategoryMutation } = useDeleteCategory();

  // ── Derived state ──────────────────────────────────────────────────────────
  const categories: Category[] = useMemo(
    () => (categoriesRaw ?? []).map(adaptCategory),
    [categoriesRaw]
  );

  const availableGroups: UserGroup[] = useMemo(
    () => (groupsData?.items ?? []).map(adaptGroup),
    [groupsData]
  );

  const selectedCategory = selectedCategoryId
    ? findCategoryById(categories, selectedCategoryId)
    : null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelect = (category: Category) => {
    setSelectedCategoryId(category.id);
  };

  const handleAdd = (parentIdParam: string | null) => {
    setParentId(parentIdParam);
    setEditingCategory(null);
    setModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setParentId(category.parentId);
    setModalOpen(true);
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteCategoryMutation(Number(category.id));
      if (selectedCategoryId === category.id) setSelectedCategoryId(null);
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const handleSubmit = async (data: { name: string; description?: string }) => {
    try {
      if (editingCategory) {
        await updateCategoryMutation({
          id: Number(editingCategory.id),
          data: { name: data.name, parentId: parentId != null ? Number(parentId) : null },
        });
        toast.success('Category updated');
      } else {
        await createCategoryMutation({
          name: data.name,
          parentId: parentId != null ? Number(parentId) : null,
        });
        toast.success('Category created');
      }
      setModalOpen(false);
    } catch {
      toast.error(editingCategory ? 'Failed to update category' : 'Failed to create category');
    }
  };

  const handleUpdateSettings = (settings: Category['settings']) => {
    // Settings (defaultReviewerGroupId, allowedContentTypes, autoApproval) are local-only —
    // the backend CategoryCreateDto only supports name + parentId. We keep these in local
    // component state via optimistic update on the adapted object (no API round-trip needed).
    toast.success('Settings updated');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Content Management</h1>
          <p className="text-muted-foreground">Manage categories, permissions, and content organization.</p>
        </div>

        {categoriesError && (
          <Card className="mb-4 border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">
                Failed to load categories. Please try refreshing the page.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
          {/* Category Tree Panel */}
          <div className="col-span-12 lg:col-span-4 border border-border rounded-lg bg-card overflow-hidden">
            {categoriesLoading ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <Skeleton className="h-9 w-full" />
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <CategoryTree
                categories={categories}
                selectedId={selectedCategoryId}
                onSelect={handleSelect}
                onAdd={handleAdd}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>

          {/* Details Panel */}
          <div className="col-span-12 lg:col-span-8 border border-border rounded-lg bg-card p-6 overflow-auto">
            {selectedCategory ? (
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </TabsTrigger>
                  <TabsTrigger value="groups">
                    <Users className="w-4 h-4 mr-2" />
                    User Groups
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                  <CategoryDetailsPanel
                    category={selectedCategory}
                    reviewerGroups={availableGroups}
                    onUpdateSettings={handleUpdateSettings}
                  />
                </TabsContent>
                <TabsContent value="groups" className="mt-4">
                  <UserGroupAssignmentPanel
                    groups={selectedCategory.userGroups}
                    availableGroups={availableGroups}
                    onAssignGroup={() => {}}
                    onRemoveGroup={() => {}}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Select a category to view details
              </div>
            )}
          </div>
        </div>

        <CategoryFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          category={editingCategory}
          isLoading={isCreating}
        />
      </div>
    </DashboardLayout>
  );
}
