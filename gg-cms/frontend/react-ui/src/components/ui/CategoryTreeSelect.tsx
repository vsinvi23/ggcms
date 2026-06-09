/**
 * CategoryTreeSelect — shows category hierarchy as a collapsible tree
 * and lets the user pick a leaf or parent category.
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Check, FolderOpen, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CategoryResponseDto } from '@/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryTreeSelectProps {
  categories: CategoryResponseDto[];
  value: string;           // selected category ID as string
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// ─── Helper: flatten all categories to find selected label ───────────────────

function findCategoryById(cats: CategoryResponseDto[], id: string): CategoryResponseDto | null {
  for (const cat of cats) {
    if (String(cat.id) === id) return cat;
    if (cat.children && cat.children.length > 0) {
      const found = findCategoryById(cat.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({
  cat,
  depth,
  selectedId,
  onSelect,
}: {
  cat: CategoryResponseDto;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const hasChildren = (cat.children ?? []).length > 0;
  const [expanded, setExpanded] = useState(false);
  const isSelected = String(cat.id) === selectedId;

  return (
    <div>
      <button
        type="button"
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
        )}
        style={{ paddingLeft: `${(depth * 16) + 12}px` }}
        onClick={() => {
          onSelect(String(cat.id));
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        {/* Expand/collapse arrow */}
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 -ml-1 hover:text-primary"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Folder icon */}
        {hasChildren
          ? (expanded
            ? <FolderOpen className="w-4 h-4 text-primary/70 flex-shrink-0" />
            : <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />)
          : <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            </span>
        }

        <span className="flex-1 truncate">{cat.name}</span>

        {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {(cat.children ?? []).map((child) => (
            <TreeNode
              key={child.id}
              cat={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CategoryTreeSelect({
  categories,
  value,
  onChange,
  placeholder = 'Select category',
  disabled = false,
}: CategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCat = value ? findCategoryById(categories, value) : null;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <Button
        type="button"
        variant="outline"
        className={cn(
          'w-full justify-between font-normal',
          !selectedCat && 'text-muted-foreground',
        )}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedCat
            ? <>
                <Folder className="w-4 h-4 text-primary/70 flex-shrink-0" />
                {selectedCat.name}
              </>
            : placeholder
          }
        </span>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] max-h-72 overflow-y-auto bg-background border border-border rounded-lg shadow-lg py-1">
          {categories.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground text-center">No categories available</p>
          ) : (
            categories.map((cat) => (
              <TreeNode
                key={cat.id}
                cat={cat}
                depth={0}
                selectedId={value}
                onSelect={(id) => {
                  onChange(id);
                  setOpen(false);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
