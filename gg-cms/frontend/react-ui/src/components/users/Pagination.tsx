import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const safeTotalItems = totalItems || 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / pageSize));
  
  const getVisiblePages = () => {
    const pages: (number | 'ellipsis')[] = [];
    
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    // Always show first page
    pages.push(1);
    
    if (currentPage > 3) {
      pages.push('ellipsis');
    }
    
    // Show pages around current page
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }
    
    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }
    
    // Always show last page
    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex items-center justify-between py-4">
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 px-3"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>

        {getVisiblePages().map((page, index) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(page)}
              className={cn(
                'h-8 w-8 p-0',
                currentPage === page && 'bg-primary text-primary-foreground'
              )}
            >
              {page}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 px-3"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Results info and go to page */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            placeholder="1"
            className="w-16 h-8 text-center"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const value = Number((e.target as HTMLInputElement).value);
                if (value >= 1 && value <= totalPages) {
                  onPageChange(value);
                }
              }
            }}
          />
          <span className="text-sm text-muted-foreground">{safeTotalItems} Results</span>
        </div>
      </div>
    </div>
  );
}
