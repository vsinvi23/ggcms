import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExtension from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { MermaidNode } from './MermaidNode';
import { HtmlEmbedNode } from './HtmlEmbedNode';

const lowlight = createLowlight(common);

export const tiptapExtensions = [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [1, 2, 3, 4] },
  }),
  Underline,
  Placeholder.configure({ placeholder: 'Start writing your article…' }),
  Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  ImageExtension.configure({ inline: false, allowBase64: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  CodeBlockLowlight.configure({ lowlight }),
  MermaidNode,
  HtmlEmbedNode,
];
