/**
 * Word-level diff helper that compares two strings and returns HTML with <ins> and <del> tags.
 */
const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function computeWordDiff(oldRaw: string, newRaw: string): string {
  const oldText = escapeHtml(oldRaw ?? '');
  const newText = escapeHtml(newRaw ?? '');
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
