import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { ImportCourseSectionTree } from '@/components/import/ImportCourseSectionTree';
import { CategoryTreeSelect } from '@/components/import/CategoryTreeSelect';
import { ImportPreviewItem } from '@/api/services/importService';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks } from '@/lib/htmlParser';
import { EducativeArticleReader } from '@/components/articles/EducativeArticleReader';
import { Eye, Edit3, AlertTriangle, CheckCircle2, XCircle, Trash2, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImportReviewRowProps {
  item: ImportPreviewItem;
  onChange: (patch: Partial<ImportPreviewItem>) => void;
  onDelete?: () => void;
  onSaveForLater?: () => void;
}

export function ImportReviewRow({ item, onChange, onDelete, onSaveForLater }: ImportReviewRowProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [blocks, setBlocks] = useState<ContentBlock[]>(() =>
    parseBodyToBlocks(item.body || '', item.bodyFormat as 'json' | 'html' | 'markdown')
  );

  const handleBlocksChange = (next: ContentBlock[]) => {
    setBlocks(next);
    onChange({ body: JSON.stringify(next), bodyFormat: 'json' });
  };

  return (
    <div className="px-5 py-4 space-y-4 border-t border-border bg-muted/10">
      {/* Tab bar for switching between Content View Preview and Edit mode */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'edit')}>
          <TabsList className="h-8">
            <TabsTrigger value="preview" className="text-xs flex items-center gap-1.5 px-3 py-1">
              <Eye className="h-3.5 w-3.5" />
              Content View Preview
            </TabsTrigger>
            <TabsTrigger value="edit" className="text-xs flex items-center gap-1.5 px-3 py-1">
              <Edit3 className="h-3.5 w-3.5" />
              Edit & Form Fields
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {item.valid ? (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50/50 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" /> Valid Format
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs flex items-center gap-1 font-semibold">
              <XCircle className="h-3 w-3" /> Wrong Format
            </Badge>
          )}
          {item.bodyFormat && (
            <Badge variant="secondary" className="text-xs font-mono uppercase">
              {item.bodyFormat}
            </Badge>
          )}
          {onSaveForLater && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={onSaveForLater}
              title="Save to confirm later"
            >
              <Bookmark className="h-3.5 w-3.5 text-primary" /> Save for Later
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
              title="Discard this document from preview"
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          )}
        </div>
      </div>

      {/* Content View Preview Tab */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          {!item.valid && (
            <div className="p-3.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive space-y-1">
              <div className="flex items-center gap-2 font-semibold text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span>Wrong Format / Validation Error</span>
              </div>
              <p className="text-xs text-destructive/90 font-mono">{item.error || 'The uploaded file content does not match the expected format schema.'}</p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
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
        </div>
      )}

      {/* Edit Form Tab */}
      {activeTab === 'edit' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={item.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Title"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category / Subcategory</label>
              <CategoryTreeSelect
                value={item.categoryId}
                categorySlug={item.categorySlug}
                onSelect={(catId) => onChange({ categoryId: catId })}
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
      )}
    </div>
  );
}
