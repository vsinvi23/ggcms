import React from 'react';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks } from '@/lib/htmlParser';

interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/**
 * Compute a word-level diff between two strings using Myers diff algorithm.
 * Returns an array of segments tagged as equal, inserted, or deleted.
 */
function wordDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);

  const lcs = computeLCS(oldWords, newWords);
  const segments: DiffSegment[] = [];

  let oi = 0;
  let ni = 0;
  let li = 0;

  while (li < lcs.length || oi < oldWords.length || ni < newWords.length) {
    // Emit deletions from old before next common token
    while (oi < oldWords.length && (li >= lcs.length || oldWords[oi] !== lcs[li])) {
      segments.push({ type: 'delete', text: oldWords[oi] });
      oi++;
    }
    // Emit insertions from new before next common token
    while (ni < newWords.length && (li >= lcs.length || newWords[ni] !== lcs[li])) {
      segments.push({ type: 'insert', text: newWords[ni] });
      ni++;
    }
    // Emit the common token
    if (li < lcs.length) {
      segments.push({ type: 'equal', text: lcs[li] });
      oi++;
      ni++;
      li++;
    }
  }

  return mergeAdjacentSegments(segments);
}

/** Split text into word+whitespace tokens so whitespace is preserved */
function tokenize(text: string): string[] {
  if (!text) return [];
  // Split on whitespace boundaries, keeping whitespace as separate tokens
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Classic LCS on string arrays */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  // Use 1D DP for memory efficiency (only need current and previous row)
  const dp: number[] = new Array(n + 1).fill(0);

  // Build length table
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  // Backtrack to extract LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (table[i - 1][j] > table[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  void dp;
  return lcs;
}

/** Merge consecutive segments of the same type for cleaner rendering */
function mergeAdjacentSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// ─── Public Component ────────────────────────────────────────────────────────

interface DiffTextProps {
  oldText: string;
  newText: string;
  className?: string;
}

/**
 * Renders an inline word-level diff between two plain text strings.
 * Deleted words appear in red with strikethrough; inserted words appear in green.
 */
export function DiffText({ oldText, newText, className }: DiffTextProps) {
  const segments = wordDiff(oldText, newText);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return <span key={i}>{seg.text}</span>;
        }
        if (seg.type === 'delete') {
          return (
            <span
              key={i}
              className="bg-red-100 text-red-700 line-through"
              title="Removed"
            >
              {seg.text}
            </span>
          );
        }
        // insert
        return (
          <span
            key={i}
            className="bg-green-100 text-green-700"
            title="Added"
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}

interface DiffViewerProps {
  /** Label shown above the diff (e.g. "Title", "Description") */
  label: string;
  oldValue: string | null | undefined;
  newValue: string | null | undefined;
}

/**
 * Labelled diff block for a single field.
 * Skips rendering when old and new are identical.
 */
export function DiffField({ label, oldValue, newValue }: DiffViewerProps) {
  const old = oldValue ?? '';
  const current = newValue ?? '';

  if (old === current) return null;

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="rounded border border-border bg-muted/30 p-2 text-sm leading-relaxed">
        <DiffText oldText={old} newText={current} />
      </div>
    </div>
  );
}

export default DiffText;

// ─── Block-level content diff ────────────────────────────────────────────────

type BlockEntry =
  | { kind: 'equal'; block: ContentBlock }
  | { kind: 'insert'; block: ContentBlock }
  | { kind: 'delete'; block: ContentBlock }
  | { kind: 'change'; oldBlock: ContentBlock; newBlock: ContentBlock };

function blockTextKey(b: ContentBlock): string {
  if (b.type === 'code') return b.codeData?.code ?? '';
  if (b.type === 'image') return b.imageUrl ?? '';
  if (b.listItems) return b.listItems.join('\n');
  if (b.type === 'divider') return '---';
  return b.content ?? '';
}

