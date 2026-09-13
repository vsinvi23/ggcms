import { describe, it, expect } from 'vitest';
import { markdownToContentBlocks, parseBodyToBlocks } from './htmlParser';

describe('markdownToContentBlocks', () => {
  it('parses headings of all three levels', () => {
    const blocks = markdownToContentBlocks('# Title\n\n## Subtitle\n\n### Sub-subtitle');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'heading1', content: 'Title' }),
      expect.objectContaining({ type: 'heading2', content: 'Subtitle' }),
      expect.objectContaining({ type: 'heading3', content: 'Sub-subtitle' }),
    ]);
  });

  it('parses a paragraph', () => {
    const blocks = markdownToContentBlocks('Just a plain paragraph of text.');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'paragraph', content: 'Just a plain paragraph of text.' }),
    ]);
  });

  it('merges consecutive lines into a single paragraph, separated by blank lines', () => {
    const blocks = markdownToContentBlocks('Line one\nLine two\n\nSecond paragraph.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', content: 'Line one\nLine two' });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', content: 'Second paragraph.' });
  });

  it('parses a fenced code block with a language', () => {
    const blocks = markdownToContentBlocks('```go\nfunc main() {}\n```');
    expect(blocks).toEqual([
      expect.objectContaining({
        type: 'code',
        codeData: { language: 'go', code: 'func main() {}', filename: '' },
      }),
    ]);
  });

  it('defaults fenced code block language to plaintext when omitted', () => {
    const blocks = markdownToContentBlocks('```\nsome text\n```');
    expect(blocks[0]).toMatchObject({ type: 'code', codeData: { language: 'plaintext', code: 'some text' } });
  });

  it('parses a blockquote', () => {
    const blocks = markdownToContentBlocks('> First line\n> Second line');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'quote', content: 'First line\nSecond line' }),
    ]);
  });

  it('parses an unordered list', () => {
    const blocks = markdownToContentBlocks('- Item one\n- Item two\n* Item three');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'list', listItems: ['Item one', 'Item two', 'Item three'] }),
    ]);
  });

  it('parses an ordered list', () => {
    const blocks = markdownToContentBlocks('1. First\n2. Second');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'ordered-list', listItems: ['First', 'Second'] }),
    ]);
  });

  it('splits into separate blocks when list type changes', () => {
    const blocks = markdownToContentBlocks('- Unordered item\n1. Ordered item');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'list', listItems: ['Unordered item'] }),
      expect.objectContaining({ type: 'ordered-list', listItems: ['Ordered item'] }),
    ]);
  });

  it('parses a divider', () => {
    const blocks = markdownToContentBlocks('Above\n\n---\n\nBelow');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'paragraph', content: 'Above' }),
      expect.objectContaining({ type: 'divider' }),
      expect.objectContaining({ type: 'paragraph', content: 'Below' }),
    ]);
  });

  it('parses an image', () => {
    const blocks = markdownToContentBlocks('![alt text](https://example.com/img.png)');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'image', imageUrl: 'https://example.com/img.png', imageAlt: 'alt text' }),
    ]);
  });

  it('assigns a non-empty unique id to every block', () => {
    const blocks = markdownToContentBlocks('# Heading\n\nParagraph text');
    const ids = blocks.map((b) => b.id);
    expect(ids.every((id) => !!id)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty array for empty input', () => {
    expect(markdownToContentBlocks('')).toEqual([]);
  });
});

describe('parseBodyToBlocks', () => {
  it('parses a JSON block array regardless of sourceFormat hint', () => {
    const json = JSON.stringify([{ id: 'x', type: 'paragraph', content: 'hello' }]);
    expect(parseBodyToBlocks(json)).toEqual([{ id: 'x', type: 'paragraph', content: 'hello' }]);
    expect(parseBodyToBlocks(json, 'markdown')).toEqual([{ id: 'x', type: 'paragraph', content: 'hello' }]);
  });

  it('fills in a missing id on JSON blocks', () => {
    const json = JSON.stringify([{ type: 'paragraph', content: 'hello' }]);
    const blocks = parseBodyToBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBeTruthy();
    expect(blocks[0].content).toBe('hello');
  });

  it('dispatches to markdownToContentBlocks when sourceFormat is markdown', () => {
    const blocks = parseBodyToBlocks('## A heading\n\nA paragraph.', 'markdown');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'heading2', content: 'A heading' }),
      expect.objectContaining({ type: 'paragraph', content: 'A paragraph.' }),
    ]);
  });

  it('falls back to legacy HTML parsing when sourceFormat is omitted', () => {
    const blocks = parseBodyToBlocks('<h1>Title</h1><p>Body text</p>');
    expect(blocks).toEqual([
      expect.objectContaining({ type: 'heading1', content: 'Title' }),
      expect.objectContaining({ type: 'paragraph', content: 'Body text' }),
    ]);
  });

  it('falls back to legacy HTML parsing when sourceFormat is html', () => {
    const blocks = parseBodyToBlocks('<p>Body text</p>', 'html');
    expect(blocks).toEqual([expect.objectContaining({ type: 'paragraph', content: 'Body text' })]);
  });

  it('returns an empty array for empty body', () => {
    expect(parseBodyToBlocks('')).toEqual([]);
    expect(parseBodyToBlocks('   ')).toEqual([]);
  });
});
