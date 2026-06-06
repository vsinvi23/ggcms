import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Category } from '@/types/content';
import { TreeView, TreeNode } from '@/components/shared/TreeView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, RefreshCw } from 'lucide-react';

interface CategoryTreeProps {
  categories: Category[];
  selectedId?: string | null;
  onSelect: (category: Category) => void;
  onAdd: (parentId: string | null) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  className?: string;
}

const categoriesToTreeNodes = (categories: Category[]): TreeNode<Category>[] => {
  return categories.map((cat) => ({
    id: cat.id,
    label: cat.name,
    children: categoriesToTreeNodes(cat.children),
    data: cat,
  }));
};

export function CategoryTree({
  categories,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  className,
}: CategoryTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const treeNodes = categoriesToTreeNodes(categories);

  const handleSelect = (node: TreeNode<Category>) => {
    if (node.data) {
      onSelect(node.data);
    }
  };

  const handleEdit = (node: TreeNode<Category>) => {
    if (node.data) {
      onEdit(node.data);
    }
  };

  const handleDelete = (node: TreeNode<Category>) => {
    if (node.data) {
      onDelete(node.data);
    }
  };

  const handleAddChild = (node: TreeNode<Category>) => {
    onAdd(node.id);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Categories</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8"
              onClick={() => onAdd(null)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Root
            </Button>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <TreeView
          nodes={treeNodes}
          selectedId={selectedId}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleAddChild}
          draggable
        />
        
        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No categories yet
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAdd(null)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create First Category
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
