import { sanitizeHtml } from '@/lib/sanitize';

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

function stripEmbeddedStyle(svg: string): string {
  return svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Finds every rendered TipTap Mermaid node (data-mermaid-source) inside a
 * container and replaces its content with a live-rendered, sanitized SVG.
 * Used on read-only pages (PublicArticleView, CourseViewPage) after the
 * article's HTML has been injected via dangerouslySetInnerHTML.
 */
export async function hydrateMermaidDiagrams(container: HTMLElement): Promise<void> {
  const nodes = container.querySelectorAll<HTMLElement>('[data-mermaid-source]');
  if (nodes.length === 0) return;

  const mermaid = await getMermaid();

  await Promise.all(
    Array.from(nodes).map(async (node, index) => {
      const source = node.getAttribute('data-mermaid-source') || '';
      if (!source.trim()) return;
      try {
        await mermaid.parse(source);
        const { svg } = await mermaid.render(`mermaid-read-${index}-${Date.now()}`, source);
        node.innerHTML = sanitizeHtml(stripEmbeddedStyle(svg));
      } catch {
        node.innerHTML = '<p class="text-sm text-destructive">Unable to render diagram.</p>';
      }
    })
  );
}
