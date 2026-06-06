import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Article, SeoSettings, Attachment } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import { SeoSettingsPanel } from './SeoSettingsPanel';
import { PublishScheduler } from './PublishScheduler';
import { WorkflowStatusBar } from '@/components/shared/WorkflowStatusBar';
import { ReviewActionsPanel } from '@/components/shared/ReviewActionsPanel';
import {
  Save,
  FileText,
  Search,
  Calendar,
  Paperclip,
  X,
  Eye,
} from 'lucide-react';

interface ArticleEditorProps {
  article: Article;
  onSave: (article: Article) => void;
  onPreview?: () => void;
  onWorkflowAction?: (action: string, comment?: string) => void;
  className?: string;
}

export function ArticleEditor({
  article,
  onSave,
  onPreview,
  onWorkflowAction,
  className,
}: ArticleEditorProps) {
  const [editedArticle, setEditedArticle] = useState<Article>(article);
  const [newTag, setNewTag] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = <K extends keyof Article>(key: K, value: Article[K]) => {
    setEditedArticle((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSeoChange = (seo: SeoSettings) => {
    handleChange('seo', seo);
  };

  const handleScheduleChange = (date: string | undefined) => {
    handleChange('scheduledPublishDate', date);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editedArticle.tags.includes(newTag.trim())) {
      handleChange('tags', [...editedArticle.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleChange('tags', editedArticle.tags.filter((t) => t !== tag));
  };

  const handleUpload = (files: File[]) => {
    const newAttachments: Attachment[] = files.map((file) => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type,
      size: file.size,
    }));
    handleChange('attachments', [...editedArticle.attachments, ...newAttachments]);
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    handleChange(
      'attachments',
      editedArticle.attachments.filter((a) => a.id !== attachmentId)
    );
  };

  const handleSave = () => {
    onSave(editedArticle);
    setIsDirty(false);
  };

  const generateSlug = () => {
    const slug = editedArticle.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    handleChange('slug', slug);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-semibold">
          {article.id ? 'Edit Article' : 'Create Article'}
        </h2>
        <div className="flex gap-2">
          {onPreview && (
            <Button variant="outline" onClick={onPreview}>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          )}
          <Button onClick={handleSave} disabled={!isDirty}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Workflow Status */}
      <Card>
        <CardContent className="pt-6">
          <WorkflowStatusBar currentStatus={editedArticle.status} />
          {onWorkflowAction && (
            <div className="mt-4 pt-4 border-t border-border">
              <ReviewActionsPanel
                currentStatus={editedArticle.status}
                onAction={onWorkflowAction}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Editor */}
      <Tabs defaultValue="content" className="w-full">
        <TabsList>
          <TabsTrigger value="content">
            <FileText className="w-4 h-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="seo">
            <Search className="w-4 h-4 mr-2" />
            SEO
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <Paperclip className="w-4 h-4 mr-2" />
            Attachments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editedArticle.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Article title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6"
                  onClick={generateSlug}
                >
                  Generate
                </Button>
              </Label>
              <Input
                id="slug"
                value={editedArticle.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                placeholder="article-url-slug"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={editedArticle.excerpt}
                onChange={(e) => handleChange('excerpt', e.target.value)}
                placeholder="Brief summary of the article"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={editedArticle.content}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Article content (supports HTML/Markdown)"
                rows={15}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="secondary" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {editedArticle.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="mt-4">
          <SeoSettingsPanel
            seo={editedArticle.seo}
            onChange={handleSeoChange}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <PublishScheduler
            scheduledDate={editedArticle.scheduledPublishDate}
            onChange={handleScheduleChange}
          />
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentUploader
                attachments={editedArticle.attachments}
                onUpload={handleUpload}
                onRemove={handleRemoveAttachment}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
