import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { sanitizeHtml } from '@/lib/sanitize';

const DEFAULT_MERMAID_SOURCE = 'graph TD\n  A[Start] --> B[End]';

let mermaidInitPromise: Promise<typeof import('mermaid').default> | null = null;

function getMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
      return mermaid;
    });
  }
  return mermaidInitPromise;
}

// Mermaid can embed a <style> block inside its SVG for theming — DOMPurify's allowlist
// isn't parent-scoped, so we strip it rather than widen sanitize.ts to allow <style> globally.
function stripEmbeddedStyle(svg: string): string {
  return svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

function MermaidNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const source: string = node.attrs.source || '';
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;
    if (!source.trim()) {
      setSvg('');
      setError(null);
      return;
    }
    getMermaid()
      .then(async (mermaid) => {
        await mermaid.parse(source);
        const { svg: rendered } = await mermaid.render(idRef.current, source);
        if (!cancelled) {
          setSvg(stripEmbeddedStyle(rendered));
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid diagram syntax');
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <NodeViewWrapper className="my-4 rounded-lg border border-border overflow-hidden" data-drag-handle>
      {editor.isEditable && (
        <Textarea
          value={source}
          onChange={(e) => updateAttributes({ source: e.target.value })}
          placeholder="Enter Mermaid diagram syntax..."
          className="font-mono text-sm rounded-none border-0 border-b resize-none min-h-[100px]"
        />
      )}
      <div className="p-4 bg-muted/30 flex items-center justify-center min-h-[80px]">
        {error ? (
          <p className="text-sm text-destructive">Mermaid error: {error}</p>
        ) : svg ? (
          <div
            className="max-w-full overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(svg) }}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">Enter diagram syntax above to render.</p>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const MermaidNode = Node.create({
  name: 'mermaidDiagram',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      source: { default: DEFAULT_MERMAID_SOURCE },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-mermaid-source]',
        getAttrs: (el) => ({ source: (el as HTMLElement).getAttribute('data-mermaid-source') || '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { 'data-mermaid-source': node.attrs.source }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
