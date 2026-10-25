import { describe, expect, it } from 'vitest';
import { sanitizeMarkHtml } from './sanitize';

describe('sanitizeMarkHtml', () => {
  it('keeps <mark> and strips scripts and event handlers', () => {
    const out = sanitizeMarkHtml('a <mark>b</mark><script>alert(1)</script><img src=x onerror="alert(2)"><b onclick="x()">c</b>');
    expect(out).toContain('<mark>b</mark>');
    expect(out).not.toMatch(/script|onerror|onclick|<img|<b/i);
  });

  it('drops attributes on mark and handles empty input', () => {
    expect(sanitizeMarkHtml('<mark class="x" onmouseover="y()">z</mark>')).toBe('<mark>z</mark>');
    expect(sanitizeMarkHtml(undefined)).toBe('');
  });
});