function diffBlocks(oldBlocks: ContentBlock[], newBlocks: ContentBlock[]): BlockEntry[] {
  const oldKeys = oldBlocks.map(b => `${b.type}::${blockTextKey(b)}`);
  const newKeys = newBlocks.map(b => `${b.type}::${blockTextKey(b)}`);
  const lcs = computeLCS(oldKeys, newKeys);

  const raw: Array<{ kind: 'delete' | 'insert'; block: ContentBlock }> = [];
  const result: BlockEntry[] = [];
  let oi = 0, ni = 0, li = 0;

  while (li < lcs.length || oi < oldBlocks.length || ni < newBlocks.length) {
    while (oi < oldBlocks.length && (li >= lcs.length || oldKeys[oi] !== lcs[li])) {
      raw.push({ kind: 'delete', block: oldBlocks[oi++] });
    }
    while (ni < newBlocks.length && (li >= lcs.length || newKeys[ni] !== lcs[li])) {
      raw.push({ kind: 'insert', block: newBlocks[ni++] });
    }
    // Flush raw — pair adjacent delete+insert of same type as change
    let ri = 0;
    while (ri < raw.length) {
      if (ri + 1 < raw.length && raw[ri].kind === 'delete' && raw[ri + 1].kind === 'insert' &&
          raw[ri].block.type === raw[ri + 1].block.type) {
        result.push({ kind: 'change', oldBlock: raw[ri].block, newBlock: raw[ri + 1].block });
        ri += 2;
      } else {
        result.push(raw[ri].kind === 'delete'
          ? { kind: 'delete', block: raw[ri].block }
          : { kind: 'insert', block: raw[ri].block });
        ri++;
      }
    }
    raw.length = 0;

    if (li < lcs.length) {
      result.push({ kind: 'equal', block: newBlocks[ni] });
      oi++; ni++; li++;
    }
  }
  return result;
}

function BlockRenderer({ block, className }: { block: ContentBlock; className?: string }) {
  const cls = `text-sm ${className ?? ''}`;
  if (block.type === 'heading1') return <h1 className={`text-xl font-bold ${cls}`}>{block.content}</h1>;
  if (block.type === 'heading2') return <h2 className={`text-lg font-semibold ${cls}`}>{block.content}</h2>;
  if (block.type === 'heading3') return <h3 className={`text-base font-medium ${cls}`}>{block.content}</h3>;
  if (block.type === 'quote') return <blockquote className={`border-l-4 border-muted pl-3 italic ${cls}`}>{block.content}</blockquote>;
  if (block.type === 'code') return (
    <pre className={`rounded bg-muted p-2 font-mono text-xs overflow-x-auto ${cls}`}>
      <code>{block.codeData?.code}</code>
    </pre>
  );
  if (block.type === 'image') return (
    <div className={`flex items-center gap-2 text-muted-foreground ${cls}`}>
      <span className="text-xs">[image: {block.imageAlt || block.imageUrl}]</span>
    </div>
  );
  if (block.type === 'list') return (
    <ul className={`list-disc pl-5 ${cls}`}>
      {(block.listItems ?? []).map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
  if (block.type === 'ordered-list') return (
    <ol className={`list-decimal pl-5 ${cls}`}>
      {(block.listItems ?? []).map((item, i) => <li key={i}>{item}</li>)}
    </ol>
  );
  if (block.type === 'divider') return <hr className="my-1" />;
  return <p className={cls}>{block.content}</p>;
}

/**
 * Renders a visual block-level diff between two stored body strings.
 * Added blocks have a green left border; removed blocks have a red left border
 * with strikethrough; modified blocks show an inline word-level diff.
 */
export function ContentBlockDiff({ oldBody, newBody }: { oldBody: string; newBody: string }) {
  const oldBlocks = React.useMemo(() => parseBodyToBlocks(oldBody), [oldBody]);
  const newBlocks = React.useMemo(() => parseBodyToBlocks(newBody), [newBody]);
  const entries = React.useMemo(() => diffBlocks(oldBlocks, newBlocks), [oldBlocks, newBlocks]);

  if (entries.every(e => e.kind === 'equal')) {
    return <p className="text-sm text-muted-foreground italic py-2">Body content is unchanged.</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        if (entry.kind === 'equal') {
          return <div key={i} className="py-0.5 opacity-60"><BlockRenderer block={entry.block} /></div>;
        }
        if (entry.kind === 'insert') {
          return (
            <div key={i} className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20 pl-3 py-1 rounded-r">
              <BlockRenderer block={entry.block} className="text-green-800 dark:text-green-200" />
            </div>
          );
        }
        if (entry.kind === 'delete') {
          return (
            <div key={i} className="border-l-4 border-red-400 bg-red-50 dark:bg-red-950/20 pl-3 py-1 rounded-r opacity-80">
              <BlockRenderer block={entry.block} className="text-red-700 dark:text-red-300 line-through" />
            </div>
          );
        }
        // change — show inline word diff
        const oldText = blockTextKey(entry.oldBlock);
        const newText = blockTextKey(entry.newBlock);
        return (
          <div key={i} className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20 pl-3 py-1 rounded-r">
            <p className="text-sm leading-relaxed"><DiffText oldText={oldText} newText={newText} /></p>
          </div>
        );
      })}
    </div>
  );
}
