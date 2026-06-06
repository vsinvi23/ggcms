import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CategoryResponseDto, TagDto } from '@/api/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-sm border whitespace-nowrap transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:border-primary/60 hover:bg-primary/5'
      )}
    >
      {label}
    </button>
  );
}

// ─── props ───────────────────────────────────────────────────────────────────

export interface FilterBarProps {
  /** Flat list of categories to show as chips */
  categories?: CategoryResponseDto[];
  /** Currently selected category id (undefined = "All") */
  selectedCategoryId?: number;
  onCategoryChange: (id: number | undefined) => void;
  categoriesLoading?: boolean;

  /** Tag chips. Pass undefined/empty to skip rendering the tag row. */
  tags?: TagDto[];
  /** Currently selected tag ids */
  selectedTagIds?: number[];
  onTagChange?: (id: number) => void;
  tagsLoading?: boolean;

  /** Whether any filter is currently active (controls "Clear filters" visibility) */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

// ─── component ───────────────────────────────────────────────────────────────

export function FilterBar({
  categories,
  selectedCategoryId,
  onCategoryChange,
  categoriesLoading,
  tags,
  selectedTagIds = [],
  onTagChange,
  tagsLoading,
  hasActiveFilters,
  onClearFilters,
}: FilterBarProps) {
  const showTags = tags !== undefined || tagsLoading;

  return (
    <div className="space-y-3">
      {/* Category row */}
      <div className="overflow-x-auto flex items-center gap-2 pb-2 -mx-1 px-1">
        {categoriesLoading ? (
          <>
            {[80, 100, 90, 110, 70].map((w, i) => (
              <Skeleton key={i} className="h-7 rounded-full flex-shrink-0" style={{ width: w }} />
            ))}
          </>
        ) : (
          <>
            <FilterChip
              label="All"
              active={selectedCategoryId === undefined}
              onClick={() => onCategoryChange(undefined)}
            />
            {(categories ?? []).map((cat) => (
              <FilterChip
                key={cat.id}
                label={cat.name}
                active={selectedCategoryId === cat.id}
                onClick={() => onCategoryChange(cat.id)}
              />
            ))}
          </>
        )}

        {/* Clear button sits at the end of the category row */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="ml-2 flex-shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Tag row */}
      {showTags && (
        <div className="overflow-x-auto flex items-center gap-2 pb-2 -mx-1 px-1">
          <span className="text-xs text-muted-foreground flex-shrink-0">Tags:</span>
          {tagsLoading ? (
            <>
              {[70, 90, 60, 80].map((w, i) => (
                <Skeleton key={i} className="h-6 rounded-full flex-shrink-0" style={{ width: w }} />
              ))}
            </>
          ) : (tags ?? []).length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No tags available</span>
          ) : (
            (tags ?? []).map((tag) => {
              const isActive = selectedTagIds.includes(tag.id);
              return (
                <Badge
                  key={tag.id}
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1 text-xs select-none transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:border-primary/60 hover:bg-primary/5'
                  )}
                  onClick={() => onTagChange?.(tag.id)}
                >
                  {tag.name}
                </Badge>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
