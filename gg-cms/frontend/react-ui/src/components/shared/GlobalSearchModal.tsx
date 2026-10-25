import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SearchCombobox } from '@/components/search/SearchCombobox';

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Type at least two characters for suggestions. Use the arrow keys to move through them and Enter to open one.
        </DialogDescription>
        <div className="pr-8">
          <SearchCombobox
            inline
            autoFocus
            label="Search courses, articles, topics and categories"
            placeholder="Search courses, articles, topics, categories..."
            onDone={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
