import { useState, KeyboardEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FolderTree,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
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
  useCategoriesPaged,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/api/hooks/useCategories';
import { CategoryResponseDto, CategoryCreateDto } from '@/api/types';

// ─── Tree helpers ──────────────────────────────────────────────────────────────

const buildCategoryTree = (items: CategoryResponseDto[]): CategoryResponseDto[] => {
  const itemMap = new Map<number, CategoryResponseDto>();
  const roots: CategoryResponseDto[] = [];
  items.forEach((item) => itemMap.set(item.id, { ...item, children: [] }));
  items.forEach((item) => {
    const node = itemMap.get(item.id)!;
    if (item.parentId === null || item.parentId === undefined) {
      roots.push(node);
    } else {
      const parent = itemMap.get(item.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });
  return roots;
};

const flattenCategories = (
  categories: CategoryResponseDto[],
  prefix = ''
): { id: number; name: string }[] => {
  const result: { id: number; name: string }[] = [];
  for (const cat of categories) {
    result.push({ id: cat.id, name: prefix + cat.name });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, prefix + '— '));
    }
  }
  return result;
};

const getDescendantIds = (category: CategoryResponseDto): number[] => {
  const ids: number[] = [];
  if (category.children) {
    for (const child of category.children) {
      ids.push(child.id);
      ids.push(...getDescendantIds(child));
    }
  }
  return ids;
};

// ─── CategoryItem ──────────────────────────────────────────────────────────────

interface CategoryItemProps {
  category: CategoryResponseDto;
  level: number;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (cat: CategoryResponseDto) => void;
  onDelete: (cat: CategoryResponseDto) => void;
  onAddChild: (parentId: number) => void;
}

function CategoryItem({ category, level, expandedIds, onToggle, onEdit, onDelete, onAddChild }: CategoryItemProps) {
  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = expandedIds.has(category.id);

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md group transition-colors"
        style={{ paddingLeft: `${0.75 + level * 1.5}rem` }}
      >
        <button onClick={() => hasChildren && onToggle(category.id)} className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <span className="w-4" />
          )}
        </button>
        <FolderTree className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="flex-1 font-medium text-sm">{category.name}</span>
        {hasChildren && <Badge variant="secondary" className="text-xs">{category.children!.length}</Badge>}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddChild(category.id)} title="Add child">
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(category)} title="Edit">
            <Pencil className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(category)} title="Delete">
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {category.children!.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CategoriesTab ─────────────────────────────────────────────────────────────

export function CategoriesTab() {
  const { data: pagedData, isLoading } = useCategoriesPaged({ page: 0, size: 100 });
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const flatItems = pagedData?.items || [];
  const categories = buildCategoryTree(flatItems);
  const totalCount = pagedData?.totalElements || flatItems.length;

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryResponseDto | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryResponseDto | null>(null);

  const flatCategories = flattenCategories(categories);
  const availableParents = editingCategory
    ? flatCategories.filter((c) => {
        const descendantIds = getDescendantIds(editingCategory);
        return c.id !== editingCategory.id && !descendantIds.includes(c.id);
      })
    : flatCategories;

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleOpenCreate = (defaultParentId: number | null = null) => {
    setEditingCategory(null);
    setCategoryName('');
    setParentId(defaultParentId);
    setFormOpen(true);
  };

  const handleOpenEdit = (category: CategoryResponseDto) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setParentId(category.parentId);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!categoryName.trim()) { toast.error('Category name is required'); return; }
    const data: CategoryCreateDto = { name: categoryName, parentId };
    try {
      if (editingCategory) {
        await updateMutation.mutateAsync({ id: editingCategory.id, data });
        toast.success(`Category "${categoryName}" updated`);
      } else {
        await createMutation.mutateAsync(data);
        toast.success(`Category "${categoryName}" created`);
      }
      setFormOpen(false);
      setCategoryName('');
      setParentId(null);
      setEditingCategory(null);
    } catch {
      toast.error(editingCategory ? 'Failed to update category' : 'Failed to create category');
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteMutation.mutateAsync(categoryToDelete.id);
      toast.success(`Category "${categoryToDelete.name}" deleted`);
    } catch {
      toast.error('Failed to delete category. It may have children or be in use.');
    } finally {
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => handleOpenCreate(null)} className="gap-2">
            <Plus className="w-4 h-4" /> Create Category
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="w-5 h-5" /> Category Tree
                </CardTitle>
                <CardDescription>{totalCount} categor{totalCount !== 1 ? 'ies' : 'y'} total</CardDescription>
              </div>
              {categories.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedIds(new Set(flatItems.map((c) => c.id)))}>
                    Expand All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedIds(new Set())}>
                    Collapse All
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderTree className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No categories created yet.</p>
                <Button variant="outline" className="mt-4" onClick={() => handleOpenCreate(null)}>
                  <Plus className="w-4 h-4 mr-2" /> Create your first category
                </Button>
              </div>
            ) : (
              <div className="space-y-0.5 border rounded-lg p-3 bg-muted/20">
                {categories.map((category) => (
                  <CategoryItem
                    key={category.id}
                    category={category}
                    level={0}
                    expandedIds={expandedIds}
                    onToggle={toggleExpand}
                    onEdit={handleOpenEdit}
                    onDelete={(cat) => { setCategoryToDelete(cat); setDeleteDialogOpen(true); }}
                    onAddChild={(pId) => handleOpenCreate(pId)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>{editingCategory ? 'Update the category details.' : 'Enter details for the new category.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Category Name</Label>
              <Input
                id="name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g., AI, Machine Learning, Cloud"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Category (Optional)</Label>
              <Select value={parentId?.toString() || 'none'} onValueChange={(v) => setParentId(v === 'none' ? null : parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select parent category" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="none">No Parent (Root Category)</SelectItem>
                  {availableParents.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{categoryToDelete?.name}&rdquo;?
              {categoryToDelete?.children && categoryToDelete.children.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning: This category has {categoryToDelete.children.length} child categories.
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
    </>
  );
}
