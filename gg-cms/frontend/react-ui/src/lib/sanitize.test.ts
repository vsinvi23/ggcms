import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('keeps allowlisted tags and attributes', () => {
    expect(sanitizeHtml('<p class="foo">Hello</p>')).toBe('<p class="foo">Hello</p>');
  });

  it('strips script tags', () => {
    expect(sanitizeHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>');
  });

  it('strips event handler attributes', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('strips disallowed tags but keeps their text content', () => {
    expect(sanitizeHtml('<iframe>bad</iframe><p>good</p>')).toBe('<p>good</p>');
  });

  it('removes non-allowlisted attributes', () => {
    expect(sanitizeHtml('<p data-foo="bar">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('blocks javascript: URLs in href', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">Click</a>')).toBe('<a>Click</a>');
  });

  it('blocks data: URLs in src', () => {
    expect(sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">')).toBe('<img>');
  });

  it('restricts the class attribute to a safe pattern', () => {
    expect(sanitizeHtml('<p class="foo-bar baz">Hi</p>')).toBe('<p class="foo-bar baz">Hi</p>');
    expect(sanitizeHtml('<p class="foo\\" onmouseover=\\"alert(1)">Hi</p>')).toBe('<p>Hi</p>');
  });
});
