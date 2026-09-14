import { useState, useMemo } from 'react';
import { useCategories, useCreateCategory } from '@/api/hooks/useCategories';
import { CategoryResponseDto } from '@/api/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Plus, FolderTree, Check, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';

export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
  fullPath: string;
  level: number;
  parentId?: number | null;
}

const buildCategoryOptions = (
  nodes: CategoryResponseDto[],
  level = 0,
  parentPath = ''
): CategoryOption[] => {
  let options: CategoryOption[] = [];
  for (const node of nodes) {
    if (node.isVirtual) {
      if (node.children && node.children.length > 0) {
        options = options.concat(buildCategoryOptions(node.children, level, parentPath));
      }
      continue;
    }
    const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    options.push({
      id: node.id,
      name: node.name,
      slug: node.slug,
      fullPath: currentPath,
      level,
      parentId: node.parentId,
    });
    if (node.children && node.children.length > 0) {
      options = options.concat(buildCategoryOptions(node.children, level + 1, currentPath));
    }
  }
  return options;
};

interface CategoryTreeSelectProps {
  value?: number;
  categorySlug?: string;
  onSelect: (categoryId: number | undefined) => void;
  disabled?: boolean;
  className?: string;
}

export function CategoryTreeSelect({
  value,
  categorySlug,
  onSelect,
  disabled = false,
  className = '',
}: CategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState<number | null>(null);

  const { data: categoriesData, isLoading } = useCategories();
  const createCategoryMutation = useCreateCategory();

  const options = useMemo(
    () => buildCategoryOptions(categoriesData ?? []),
    [categoriesData]
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.slug.toLowerCase().includes(q) ||
        opt.fullPath.toLowerCase().includes(q)
    );
  }, [options, search]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value),
    [options, value]
  );

  const existingMatch = useMemo(() => {
    if (!newCatName.trim()) return null;
    const clean = newCatName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (!clean) return null;
    return options.find((opt) => {
      const optClean = opt.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const optSlugClean = opt.slug.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return optClean === clean || optSlugClean === clean;
    });
  }, [newCatName, options]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      toast.error('Category name is required');
      return;
    }
    if (existingMatch) {
      toast.info(`Using existing category "${existingMatch.name}"`);
      onSelect(existingMatch.id);
      setCreateDialogOpen(false);
      setNewCatName('');
      setNewCatParentId(null);
      setOpen(false);
      return;
    }
    try {
      const created = await createCategoryMutation.mutateAsync({
        name: newCatName.trim(),
        parentId: newCatParentId,
      });
      toast.success(`Category "${newCatName}" created`);
      onSelect(created.id);
      setCreateDialogOpen(false);
      setNewCatName('');
      setNewCatParentId(null);
      setOpen(false);
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to create category'));
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={`justify-between text-xs font-normal h-7 px-2 w-full ${
              !value && categorySlug
                ? 'border-destructive text-destructive hover:bg-destructive/10'
                : ''
            } ${className}`}
          >
            {selectedOption ? (
              <span className="truncate flex items-center gap-1.5">
                <FolderTree className="h-3 w-3 text-primary flex-shrink-0" />
                <span className="truncate">{selectedOption.fullPath}</span>
              </span>
            ) : categorySlug ? (
              <span className="truncate flex items-center gap-1 text-destructive font-medium">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Unrecognized: {categorySlug}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Pick Category</span>
            )}
            <ChevronRight className="ml-1 h-3 w-3 shrink-0 opacity-50 rotate-90" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 z-50" align="start">
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground ml-1" />
            <Input
              placeholder="Search category or subcategory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-1 text-xs">
            <button
              onClick={() => {
                onSelect(undefined);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between ${
                !value ? 'bg-accent text-accent-foreground font-medium' : ''
              }`}
            >
              <span>None (Unassigned)</span>
              {!value && <Check className="h-3 w-3 text-primary" />}
            </button>

            {isLoading ? (
              <div className="flex items-center justify-center p-4 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading categories…</span>
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-muted-foreground text-xs">
                No matching categories found.
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onSelect(opt.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between transition-colors ${
                    value === opt.id ? 'bg-primary/10 text-primary font-medium' : ''
                  }`}
                  style={{ paddingLeft: `${0.5 + opt.level * 0.75}rem` }}
                >
                  <span className="truncate flex items-center gap-1">
                    {opt.level > 0 && <span className="text-muted-foreground">└</span>}
                    {opt.name}
                  </span>
                  {value === opt.id && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
                </button>
              ))
            )}
          </div>

          <div className="p-1.5 border-t bg-muted/30 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 justify-center text-primary hover:text-primary gap-1"
              onClick={() => {
                setSearch('');
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add New Category</span>
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Inline Create Category Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Create New Category
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new top-level category or subcategory to the preconfigured system taxonomy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs">Category Name</Label>
              <Input
                id="cat-name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Applied Cryptography, Vector Search, WebAssembly"
                className="h-8 text-xs"
              />
              {existingMatch && (
                <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2 mt-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Category <strong>"{existingMatch.name}"</strong> already exists</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 border-amber-500/40 hover:bg-amber-500/20 shrink-0"
                    onClick={() => {
                      onSelect(existingMatch.id);
                      setCreateDialogOpen(false);
                      setNewCatName('');
                      setNewCatParentId(null);
                      setOpen(false);
                    }}
                  >
                    Select Existing
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Parent Category (Optional)</Label>
              <Select
                value={newCatParentId ? String(newCatParentId) : 'none'}
                onValueChange={(val) => setNewCatParentId(val === 'none' ? null : Number(val))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Root Category (No Parent)" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  <SelectItem value="none">Root Category (No Parent)</SelectItem>
                  {options.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.fullPath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateCategory}
              disabled={createCategoryMutation.isPending || !newCatName.trim()}
            >
              {createCategoryMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              Create & Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
