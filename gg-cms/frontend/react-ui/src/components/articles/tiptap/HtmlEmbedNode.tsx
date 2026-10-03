import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Textarea } from '@/components/ui/textarea';
import { sanitizeHtml } from '@/lib/sanitize';

function HtmlEmbedNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const html: string = node.attrs.html || '';

  return (
    <NodeViewWrapper className="my-4 rounded-lg border border-border overflow-hidden" data-drag-handle>
      {editor.isEditable && (
        <Textarea
          value={html}
          onChange={(e) => updateAttributes({ html: e.target.value })}
          placeholder="Enter HTML markup..."
          className="font-mono text-sm rounded-none border-0 border-b resize-none min-h-[100px]"
        />
      )}
      <div className="p-4 bg-muted/30">
        {html.trim() ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
        ) : (
          <p className="text-sm text-muted-foreground italic">Enter HTML above to preview. Only safe, sanitized markup is rendered — scripts and iframes are stripped.</p>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const HtmlEmbedNode = Node.create({
  name: 'htmlEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      html: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-html-embed]',
        getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute('data-html-embed') || '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { 'data-html-embed': node.attrs.html }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlEmbedNodeView);
  },
});
