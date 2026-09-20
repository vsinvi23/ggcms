import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GitCompare, Eye, Pencil, FileText, ShieldAlert } from 'lucide-react';
import { parseBodyToHtml } from '@/lib/htmlParser';

export type DiffViewMode = 'diff' | 'draft' | 'published';

interface ContentDiffOverlayProps {
  publishedTitle: string;
  draftTitle: string;
  publishedDescription?: string;
  draftDescription?: string;
  publishedBody: string;
  draftBody: string;
  status: string;
  hasPendingDraft: boolean;
  version?: number;
  publishedVersion?: number;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onStartInlineEdit?: () => void;
  canEdit?: boolean;
}

/**
 * Word-level diff helper that compares two strings and returns HTML with <ins> and <del> tags.
 */
function computeWordDiff(oldText: string, newText: string): string {
  if (!oldText) return `<ins class="diff-ins bg-emerald-500/20 text-emerald-950 dark:text-emerald-200 px-1 py-0.5 rounded border-l-2 border-emerald-500 font-semibold underline decoration-emerald-500">${newText}</ins>`;
  if (!newText) return `<del class="diff-del bg-rose-500/20 text-rose-950 dark:text-rose-200 px-1 py-0.5 rounded line-through decoration-rose-500 opacity-80">${oldText}</del>`;
  if (oldText === newText) return oldText;

  // Split into tokens (words and whitespace)
  const oldTokens = oldText.match(/\S+|\s+/g) || [];
  const newTokens = newText.match(/\S+|\s+/g) || [];

  // Simple Myers/LCS matrix for diff generation
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldTokens[i] === newTokens[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = n;
  let j = m;
  const result: string[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift(oldTokens[i - 1]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift(`<ins class="diff-ins bg-emerald-500/20 text-emerald-950 dark:text-emerald-200 px-1 py-0.5 rounded border-l-2 border-emerald-500 font-semibold underline decoration-emerald-500">${newTokens[j - 1]}</ins>`);
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift(`<del class="diff-del bg-rose-500/20 text-rose-950 dark:text-rose-200 px-1 py-0.5 rounded line-through decoration-rose-500 opacity-80">${oldTokens[i - 1]}</del>`);
      i--;
    }
  }

  return result.join('');
}

/**
 * Strips HTML tags to get raw text for diff comparison.
 */
function stripTags(html: string): string {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function ContentDiffOverlay({
  publishedTitle,
  draftTitle,
  publishedDescription = '',
  draftDescription = '',
  publishedBody,
  draftBody,
  status,
  hasPendingDraft,
  version = 1,
  publishedVersion = 1,
  viewMode,
  onViewModeChange,
  onStartInlineEdit,
  canEdit = false,
}: ContentDiffOverlayProps) {
  const isTitleChanged = publishedTitle !== draftTitle;
  const isDescriptionChanged = (publishedDescription || '') !== (draftDescription || '');
  
  // Format HTML body text for diffing
  const diffHtml = useMemo(() => {
    const oldParsed = parseBodyToHtml(publishedBody || '');
    const newParsed = parseBodyToHtml(draftBody || '');
    
    // Convert to text blocks or diff directly
    const oldText = stripTags(oldParsed);
    const newText = stripTags(newParsed);
    
    if (oldText === newText) {
      return newParsed;
    }
    
    return computeWordDiff(oldText, newText);
  }, [publishedBody, draftBody]);

  const diffTitleHtml = useMemo(() => {
    if (!isTitleChanged) return draftTitle;
    return computeWordDiff(publishedTitle, draftTitle);
  }, [publishedTitle, draftTitle, isTitleChanged]);

  const diffDescriptionHtml = useMemo(() => {
    if (!isDescriptionChanged) return draftDescription;
    return computeWordDiff(publishedDescription || '', draftDescription || '');
  }, [publishedDescription, draftDescription, isDescriptionChanged]);

  if (!hasPendingDraft) return null;

  return (
    <div className="w-full my-4">
      {/* ── Admin Diff Banner Bar ────────────────────────────────────────── */}
      <Card className="bg-slate-900 border-amber-500/40 text-slate-100 p-4 shadow-lg rounded-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Badge className="bg-amber-500 text-slate-950 font-bold px-2.5 py-1 gap-1.5 text-xs">
              <GitCompare className="w-3.5 h-3.5" /> Pending Draft ({status})
            </Badge>
            <span className="text-xs text-slate-300 font-medium">
              Live Version: <strong>v{publishedVersion}</strong> &bull; Pending Version: <strong>v{version}</strong>
            </span>
            <Badge variant="outline" className="border-amber-400/40 text-amber-300 bg-amber-500/10 text-[11px] gap-1">
              <ShieldAlert className="w-3 h-3" /> Privileged Admin Diff View
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Pills */}
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onViewModeChange('diff')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'diff'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <GitCompare className="w-3 h-3" /> Diff Highlight View
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('draft')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'draft'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileText className="w-3 h-3" /> Draft Preview
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('published')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'published'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Eye className="w-3 h-3" /> Public Visitor View
              </button>
            </div>

            {canEdit && onStartInlineEdit && (
              <Button
                size="sm"
                onClick={onStartInlineEdit}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 shadow"
              >
                <Pencil className="w-3.5 h-3.5" />
                Inline Edit Page
              </Button>
            )}
          </div>
        </div>

        {/* Diff Legend (Visible in diff mode) */}
        {viewMode === 'diff' && (
          <div className="pt-2 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Legend:</span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Added Content
            </span>
            <span className="flex items-center gap-1 text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Removed Content
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

export { computeWordDiff };
