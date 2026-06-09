import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ContentBlock, ContentBlockType } from '@/types/content';
import {
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Quote,
  Image,
  AlignLeft,
  Plus,
  Trash2,
  GripVertical,
  Copy,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface RichContentEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'bash', label: 'Bash/Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'docker', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'plaintext', label: 'Plain Text' },
];

const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph', icon: AlignLeft },
  { value: 'heading1', label: 'Heading 1', icon: Heading1 },
  { value: 'heading2', label: 'Heading 2', icon: Heading2 },
  { value: 'heading3', label: 'Heading 3', icon: Heading3 },
  { value: 'code', label: 'Code Block', icon: Code },
  { value: 'quote', label: 'Quote', icon: Quote },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'list', label: 'Bullet List', icon: List },
  { value: 'ordered-list', label: 'Numbered List', icon: ListOrdered },
  { value: 'divider', label: 'Divider', icon: GripVertical },
];

export function RichContentEditor({ blocks, onChange }: RichContentEditorProps) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const generateId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addBlock = (type: ContentBlockType, afterId?: string) => {
    const newBlock: ContentBlock = {
      id: generateId(),
      type,
      content: '',
      ...(type === 'code' && {
        codeData: { language: 'javascript', code: '', filename: '' },
      }),
      ...(type === 'list' || type === 'ordered-list' ? { listItems: [''] } : {}),
    };

    if (afterId) {
      const index = blocks.findIndex((b) => b.id === afterId);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange(newBlocks);
    } else {
      onChange([...blocks, newBlock]);
    }
    setActiveBlockId(newBlock.id);
  };

  const updateBlock = (id: string, updates: Partial<ContentBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const deleteBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    setActiveBlockId(null);
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex((b) => b.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === blocks.length - 1)
    ) {
      return;
    }
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    onChange(newBlocks);
  };

  const duplicateBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id);
    if (block) {
      const newBlock = { ...block, id: generateId() };
      const index = blocks.findIndex((b) => b.id === id);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange(newBlocks);
    }
  };

  const updateListItem = (blockId: string, index: number, value: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (block?.listItems) {
      const newItems = [...block.listItems];
      newItems[index] = value;
      updateBlock(blockId, { listItems: newItems });
    }
  };

  const addListItem = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (block?.listItems) {
      updateBlock(blockId, { listItems: [...block.listItems, ''] });
    }
  };

  const removeListItem = (blockId: string, index: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (block?.listItems && block.listItems.length > 1) {
      updateBlock(blockId, { listItems: block.listItems.filter((_, i) => i !== index) });
    }
  };

  const renderBlockEditor = (block: ContentBlock) => {
    const isActive = activeBlockId === block.id;

    return (
      <div
        key={block.id}
        className={`group relative border rounded-lg transition-all ${
          isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
        }`}
        onClick={() => setActiveBlockId(block.id)}
      >
        {/* Block Controls */}
        <div className="absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              moveBlock(block.id, 'up');
            }}
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              moveBlock(block.id, 'down');
            }}
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>

        <div className="p-4">
          {/* Block Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {BLOCK_TYPES.find((t) => t.value === block.type)?.label}
              </Badge>
              {block.type === 'code' && block.codeData && (
                <Badge variant="secondary" className="text-xs">
                  {SUPPORTED_LANGUAGES.find((l) => l.value === block.codeData?.language)?.label}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateBlock(block.id);
                }}
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBlock(block.id);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Block Content */}
          {block.type === 'paragraph' && (
            <Textarea
              value={block.content}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              placeholder="Enter paragraph text..."
              className="min-h-[100px] resize-none"
            />
          )}

          {(block.type === 'heading1' || block.type === 'heading2' || block.type === 'heading3') && (
            <Input
              value={block.content}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              placeholder={`Enter ${block.type.replace('heading', 'Heading ')} text...`}
              className={
                block.type === 'heading1'
                  ? 'text-2xl font-bold'
                  : block.type === 'heading2'
                  ? 'text-xl font-semibold'
                  : 'text-lg font-medium'
              }
            />
          )}

          {block.type === 'code' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Select
                  value={block.codeData?.language}
                  onValueChange={(value) =>
                    updateBlock(block.id, {
                      codeData: { ...block.codeData!, language: value },
                    })
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border max-h-[300px]">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={block.codeData?.filename || ''}
                  onChange={(e) =>
                    updateBlock(block.id, {
                      codeData: { ...block.codeData!, filename: e.target.value },
                    })
                  }
                  placeholder="Filename (optional)"
                  className="flex-1"
                />
              </div>
              <Textarea
                value={block.codeData?.code || ''}
                onChange={(e) =>
                  updateBlock(block.id, {
                    codeData: { ...block.codeData!, code: e.target.value },
                  })
                }
                placeholder="// Enter your code here..."
                className="min-h-[200px] font-mono text-sm bg-muted/50 resize-none"
              />
            </div>
          )}

          {block.type === 'quote' && (
            <div className="border-l-4 border-primary pl-4">
              <Textarea
                value={block.content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                placeholder="Enter quote text..."
                className="min-h-[80px] italic resize-none bg-transparent border-0 focus-visible:ring-0"
              />
            </div>
          )}

          {block.type === 'image' && (
            <div className="space-y-3">
              <Input
                value={block.imageUrl || ''}
                onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                placeholder="Enter image URL..."
              />
              <Input
                value={block.imageAlt || ''}
                onChange={(e) => updateBlock(block.id, { imageAlt: e.target.value })}
                placeholder="Alt text for accessibility..."
              />
              {block.imageUrl && (
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={block.imageUrl}
                    alt={block.imageAlt || 'Content image'}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {(block.type === 'list' || block.type === 'ordered-list') && (
            <div className="space-y-2">
              {block.listItems?.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-6">
                    {block.type === 'list' ? '•' : `${index + 1}.`}
                  </span>
                  <Input
                    value={item}
                    onChange={(e) => updateListItem(block.id, index, e.target.value)}
                    placeholder="List item..."
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeListItem(block.id, index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addListItem(block.id)}
                className="mt-2"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </Button>
            </div>
          )}

          {block.type === 'divider' && (
            <div className="py-4">
              <Separator />
            </div>
          )}
        </div>

        {/* Add Block Button */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Select onValueChange={(value) => addBlock(value as ContentBlockType, block.id)}>
            <SelectTrigger className="h-6 w-6 p-0 border-0 bg-primary text-primary-foreground rounded-full shadow-lg">
              <Plus className="w-4 h-4" />
            </SelectTrigger>
            <SelectContent className="bg-background border">
              {BLOCK_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center gap-2">
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-2">Add Block:</span>
            {BLOCK_TYPES.map((type) => (
              <Button
                key={type.value}
                variant="outline"
                size="sm"
                onClick={() => addBlock(type.value as ContentBlockType)}
                className="gap-1.5"
              >
                <type.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{type.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Blocks */}
      <div className="space-y-6 pl-12">
        {blocks.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">No content blocks yet.</p>
            <Select onValueChange={(value) => addBlock(value as ContentBlockType)}>
              <SelectTrigger className="w-[200px] mx-auto">
                <SelectValue placeholder="Add your first block" />
              </SelectTrigger>
              <SelectContent className="bg-background border">
                {BLOCK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          blocks.map(renderBlockEditor)
        )}
      </div>
    </div>
  );
}