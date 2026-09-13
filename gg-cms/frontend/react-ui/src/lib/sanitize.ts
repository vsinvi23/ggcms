import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','p','br','ul','ol','li',
  'strong','em','b','i','a','blockquote','code','pre',
  'img','figure','figcaption',
  'table','thead','tbody','tr','th','td',
  'hr','span','div','section','article',
];

const ALLOWED_ATTR = [
  'href','src','alt','class','title','target','rel',
  'width','height','colspan','rowspan',
];

const SAFE_CLASS_PATTERN = /^[a-zA-Z0-9 -]*$/;

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'class' && !SAFE_CLASS_PATTERN.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

/**
 * Sanitize an HTML string for safe use with dangerouslySetInnerHTML.
 * Strips script tags, event handlers, javascript:/data: URL schemes, and all
 * non-allowlisted elements and attributes.
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, FORCE_BODY: true });
};
