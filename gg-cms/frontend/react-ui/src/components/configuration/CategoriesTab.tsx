import { useState, useMemo, useEffect, KeyboardEvent } from 'react';
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
  Search,
  BookOpen,
  Info,
  X,
  Layers,
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
  useCategories,
  useCategoriesPaged,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/api/hooks/useCategories';
import { CategoryResponseDto, CategoryCreateDto } from '@/api/types';
import { toUserMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

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
  selectedCategoryId: number | null;
  onSelect: (cat: CategoryResponseDto) => void;
  onToggle: (id: number) => void;
  onEdit: (cat: CategoryResponseDto) => void;
  onDelete: (cat: CategoryResponseDto) => void;
  onAddChild: (parentId: number) => void;
}

function CategoryItem({
  category,
  level,
  expandedIds,
  selectedCategoryId,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
}: CategoryItemProps) {
  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedCategoryId === category.id;

  return (
    <div>
      <div
        onClick={() => onSelect(category)}
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-xl group transition-all cursor-pointer border',
          isSelected
            ? 'bg-primary/10 border-primary/40 text-foreground font-semibold'
            : 'border-transparent hover:bg-muted/50 hover:border-border/60 text-muted-foreground hover:text-foreground',
        )}
        style={{ paddingLeft: `${0.75 + level * 1.25}rem` }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(category.id);
          }}
          className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <span className="w-4" />
          )}
        </button>
        <FolderTree className={cn('w-4 h-4 flex-shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
        <span className="flex-1 font-medium text-sm truncate">{category.name}</span>
        {hasChildren && (
          <Badge variant="secondary" className="text-[10px] px-2 py-0 rounded-full font-bold">
            {category.children!.length} sub
          </Badge>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(category.id);
            }}
            title="Add child category"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category);
            }}
            title="Edit category"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(category);
            }}
            title="Delete category"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {category.children!.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
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
  const { data: treeCategories = [], isLoading: isTreeLoading, isError: isTreeError, error: treeError, refetch: refetchTree } = useCategories();
  const { data: pagedData, isLoading: isPagedLoading, isError: isPagedError, error: pagedError, refetch: refetchPaged } = useCategoriesPaged({ page: 0, size: 500 });
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const flatItems = pagedData?.items || [];
  
  // Use backend tree categories if available, or build tree from flat items
  const categories = useMemo(() => {
    if (treeCategories && treeCategories.length > 0) {
      return treeCategories;
    }
    return buildCategoryTree(flatItems);
  }, [treeCategories, flatItems]);

  const isLoading = (isTreeLoading && isPagedLoading) && categories.length === 0;
  const isError = (isTreeError && isPagedError) && categories.length === 0;

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const allCategoryIds = useMemo(() => flatCategories.map((c) => c.id), [flatCategories]);
  const totalCount = pagedData?.totalElements || flatCategories.length;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryResponseDto | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Auto-expand all category nodes when categories load for immediate visibility
  useEffect(() => {
    if (categories.length > 0) {
      const allIds = new Set<number>();
      const collectIds = (nodes: CategoryResponseDto[]) => {
        nodes.forEach((node) => {
          allIds.add(node.id);
          if (node.children && node.children.length > 0) {
            collectIds(node.children);
          }
        });
      };
      collectIds(categories);
      setExpandedIds(allIds);
    }
  }, [categories]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryResponseDto | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryResponseDto | null>(null);

  // Search filtering
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.trim().toLowerCase();
    const filterNodes = (nodes: CategoryResponseDto[]): CategoryResponseDto[] => {
      return nodes
        .map((node) => {
          const match = node.name.toLowerCase().includes(q);
          const matchingChildren = node.children ? filterNodes(node.children) : [];
          if (match || matchingChildren.length > 0) {
            return { ...node, children: matchingChildren };
          }
          return null;
        })
        .filter(Boolean) as CategoryResponseDto[];
    };
    return filterNodes(categories);
  }, [categories, searchQuery]);

  const availableParents = editingCategory
    ? flatCategories.filter((c) => {
        const descendantIds = getDescendantIds(editingCategory);
        return c.id !== editingCategory.id && !descendantIds.includes(c.id);
      })
    : flatCategories;

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
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
    } catch (err) {
      toast.error(toUserMessage(err, editingCategory ? 'Failed to update category' : 'Failed to create category'));
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteMutation.mutateAsync(categoryToDelete.id);
      toast.success(`Category "${categoryToDelete.name}" deleted`);
      if (selectedCategory?.id === categoryToDelete.id) {
        setSelectedCategory(null);
      }
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to delete category. It may have children or be in use.'));
    } finally {
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    }
  };

  const rootParentName = selectedCategory?.parentId
    ? flatItems.find((c) => c.id === selectedCategory.parentId)?.name
    : 'Root Category';

  return (
    <>
      <div className="space-y-4">
        {/* Header Actions & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search category tree..."
              className="pl-9 h-10 rounded-xl bg-card border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button onClick={() => handleOpenCreate(null)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" /> Create Root Category
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Tree Card */}
          <div className={cn(selectedCategory ? 'lg:col-span-7' : 'lg:col-span-12', 'transition-all')}>
            <Card className="rounded-2xl border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FolderTree className="w-5 h-5 text-primary" /> Category Taxonomy Tree
                    </CardTitle>
                    <CardDescription>{totalCount} total categories registered</CardDescription>
                  </div>
                  {categories.length > 0 && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setExpandedIds(new Set(allCategoryIds))} className="h-8 text-xs rounded-lg">
                        Expand All
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setExpandedIds(new Set())} className="h-8 text-xs rounded-lg">
                        Collapse All
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : isError ? (
                  <div className="text-center py-12 space-y-3 bg-destructive/5 rounded-xl border border-destructive/20 p-6">
                    <p className="text-sm font-semibold text-destructive">Failed to load categories from backend</p>
                    <p className="text-xs text-muted-foreground font-mono">{toUserMessage(treeError || pagedError)}</p>
                    <Button variant="outline" size="sm" className="rounded-xl mt-2" onClick={() => { refetchTree(); refetchPaged(); }}>
                      Retry Loading
                    </Button>
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground space-y-3">
                    <FolderTree className="w-12 h-12 mx-auto opacity-40" />
                    <p className="text-sm font-medium">No categories match your search filter.</p>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setSearchQuery(''); handleOpenCreate(null); }}>
                      <Plus className="w-4 h-4 mr-2" /> Create Category
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1 border rounded-xl p-3 bg-muted/20">
                    {filteredCategories.map((category) => (
                      <CategoryItem
                        key={category.id}
                        category={category}
                        level={0}
                        expandedIds={expandedIds}
                        selectedCategoryId={selectedCategory?.id ?? null}
                        onSelect={(cat) => setSelectedCategory(cat)}
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

          {/* Right-Hand Details Inspection Panel */}
          {selectedCategory && (
            <div className="lg:col-span-5 space-y-4">
              <Card className="rounded-2xl border-primary/30 bg-card shadow-sm relative overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-primary to-cyan-500 w-full" />
                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div>
                    <Badge variant="outline" className="mb-2 text-[10px] font-bold border-primary/30 text-primary">
                      <Info className="w-3 h-3 mr-1" /> Category Details
                    </Badge>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <FolderTree className="w-5 h-5 text-primary" /> {selectedCategory.name}
                    </CardTitle>
                    <CardDescription className="text-xs">ID: #{selectedCategory.id} • {rootParentName}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setSelectedCategory(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                    <div>
                      <span className="text-xs text-muted-foreground block font-medium">Hierarchy Position</span>
                      <span className="font-semibold text-foreground">{selectedCategory.parentId ? 'Sub-category' : 'Root Domain'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block font-medium">Sub-categories</span>
                      <span className="font-semibold text-foreground">{selectedCategory.children?.length ?? 0} direct children</span>
                    </div>
                  </div>

                  {/* Subcategories list */}
                  {selectedCategory.children && selectedCategory.children.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Child Subcategories</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCategory.children.map((child) => (
                          <Badge
                            key={child.id}
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary/20 transition-colors py-1 px-2.5 rounded-lg"
                            onClick={() => setSelectedCategory(child)}
                          >
                            <ChevronRight className="w-3 h-3 mr-1 text-primary" /> {child.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-border">
                    <Button variant="outline" size="sm" className="rounded-xl flex-1 gap-1.5" onClick={() => handleOpenCreate(selectedCategory.id)}>
                      <Plus className="w-3.5 h-3.5 text-primary" /> Add Sub-category
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => handleOpenEdit(selectedCategory)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-destructive/10" onClick={() => { setCategoryToDelete(selectedCategory); setDeleteDialogOpen(true); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>{editingCategory ? 'Update category details.' : 'Enter details for the new category.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Category Name</Label>
              <Input
                id="name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g., Cloud Architecture, Machine Learning, Security"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Category (Optional)</Label>
              <Select value={parentId?.toString() || 'none'} onValueChange={(v) => setParentId(v === 'none' ? null : parseInt(v))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select parent category" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50 rounded-xl">
                  <SelectItem value="none">No Parent (Root Category)</SelectItem>
                  {availableParents.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button className="rounded-xl" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{categoryToDelete?.name}&rdquo;?
              {categoryToDelete?.children && categoryToDelete.children.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This category has {categoryToDelete.children.length} child categories.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
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

