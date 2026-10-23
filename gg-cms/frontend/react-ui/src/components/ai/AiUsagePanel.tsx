import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAiUsage } from '@/api/hooks/useAi';
import { AiUsageRow } from '@/api/types';
import { AiErrorNotice } from './AiShared';
import { usd } from './aiFormat';


function UsageTable({ caption, rows, keyLabel }: { caption: string; rows: AiUsageRow[]; keyLabel: string }) {
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{keyLabel}</TableHead>
          <TableHead scope="col" className="text-right">Calls</TableHead>
          <TableHead scope="col" className="text-right">Input tokens</TableHead>
          <TableHead scope="col" className="text-right">Output tokens</TableHead>
          <TableHead scope="col" className="text-right">Cost</TableHead>
          <TableHead scope="col" className="text-right">Avg latency (ms)</TableHead>
          <TableHead scope="col" className="text-right">Errors</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell>{r.key}</TableCell>
            <TableCell className="text-right">{r.calls}</TableCell>
            <TableCell className="text-right">{r.inputTokens}</TableCell>
            <TableCell className="text-right">{r.outputTokens}</TableCell>
            <TableCell className="text-right">{usd(r.costMicroUsd)}</TableCell>
            <TableCell className="text-right">{r.avgLatencyMs}</TableCell>
            <TableCell className="text-right">{r.errors}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CostByDayChart({ rows }: { rows: AiUsageRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...rows.map((r) => r.costMicroUsd));
  const slot = (W - pad.l - pad.r) / Math.max(1, rows.length);
  const bw = Math.min(14, slot * 0.6);
  const label = `Daily AI cost, ${rows.length} days, peak ${usd(max)}`;
  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">Cost per day (USD)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="hsl(var(--border))" />
        {rows.map((r, i) => {
          const h = ((H - pad.t - pad.b) * r.costMicroUsd) / max;
          const x = pad.l + i * slot + (slot - bw) / 2;
          return (
            <g key={r.key} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              <rect x={x} y={H - pad.b - h} width={bw} height={Math.max(h, 1)} rx={2} fill="hsl(var(--primary))" opacity={active === null || active === i ? 1 : 0.5}>
                <title>{`${r.key}: ${usd(r.costMicroUsd)}, ${r.calls} calls`}</title>
              </rect>
            </g>
          );
        })}
        {rows.length > 0 && (
          <>
            <text x={pad.l} y={H - 6} fontSize="10" fill="hsl(var(--muted-foreground))">{rows[0].key}</text>
            <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))">{rows[rows.length - 1].key}</text>
          </>
        )}
      </svg>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {active !== null ? `${rows[active].key}: ${usd(rows[active].costMicroUsd)}` : 'Hover a bar for details. The tables below list every value.'}
      </p>
    </figure>
  );
}

export function AiUsagePanel() {
  const q = useAiUsage();
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <AiErrorNotice error={q.error} />;
  const d = q.data;
  if (!d || d.total.calls === 0) return <p className="text-muted-foreground">No AI usage recorded in the last 30 days.</p>;
  return (
    <div className="space-y-6">
      <p className="text-sm">
        Last 30 days: {d.total.calls} calls, {usd(d.total.costMicroUsd)}, {d.total.inputTokens + d.total.outputTokens} tokens, {d.total.errors} errors.
      </p>
      <CostByDayChart rows={d.byDay} />
      <UsageTable caption="Usage by task" rows={d.byTask} keyLabel="Task" />
      <UsageTable caption="Usage by day" rows={d.byDay} keyLabel="Day" />
      <UsageTable caption="Top users" rows={d.byUser} keyLabel="User" />
    </div>
  );
}
