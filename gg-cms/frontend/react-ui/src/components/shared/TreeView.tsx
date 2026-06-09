import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Folder, FolderOpen, GripVertical, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface TreeNode<T = unknown> {
  id: string;
  label: string;
  children: TreeNode<T>[];
  data?: T;
  icon?: React.ElementType;
}

interface TreeViewProps<T> {
  nodes: TreeNode<T>[];
  selectedId?: string | null;
  onSelect?: (node: TreeNode<T>) => void;
  onEdit?: (node: TreeNode<T>) => void;
  onDelete?: (node: TreeNode<T>) => void;
  onAdd?: (parentNode: TreeNode<T>) => void;
  draggable?: boolean;
  className?: string;
  renderActions?: (node: TreeNode<T>) => React.ReactNode;
}

interface TreeNodeItemProps<T> {
  node: TreeNode<T>;
  level: number;
  selectedId?: string | null;
  onSelect?: (node: TreeNode<T>) => void;
  onEdit?: (node: TreeNode<T>) => void;
  onDelete?: (node: TreeNode<T>) => void;
  onAdd?: (parentNode: TreeNode<T>) => void;
  draggable?: boolean;
  renderActions?: (node: TreeNode<T>) => React.ReactNode;
}

function TreeNodeItem<T>({
  node,
  level,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  draggable,
  renderActions,
}: TreeNodeItemProps<T>) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const Icon = node.icon;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  }, []);

  const handleSelect = useCallback(() => {
    onSelect?.(node);
  }, [node, onSelect]);

  return (
    <div className="select-none" role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        className={cn(
          'group flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {draggable && (
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
        )}
        
        <button
          onClick={handleToggle}
          className={cn(
            'p-0.5 rounded hover:bg-muted',
            !hasChildren && 'invisible'
          )}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {Icon ? (
          <Icon className="w-4 h-4 text-muted-foreground" />
        ) : hasChildren ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-warning" />
          ) : (
            <Folder className="w-4 h-4 text-warning" />
          )
        ) : (
          <div className="w-4 h-4" />
        )}

        <span className="flex-1 text-sm font-medium truncate">{node.label}</span>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {renderActions ? (
            renderActions(node)
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onAdd && (
                  <DropdownMenuItem onClick={() => onAdd(node)}>
                    Add Child
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(node)}>
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(node)}
                    className="text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdd={onAdd}
              draggable={draggable}
              renderActions={renderActions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView<T>({
  nodes,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  draggable = false,
  className,
  renderActions,
}: TreeViewProps<T>) {
  return (
    <div className={cn('', className)} role="tree">
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onAdd={onAdd}
          draggable={draggable}
          renderActions={renderActions}
        />
      ))}
    </div>
  );
}
