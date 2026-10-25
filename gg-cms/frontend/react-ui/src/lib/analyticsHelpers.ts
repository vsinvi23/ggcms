import type { DateRange } from '@/api/types';

export const VIZ_CSS = `
.viz-root{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-grid:#e1e0d9;--viz-axis:#898781;
--seq-250:#86b6ef;--seq-300:#6da7ec;--seq-400:#3987e5;--seq-500:#256abf;--seq-600:#184f95;--seq-700:#0d366b;}
.dark .viz-root{--viz-1:#3987e5;--viz-2:#d95926;--viz-grid:#2c2c2a;--viz-axis:#898781;}
`;

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const rangeFromDays = (days: number, now = new Date()): DateRange => ({
  from: iso(new Date(now.getTime() - (days - 1) * DAY_MS)),
  to: iso(now),
});

export const isValidRange = (r: DateRange): boolean => {
  const f = Date.parse(r.from);
  const t = Date.parse(r.to);
  return !Number.isNaN(f) && !Number.isNaN(t) && f <= t && (t - f) / DAY_MS <= 365;
};


export const fmtNum = (n: number | undefined | null): string => (n ?? 0).toLocaleString();
export const fmtPct = (ratio: number | undefined | null): string => `${Math.round((ratio ?? 0) * 1000) / 10}%`;
export const fmtSeconds = (s: number | undefined | null): string => {
  const v = Math.round(s ?? 0);
  return v >= 60 ? `${Math.floor(v / 60)}m ${v % 60}s` : `${v}s`;
};

export interface Column<T> {
  header: string;
  cell: (row: T) => string | number;
  align?: 'right';
}

const csvCell = (v: string | number): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = <T,>(columns: Column<T>[], rows: T[]): string =>
  [columns.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.cell(r))).join(','))].join('\n');

export const downloadCsv = (filename: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

