import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ImportPreviewItem } from '@/api/services/importService';
import { EducativeArticleReader } from '@/components/articles/EducativeArticleReader';
import { Eye, FileCheck, X } from 'lucide-react';

interface ImportArticleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ImportPreviewItem | null;
  onConfirmSingle?: () => void;
}

export function ImportArticleModal({
  open,
  onOpenChange,
  item,
  onConfirmSingle,
}: ImportArticleModalProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-foreground">
              <Eye className="w-5 h-5 text-primary" />
              Import Document Actual View Preview
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Review how this imported document will actually render on the platform before submitting to draft.
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            {item.valid ? (
              <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50/50">
                Valid Format
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                Wrong Format
              </Badge>
            )}
            {onConfirmSingle && (
              <Button
                size="sm"
                onClick={() => {
                  onConfirmSingle();
                  onOpenChange(false);
                }}
                disabled={!item.valid}
                className="gap-1.5"
              >
                <FileCheck className="w-4 h-4" />
                Submit to Draft
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Modal Scrollable Reader Container */}
        <div className="flex-1 overflow-y-auto">
          <EducativeArticleReader
            title={item.title}
            description={item.description}
            body={item.body}
            bodyFormat={item.bodyFormat}
            type={item.type}
            categorySlug={item.categorySlug}
            articleType={item.articleType}
            tags={item.tags}
            sections={item.sections}
            showToc={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
