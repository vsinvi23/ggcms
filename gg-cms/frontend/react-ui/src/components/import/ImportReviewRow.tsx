import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { ImportCourseSectionTree } from '@/components/import/ImportCourseSectionTree';
import { CategoryTreeSelect } from '@/components/import/CategoryTreeSelect';
import { ImportPreviewItem } from '@/api/services/importService';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks, contentBlocksToHtml } from '@/lib/htmlParser';
import { sanitizeHtml } from '@/lib/sanitize';
import { Eye, Edit3, AlertTriangle, FileText, Tag, Layers, CheckCircle2, XCircle } from 'lucide-react';

interface ImportReviewRowProps {
  item: ImportPreviewItem;
  onChange: (patch: Partial<ImportPreviewItem>) => void;
}

export function ImportReviewRow({ item, onChange }: ImportReviewRowProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [blocks, setBlocks] = useState<ContentBlock[]>(() =>
    parseBodyToBlocks(item.body || '', item.bodyFormat as 'json' | 'html' | 'markdown')
  );

  // Render the parsed blocks as HTML for the "Content View Preview" tab, so
  // markdown headings (#, ##, ...) and other formatting show as final HTML
  // instead of literal source text.
  const previewHtml = useMemo(() => {
    const previewBlocks = parseBodyToBlocks(item.body || '', item.bodyFormat as 'json' | 'html' | 'markdown');
    return contentBlocksToHtml(previewBlocks);
  }, [item.body, item.bodyFormat]);

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

          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            {/* Header metadata */}
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {item.title || <span className="text-muted-foreground italic">Untitled Article</span>}
              </h3>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {item.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className="text-[11px]">{item.type || 'ARTICLE'}</Badge>
                {item.categorySlug && (
                  <Badge variant="secondary" className="text-[11px] flex items-center gap-1">
                    <Layers className="h-3 w-3" /> {item.categorySlug}
                  </Badge>
                )}
                {item.articleType && (
                  <Badge variant="outline" className="text-[11px]">Type: {item.articleType}</Badge>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    <span>{item.tags.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content view body */}
            <div className="border-t border-border/60 pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {item.type === 'COURSE' ? 'Course Overview Content' : 'Article Body Content Preview'}
              </div>

              {item.body ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none p-3.5 rounded bg-muted/20 border border-border/40 max-h-72 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
                />
              ) : (
                <div className="p-4 text-center text-xs text-muted-foreground italic bg-muted/10 rounded">
                  No body content provided in this item.
                </div>
              )}
            </div>

            {/* Course Sections & Lessons Tree preview */}
            {item.type === 'COURSE' && item.sections && item.sections.length > 0 && (
              <div className="border-t border-border/60 pt-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Course Sections & Lessons Structure ({item.sections.length} Section{item.sections.length !== 1 ? 's' : ''})
                </div>
                <div className="space-y-2">
                  {item.sections.map((sec, sIdx) => (
                    <div key={sIdx} className="p-2.5 rounded border border-border/60 bg-muted/10 space-y-1 text-xs">
                      <div className="font-semibold text-foreground flex items-center justify-between">
                        <span>Section {sIdx + 1}: {sec.title}</span>
                        <span className="text-[10px] text-muted-foreground">{sec.lessons?.length || 0} lessons</span>
                      </div>
                      {sec.lessons && sec.lessons.length > 0 && (
                        <div className="pl-3 space-y-1 border-l-2 border-primary/30 mt-1">
                          {sec.lessons.map((les, lIdx) => (
                            <div key={lIdx} className="text-muted-foreground">
                              <span className="font-medium text-foreground">• {les.title}</span>
                              {les.type && <span className="text-[10px] ml-1.5 text-muted-foreground/70">({les.type})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
