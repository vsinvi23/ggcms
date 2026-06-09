import { ContentBlock, ContentBlockType } from '@/types/content';

/**
 * Detect whether a body string is JSON blocks or legacy HTML, then return HTML for rendering.
 *
 * New articles are stored as JSON (ContentBlock[]).
 * Legacy articles may be stored as HTML strings.
 */
export function parseBodyToHtml(body: string): string {
  if (!body || !body.trim()) return '';
  const trimmed = body.trim();
  // JSON blocks start with '['
  if (trimmed.startsWith('[')) {
    try {
      const blocks: ContentBlock[] = JSON.parse(trimmed);
      if (Array.isArray(blocks) && blocks.length > 0 && blocks[0]?.type) {
        return contentBlocksToHtml(blocks);
      }
    } catch {
      // not valid JSON — fall through to HTML path
    }
  }
  // Treat as raw HTML (legacy)
  return body;
}

/**
 * Parse a stored body string into ContentBlock[] for the editor.
 *
 * JSON (new) → parse directly (lossless).
 * HTML (legacy) → parse via DOM (best-effort).
 * Empty / unknown → return [].
 */
export function parseBodyToBlocks(body: string): ContentBlock[] {
  if (!body || !body.trim()) return [];
  const trimmed = body.trim();
  if (trimmed.startsWith('[')) {
    try {
      const blocks = JSON.parse(trimmed);
      if (Array.isArray(blocks) && blocks.length > 0 && blocks[0]?.type) {
        // Ensure every block has an id (safety net for very old stored data)
        return blocks.map((b: ContentBlock) => ({
          ...b,
          id: b.id || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        }));
      }
    } catch {
      // fall through to HTML parser
    }
  }
  // Legacy HTML path
  return htmlToContentBlocks(body);
}

/**
 * Parse HTML string back into ContentBlock array
 * This is the reverse of contentBlocksToHtml
 */
export function htmlToContentBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  
  // Create a DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Get all child elements from body
  const elements = doc.body.children;
  
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const block = parseElement(element);
    if (block) {
      blocks.push(block);
    }
  }
  
  return blocks;
}

function generateId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function unescapeHtml(text: string): string {
  const textarea = document.createElement('textarea');
  // Use textContent — never innerHTML — to avoid XSS when decoding HTML entities.
  textarea.textContent = text;
  return textarea.value;
}

