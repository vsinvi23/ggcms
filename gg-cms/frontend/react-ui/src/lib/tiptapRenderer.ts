import { parseBodyToHtml } from '@/lib/htmlParser';
import { sanitizeHtml } from '@/lib/sanitize';

/**
 * Renders a stored TipTap JSON document (body string) to HTML for read-only display.
 * data-html-embed nodes are resolved to their sanitized inner HTML immediately (synchronous);
 * data-mermaid-source nodes are left as-is for hydrateMermaidDiagrams() to render after mount.
 * Falls back to the legacy block/HTML parser if the body isn't valid TipTap JSON.
 *
 * Dynamically imports the TipTap/lowlight/highlight.js extension bundle so readers of
 * non-WYSIWYG (blocks/legacy-HTML) content never download it.
 */
export async function renderTipTapDocToHtml(body: string): Promise<string> {
  if (!body || !body.trim()) return '';
  try {
    const doc = JSON.parse(body);
    const [{ generateHTML }, { tiptapExtensions }] = await Promise.all([
      import('@tiptap/html'),
      import('@/components/articles/tiptap/extensions'),
    ]);
    const html = generateHTML(doc, tiptapExtensions);
    return inlineHtmlEmbeds(html);
  } catch {
    return parseBodyToHtml(body);
  }
}

function inlineHtmlEmbeds(html: string): string {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  parsed.body.querySelectorAll<HTMLElement>('[data-html-embed]').forEach((el) => {
    const raw = el.getAttribute('data-html-embed') || '';
    el.removeAttribute('data-html-embed');
    el.innerHTML = sanitizeHtml(raw);
  });
  return parsed.body.innerHTML;
}
