import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { ImportCourseSectionTree } from '@/components/import/ImportCourseSectionTree';
import { ImportPreviewItem } from '@/api/services/importService';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks } from '@/lib/htmlParser';

interface ImportReviewRowProps {
  item: ImportPreviewItem;
  onChange: (patch: Partial<ImportPreviewItem>) => void;
}

export function ImportReviewRow({ item, onChange }: ImportReviewRowProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() =>
    parseBodyToBlocks(item.body, item.bodyFormat as 'json' | 'html' | 'markdown')
  );

  const handleBlocksChange = (next: ContentBlock[]) => {
    setBlocks(next);
    onChange({ body: JSON.stringify(next), bodyFormat: 'json' });
  };

  return (
    <div className="px-4 py-4 space-y-3 border-t border-border bg-muted/5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            value={item.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Title"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Short summary"
            rows={1}
            className="min-h-9"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {item.type === 'COURSE' ? 'Course overview' : 'Body'}
        </label>
        <RichContentEditor blocks={blocks} onChange={handleBlocksChange} />
      </div>

      {item.type === 'COURSE' && (
        <ImportCourseSectionTree
          sections={item.sections ?? []}
          onChange={(sections) => onChange({ sections })}
        />
      )}
    </div>
  );
}