function parseElement(element: Element): ContentBlock | null {
  const tagName = element.tagName.toLowerCase();
  
  switch (tagName) {
    case 'h1':
      return {
        id: generateId(),
        type: 'heading1',
        content: unescapeHtml(element.textContent || ''),
      };
      
    case 'h2':
      return {
        id: generateId(),
        type: 'heading2',
        content: unescapeHtml(element.textContent || ''),
      };
      
    case 'h3':
      return {
        id: generateId(),
        type: 'heading3',
        content: unescapeHtml(element.textContent || ''),
      };
      
    case 'p':
      return {
        id: generateId(),
        type: 'paragraph',
        content: unescapeHtml(element.textContent || ''),
      };
      
    case 'blockquote':
      return {
        id: generateId(),
        type: 'quote',
        content: unescapeHtml(element.textContent || ''),
      };
      
    case 'pre': {
      const codeEl = element.querySelector('code');
      const code = codeEl?.textContent || element.textContent || '';
      const languageClass = codeEl?.className || '';
      const languageMatch = languageClass.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : 'plaintext';
      
      return {
        id: generateId(),
        type: 'code',
        content: '',
        codeData: {
          language,
          code: unescapeHtml(code),
          filename: '',
        },
      };
    }
      
    case 'figure': {
      const img = element.querySelector('img');
      const figcaption = element.querySelector('figcaption');
      
      if (img) {
        return {
          id: generateId(),
          type: 'image',
          content: '',
          imageUrl: img.getAttribute('src') || '',
          imageAlt: img.getAttribute('alt') || figcaption?.textContent || '',
        };
      }
      return null;
    }
      
    case 'img':
      return {
        id: generateId(),
        type: 'image',
        content: '',
        imageUrl: element.getAttribute('src') || '',
        imageAlt: element.getAttribute('alt') || '',
      };
      
    case 'ul': {
      const items: string[] = [];
      element.querySelectorAll('li').forEach(li => {
        items.push(unescapeHtml(li.textContent || ''));
      });
      
      return {
        id: generateId(),
        type: 'list',
        content: '',
        listItems: items.length > 0 ? items : [''],
      };
    }
      
    case 'ol': {
      const items: string[] = [];
      element.querySelectorAll('li').forEach(li => {
        items.push(unescapeHtml(li.textContent || ''));
      });
      
      return {
        id: generateId(),
        type: 'ordered-list',
        content: '',
        listItems: items.length > 0 ? items : [''],
      };
    }
      
    case 'hr':
      return {
        id: generateId(),
        type: 'divider',
        content: '',
      };
      
    case 'div': {
      // Check if it's a video container
      const video = element.querySelector('video');
      if (video) {
        const source = video.querySelector('source');
        return {
          id: generateId(),
          type: 'image', // Using image type for video as well (could add video type later)
          content: '',
          imageUrl: source?.getAttribute('src') || video.getAttribute('src') || '',
          imageAlt: 'Video content',
        };
      }
      // For other divs, treat as paragraph with combined text
      if (element.textContent?.trim()) {
        return {
          id: generateId(),
          type: 'paragraph',
          content: unescapeHtml(element.textContent || ''),
        };
      }
      return null;
    }
      
    default:
      // For unknown elements with text content, create a paragraph
      if (element.textContent?.trim()) {
        return {
          id: generateId(),
          type: 'paragraph',
          content: unescapeHtml(element.textContent || ''),
        };
      }
      return null;
  }
}

/**
 * Convert content blocks to HTML string
 */
export function contentBlocksToHtml(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'heading1':
        return `<h1>${escapeHtml(block.content)}</h1>`;
      case 'heading2':
        return `<h2>${escapeHtml(block.content)}</h2>`;
      case 'heading3':
        return `<h3>${escapeHtml(block.content)}</h3>`;
      case 'paragraph':
        return `<p>${escapeHtml(block.content).replace(/\n/g, '<br>')}</p>`;
      case 'quote':
        return `<blockquote><p>${escapeHtml(block.content).replace(/\n/g, '<br>')}</p></blockquote>`;
      case 'code': {
        const lang = block.codeData?.language || 'plaintext';
        const filename = (block.codeData?.filename || '').trim();
        const filenameHtml = filename ? `<span class="code-filename">${escapeHtml(filename)}</span>` : '';
        return `<div class="code-block"><div class="code-block-header"><span class="code-lang">${escapeHtml(lang)}</span>${filenameHtml}</div><pre><code class="language-${lang}">${escapeHtml(block.codeData?.code || '')}</code></pre></div>`;
      }
      case 'image': {
        // Only allow http(s) image URLs — blocks javascript: and data: schemes.
        const rawUrl = block.imageUrl ?? '';
        let safeUrl = '';
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            safeUrl = escapeHtml(rawUrl);
          }
        } catch {
          // relative paths are kept as-is after escaping
          if (rawUrl && !rawUrl.includes(':')) safeUrl = escapeHtml(rawUrl);
        }
        return `<figure><img src="${safeUrl}" alt="${escapeHtml(block.imageAlt || '')}" />${block.imageAlt ? `<figcaption>${escapeHtml(block.imageAlt)}</figcaption>` : ''}</figure>`;
      }
      case 'list':
        return `<ul>${block.listItems?.map(item => `<li>${escapeHtml(item)}</li>`).join('') || ''}</ul>`;
      case 'ordered-list':
        return `<ol>${block.listItems?.map(item => `<li>${escapeHtml(item)}</li>`).join('') || ''}</ol>`;
      case 'divider':
        return '<hr />';
      default:
        return '';
    }
  }).join('\n');
}

/**
 * Strip HTML tags and collapse whitespace — used to get plain-text for diffs.
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
