# ADR-008: Browser-Native HTML Sanitizer

**Status:** Accepted  
**Date:** June 2026

## Context

The security review identified that all 10 `dangerouslySetInnerHTML` calls in article/course
rendering pages had no XSS protection. User-generated HTML content (article bodies, lesson
content) is stored in the database and rendered directly, creating a stored-XSS vector.

The standard solution is DOMPurify, but `npm install dompurify` fails in this environment
due to a corporate proxy blocking `registry.npmjs.org`.

## Decision

Implement a browser-native HTML sanitizer in `src/lib/sanitize.ts` that:
1. Parses HTML via `DOMParser.parseFromString(html, 'text/html')` into a detached document
2. Removes `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<base>` etc. entirely
3. Strips all `on*` event handler attributes globally
4. Walks the DOM removing elements not in an explicit ALLOWED_TAGS set
5. Removes attributes not in ALLOWED_ATTRS
6. Blocks `javascript:`, `data:`, `vbscript:` URL schemes in `href`/`src`
7. Returns `''` on any parse failure

The file documents the DOMPurify upgrade path for when the network restriction is lifted.

## Consequences

**Positive:**
- Zero npm dependencies — works in air-gapped or proxy-restricted environments
- Same `sanitizeHtml(html): string` signature — trivial to swap for DOMPurify later
- Blocks the full class of stored-XSS via content injection
- TypeScript clean (no missing type declarations)

**Negative:**
- DOMPurify has been fuzz-tested against edge cases (malformed HTML, SVG vectors,
  mXSS) that the native implementation may not cover exhaustively
- Must be maintained if new bypass techniques are discovered

**Upgrade path** (when DOMPurify becomes installable):
```bash
npm install dompurify @types/dompurify
```
Then replace the body of `sanitize.ts` — the export signature stays identical.

## Alternatives Considered

- **DOMPurify** — preferred but blocked by corporate proxy at time of fix
- **Sanitize HTML string with regex** — rejected; regex cannot safely parse HTML
- **Server-side sanitization only** — rejected; defence-in-depth requires client-side too
