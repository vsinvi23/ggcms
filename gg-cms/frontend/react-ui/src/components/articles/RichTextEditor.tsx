import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { tiptapExtensions } from '@/components/articles/tiptap/extensions';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import { mediaService } from '@/api/services/cmsService';
import {
  Bold,
  Italic,
  UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Code,
  Quote,
  List,
  ListOrdered,
  Table as TableIcon,
  Image as ImageIcon,
  Link2,
  Minus,
  GitBranch,
  FileCode,
  Undo2,
  Redo2,
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (json: string) => void;
  editable?: boolean;
}

async function uploadAndInsertImage(
  file: File,
  editor: ReturnType<typeof useEditor>,
  pos?: number
) {
  if (!editor) return;
  if (!file.type.startsWith('image/')) return;

  const blobUrl = URL.createObjectURL(file);
  const insertPos = pos ?? editor.state.selection.from;
  editor
    .chain()
    .insertContentAt(insertPos, { type: 'image', attrs: { src: blobUrl, alt: file.name } })
    .focus()
    .run();

  try {
    const uploaded = await mediaService.upload(file);
    editor.state.doc.descendants((node, nodePos) => {
      if (node.type.name === 'image' && node.attrs.src === blobUrl) {
        editor.chain().command(({ tr }) => {
          tr.setNodeAttribute(nodePos, 'src', uploaded.url);
          return true;
        }).run();
      }
    });
  } catch (err) {
    toast.error('Image upload failed');
    console.error('Image upload failed:', err);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: content ? safeParseJson(content) : '',
    editable,
    onUpdate: ({ editor: e }) => {
      onChange(JSON.stringify(e.getJSON()));
    },
    editorProps: {
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) {
          uploadAndInsertImage(imageFile, editor);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) {
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          uploadAndInsertImage(imageFile, editor, pos);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && content) {
      const parsed = safeParseJson(content);
      const current = JSON.stringify(editor.getJSON());
      if (JSON.stringify(parsed) !== current) {
        editor.commands.setContent(parsed);
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndInsertImage(file, editor);
    e.target.value = '';
  };

  const insertImageUrl = () => {
    if (!imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageUrl('');
  };

  const insertLink = () => {
    if (!linkUrl.trim()) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    setLinkUrl('');
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-2">
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant={editor.isActive('bold') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('italic') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('underline') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('heading', { level: 3 }) ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('heading', { level: 4 }) ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
              <Heading4 className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant={editor.isActive('blockquote') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('bulletList') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="w-4 h-4" />
            </Button>
            <Button variant={editor.isActive('orderedList') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant={editor.isActive('codeBlock') ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code className="w-4 h-4" />
            </Button>
            {editor.isActive('codeBlock') && (
              <Select
                value={(editor.getAttributes('codeBlock').language as string) || 'plaintext'}
                onValueChange={(value) => editor.chain().focus().updateAttributes('codeBlock', { language: value }).run()}
              >
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent className="bg-background border max-h-[300px]">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <TableIcon className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Upload file</label>
                  <input type="file" accept="image/*" onChange={handleImageFileSelect} className="block w-full text-sm mt-1" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Paste image URL</label>
                  <div className="flex gap-2">
                    <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
                    <Button size="sm" className="h-8" onClick={insertImageUrl}>Add</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant={editor.isActive('link') ? 'default' : 'outline'} size="icon" className="h-8 w-8">
                  <Link2 className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Link URL</label>
                <div className="flex gap-2">
                  <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
                  <Button size="sm" className="h-8" onClick={insertLink}>Add</Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title="Insert Mermaid diagram"
              onClick={() => editor.chain().focus().insertContent({ type: 'mermaidDiagram' }).run()}
            >
              <GitBranch className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title="Insert raw HTML"
              onClick={() => editor.chain().focus().insertContent({ type: 'htmlEmbed' }).run()}
            >
              <FileCode className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-lg p-4 min-h-[300px] prose prose-sm max-w-none dark:prose-invert">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function safeParseJson(content: string): object | string {
  try {
    return JSON.parse(content);
  } catch {
    return '';
  }
}
