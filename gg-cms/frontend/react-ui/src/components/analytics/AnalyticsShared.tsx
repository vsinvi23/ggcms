import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { DateRange } from '@/api/types';
import { downloadCsv, isValidRange, rangeFromDays, toCsv, type Column } from '@/lib/analyticsHelpers';

const PRESETS = [7, 30, 90];

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Date range">
      <div className="flex gap-1">
        {PRESETS.map((d) => (
          <Button key={d} type="button" size="sm" variant="outline" onClick={() => onChange(rangeFromDays(d))}>
            Last {d} days
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="range-from" className="text-xs">From</Label>
        <Input id="range-from" type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-8 w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="range-to" className="text-xs">To</Label>
        <Input id="range-to" type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-8 w-40" />
      </div>
      {!isValidRange(value) && (
        <p role="alert" className="text-xs text-destructive">Choose a valid range of at most 366 days.</p>
      )}
    </div>
  );
}

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}

export function QueryState({ isLoading, isError, isEmpty, emptyText = 'No data for this period.', onRetry, children }: QueryStateProps) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError) {
    return (
      <div role="alert" className="py-6 text-center text-sm text-destructive">
        Could not load this report.
        {onRetry && (
          <Button variant="link" size="sm" onClick={onRetry}>Retry</Button>
        )}
      </div>
    );
  }
  if (isEmpty) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return <>{children}</>;
}

export function StatTile({ label, value, loading, hint }: { label: string; value: ReactNode; loading?: boolean; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{value}</div>}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

interface DataTableProps<T> {
  title: string;
  description?: string;
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  filename: string;
  emptyText?: string;
  children?: ReactNode;
}

export function DataTable<T>({ title, description, caption, columns, rows, rowKey, filename, emptyText = 'No rows for this period.', children }: DataTableProps<T>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(filename, toCsv(columns, rows))}
          aria-label={`Export ${title} as CSV`}
        >
          <Download className="mr-1 h-3 w-3" aria-hidden="true" />
          CSV
        </Button>
      </CardHeader>
      <CardContent>
        {children}
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {columns.map((c) => (
                    <th key={c.header} scope="col" className={`px-2 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={rowKey(r)} className="border-b last:border-0">
                    {columns.map((c) => (
                      <td key={c.header} className={`px-2 py-2 tabular-nums ${c.align === 'right' ? 'text-right' : ''}`}>{c.cell(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
