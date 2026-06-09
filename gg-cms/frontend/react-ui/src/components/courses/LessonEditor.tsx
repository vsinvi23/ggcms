import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Lesson, Attachment } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import {
  Save,
  Clock,
  Tags,
  Video,
  FileText,
  X,
} from 'lucide-react';

interface LessonEditorProps {
  lesson: Lesson;
  onSave: (lesson: Lesson) => void;
  onCancel?: () => void;
  className?: string;
}

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
];

export function LessonEditor({
  lesson,
  onSave,
  onCancel,
  className,
}: LessonEditorProps) {
  const [editedLesson, setEditedLesson] = useState<Lesson>(lesson);
  const [newTag, setNewTag] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = <K extends keyof Lesson>(key: K, value: Lesson[K]) => {
    setEditedLesson((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editedLesson.tags.includes(newTag.trim())) {
      handleChange('tags', [...editedLesson.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleChange('tags', editedLesson.tags.filter((t) => t !== tag));
  };

  const handleUpload = (files: File[]) => {
    const newAttachments: Attachment[] = files.map((file) => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type,
      size: file.size,
    }));
    handleChange('attachments', [...editedLesson.attachments, ...newAttachments]);
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    handleChange(
      'attachments',
      editedLesson.attachments.filter((a) => a.id !== attachmentId)
    );
  };

  const handleSave = () => {
    onSave(editedLesson);
    setIsDirty(false);
  };

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit Lesson</h2>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={!isDirty}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="w-full">
        <TabsList>
          <TabsTrigger value="content">
            <FileText className="w-4 h-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="media">
            <Video className="w-4 h-4 mr-2" />
            Media
          </TabsTrigger>
          <TabsTrigger value="metadata">
            <Tags className="w-4 h-4 mr-2" />
            Metadata
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Lesson Title</Label>
            <Input
              id="title"
              value={editedLesson.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Enter lesson title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={editedLesson.content}
              onChange={(e) => handleChange('content', e.target.value)}
              placeholder="Enter lesson content (supports rich text)"
              rows={15}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Tip: You can use Markdown formatting for rich text.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Video/Media URL</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={editedLesson.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                placeholder="https://example.com/video.mp4"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter a URL to a video or media file for this lesson.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentUploader
                attachments={editedLesson.attachments}
                onUpload={handleUpload}
                onRemove={handleRemoveAttachment}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">
                <Clock className="w-4 h-4 inline mr-1" />
                Duration (minutes)
              </Label>
              <Input
                id="duration"
                type="number"
                value={editedLesson.duration}
                onChange={(e) => handleChange('duration', parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select defaultValue="en">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              />
              <Button type="button" variant="secondary" onClick={handleAddTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {editedLesson.tags.map((tag) => (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
