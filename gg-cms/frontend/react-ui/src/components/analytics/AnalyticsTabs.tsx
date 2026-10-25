import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAnalyticsCohorts,
  useAnalyticsContent,
  useAnalyticsFunnel,
  useAnalyticsOverview,
  useAnalyticsRecommendations,
  useAnalyticsSearch,
  useUserEngagement,
} from '@/api/hooks/useAnalytics';
import type {
  AnalyticsContentRow,
  AnalyticsSearchRow,
  AnalyticsTimelinePoint,
  DateRange,
  UserEngagementRow,
} from '@/api/types';
import { DataTable, QueryState, StatTile } from './AnalyticsShared';
import { VIZ_CSS, fmtNum, fmtPct, fmtSeconds, type Column } from '@/lib/analyticsHelpers';

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

function TimelineChart({ title, data, series }: {
  title: string;
  data: AnalyticsTimelinePoint[];
  series: { key: keyof AnalyticsTimelinePoint; name: string; color: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>The same numbers are listed in the table below.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="viz-root h-[240px]" role="img" aria-label={`${title}: line chart by day`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ range }: { range: DateRange }) {
  const q = useAnalyticsOverview(range);
  const d = q.data;
  const timeline = d?.timeline ?? [];
  const columns: Column<AnalyticsTimelinePoint>[] = [
    { header: 'Day', cell: (r) => r.day },
    { header: 'Active users', cell: (r) => r.activeUsers, align: 'right' },
    { header: 'Visitors', cell: (r) => r.visitors, align: 'right' },
    { header: 'Page views', cell: (r) => r.pageViews, align: 'right' },
    { header: 'New users', cell: (r) => r.newUsers, align: 'right' },
    { header: 'Enrollments', cell: (r) => r.enrollments, align: 'right' },
    { header: 'Completions', cell: (r) => r.completions, align: 'right' },
  ];
  return (
    <div className="space-y-4">
      <style>{VIZ_CSS}</style>
      <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => q.refetch()}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatTile label="DAU" value={fmtNum(d?.dau)} hint="Active users, last day" />
          <StatTile label="WAU" value={fmtNum(d?.wau)} hint="Last 7 days" />
          <StatTile label="MAU" value={fmtNum(d?.mau)} hint="Last 30 days" />
          <StatTile label="New users" value={fmtNum(d?.totals.newUsers)} />
          <StatTile label="Enrollments" value={fmtNum(d?.totals.enrollments)} />
          <StatTile label="Completions" value={fmtNum(d?.totals.completions)} />
        </div>
        {timeline.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity in this period.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TimelineChart
                title="Active users and visitors"
                data={timeline}
                series={[
                  { key: 'activeUsers', name: 'Active users', color: 'var(--viz-1)' },
                  { key: 'visitors', name: 'Visitors', color: 'var(--viz-2)' },
                ]}
              />
              <TimelineChart
                title="Enrollments and completions"
                data={timeline}
                series={[
                  { key: 'enrollments', name: 'Enrollments', color: 'var(--viz-1)' },
                  { key: 'completions', name: 'Completions', color: 'var(--viz-2)' },
                ]}
              />
            </div>
            <DataTable
              title="Daily timeline"
              caption="Daily active users, visitors, page views, signups, enrollments and completions"
              columns={columns}
              rows={timeline}
              rowKey={(r) => r.day}
              filename={`analytics-overview-${range.from}_${range.to}.csv`}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}

const contentColumns: Column<AnalyticsContentRow>[] = [
  { header: 'Title', cell: (r) => r.title || `${r.contentType} #${r.contentId}` },
  { header: 'Type', cell: (r) => r.contentType },
  { header: 'Views', cell: (r) => r.views, align: 'right' },
  { header: 'Unique readers', cell: (r) => r.uniqueReaders, align: 'right' },
  { header: 'Avg read time', cell: (r) => fmtSeconds(r.avgReadSeconds), align: 'right' },
  { header: 'Completion rate', cell: (r) => fmtPct(r.completionRate), align: 'right' },
  { header: 'Trend (7d vs prior)', cell: (r) => `${r.trendPct > 0 ? '+' : ''}${Math.round(r.trendPct)}%`, align: 'right' },
];

export function ContentTab({ range }: { range: DateRange }) {
  const q = useAnalyticsContent(range);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => q.refetch()}>
      <div className="space-y-4">
        <DataTable
          title="Top content"
          caption="Most viewed content"
          columns={contentColumns}
          rows={q.data?.top ?? []}
          rowKey={(r) => `${r.contentType}-${r.contentId}`}
          filename={`analytics-top-content-${range.from}_${range.to}.csv`}
        />
        <DataTable
          title="Trending"
          description="Last 7 days compared with the 7 days before."
          caption="Trending content"
          columns={contentColumns}
          rows={q.data?.trending ?? []}
          rowKey={(r) => `${r.contentType}-${r.contentId}`}
          filename={`analytics-trending-${range.from}_${range.to}.csv`}
        />
        <DataTable
          title="Stale content"
          description="Published, not updated for 180 days, fewest views first."
          caption="Stale content"
          columns={[
            { header: 'Title', cell: (r) => r.title || `${r.contentType} #${r.contentId}` },
            { header: 'Type', cell: (r) => r.contentType },
            { header: 'Views', cell: (r) => r.views, align: 'right' },
            { header: 'Last updated', cell: (r) => (r.updatedAt ? r.updatedAt.slice(0, 10) : '') },
          ]}
          rows={q.data?.stale ?? []}
          rowKey={(r) => `${r.contentType}-${r.contentId}`}
          filename={`analytics-stale-${range.from}_${range.to}.csv`}
          emptyText="No stale content."
        />
      </div>
    </QueryState>
  );
}

const searchColumns: Column<AnalyticsSearchRow>[] = [
  { header: 'Query', cell: (r) => r.queryText ?? `(hidden) ${r.queryHash.slice(0, 8)}` },
  { header: 'Searches', cell: (r) => r.count, align: 'right' },
  { header: 'Zero-result searches', cell: (r) => r.zeroResultCount, align: 'right' },
  { header: 'Avg results', cell: (r) => Math.round(r.avgResults * 10) / 10, align: 'right' },
];

export function SearchTab({ range }: { range: DateRange }) {
  const q = useAnalyticsSearch(range);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => q.refetch()}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total searches" value={fmtNum(q.data?.totalSearches)} />
          <StatTile label="Zero-result rate" value={fmtPct(q.data?.zeroResultRate)} />
        </div>
        <DataTable title="Top queries" caption="Most frequent search queries" columns={searchColumns} rows={q.data?.top ?? []} rowKey={(r) => r.queryHash} filename={`analytics-search-top-${range.from}_${range.to}.csv`} />
        <DataTable title="Zero-result queries" description="Searches that found nothing: content gaps." caption="Queries without results" columns={searchColumns} rows={q.data?.zeroResults ?? []} rowKey={(r) => r.queryHash} filename={`analytics-search-zero-${range.from}_${range.to}.csv`} />
      </div>
    </QueryState>
  );
}

const FUNNEL_LABELS = { visit: 'Visit', signup: 'Sign up', enroll: 'Enroll', complete: 'Complete' } as const;
const FUNNEL_COLORS = ['var(--seq-250)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)'];

export function FunnelTab({ range }: { range: DateRange }) {
  const q = useAnalyticsFunnel(range);
  const steps = q.data?.steps ?? [];
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} isEmpty={steps.length === 0} onRetry={() => q.refetch()}>
      <div className="space-y-4">
        <style>{VIZ_CSS}</style>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visit to completion</CardTitle>
            {q.data?.note && <CardDescription>{q.data.note}</CardDescription>}
          </CardHeader>
          <CardContent className="viz-root space-y-3">
            {steps.map((s, i) => (
              <div key={s.step} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm">{FUNNEL_LABELS[s.step]}</span>
                <div className="h-7 flex-1 rounded bg-muted">
                  <div
                    className="h-7 rounded-r"
                    style={{ width: `${Math.max(2, (s.count / max) * 100)}%`, backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-sm tabular-nums">
                  {fmtNum(s.count)}{i > 0 && ` (${fmtPct(s.conversionFromPrevious)})`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <DataTable
          title="Funnel table"
          caption="Funnel steps with conversion from the previous step"
          columns={[
            { header: 'Step', cell: (r) => FUNNEL_LABELS[r.step] },
            { header: 'Count', cell: (r) => r.count, align: 'right' },
            { header: 'Conversion from previous', cell: (r) => fmtPct(r.conversionFromPrevious), align: 'right' },
          ]}
          rows={steps}
          rowKey={(r) => r.step}
          filename={`analytics-funnel-${range.from}_${range.to}.csv`}
        />
      </div>
    </QueryState>
  );
}

export function CohortsTab() {
  const [weeks, setWeeks] = useState(8);
  const q = useAnalyticsCohorts(weeks);
  const cohorts = q.data?.cohorts ?? [];
  const maxCols = Math.max(0, ...cohorts.map((c) => c.retention.length));
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} isEmpty={cohorts.length === 0} emptyText="No signup cohorts yet." onRetry={() => q.refetch()}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Retention by signup week</CardTitle>
            <CardDescription>Share of each cohort with any logged-in activity in week N after signup.</CardDescription>
          </div>
          <div className="flex gap-1">
            {[8, 12, 26].map((w) => (
              <Button key={w} size="sm" variant={w === weeks ? 'default' : 'outline'} onClick={() => setWeeks(w)} aria-pressed={w === weeks}>
                {w}w
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="viz-root overflow-x-auto">
          <style>{VIZ_CSS}</style>
          <table className="w-full border-separate border-spacing-0.5 text-xs">
            <caption className="sr-only">Cohort retention percentages by week since signup</caption>
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-medium">Cohort</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Size</th>
                {Array.from({ length: maxCols }, (_, i) => (
                  <th key={i} scope="col" className="px-2 py-1 text-center font-medium">W{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortWeek}>
                  <th scope="row" className="px-2 py-1 text-left font-normal">{c.cohortWeek}</th>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtNum(c.size)}</td>
                  {Array.from({ length: maxCols }, (_, i) => {
                    const v = c.retention[i];
                    if (v === undefined) return <td key={i} />;
                    return (
                      <td
                        key={i}
                        className="rounded px-2 py-1 text-center tabular-nums"
                        style={{
                          backgroundColor: `rgba(37,106,191,${Math.max(0.08, Math.min(1, v))})`,
                          color: v > 0.5 ? '#ffffff' : undefined,
                        }}
                      >
                        {Math.round(v * 100)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </QueryState>
  );
}

export function RecommendationsTab({ range }: { range: DateRange }) {
  const q = useAnalyticsRecommendations(range);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => q.refetch()}>
      <DataTable
        title="Recommendation performance"
        description={q.data?.note ?? 'Click-through and completion by recommendation surface.'}
        caption="Recommendation impressions, clicks and completions by surface"
        columns={[
          { header: 'Surface', cell: (r) => r.recId },
          { header: 'Impressions', cell: (r) => r.impressions, align: 'right' },
          { header: 'Clicks', cell: (r) => r.clicks, align: 'right' },
          { header: 'CTR', cell: (r) => fmtPct(r.ctr), align: 'right' },
          { header: 'Completions', cell: (r) => r.completions, align: 'right' },
          { header: 'Completion rate', cell: (r) => fmtPct(r.completionRate), align: 'right' },
        ]}
        rows={q.data?.rows ?? []}
        rowKey={(r) => r.recId}
        filename={`analytics-recommendations-${range.from}_${range.to}.csv`}
        emptyText="No recommendation activity in this period."
      />
    </QueryState>
  );
}

const engagementColumns: Column<UserEngagementRow>[] = [
  { header: 'User', cell: (r) => r.name || r.email },
  { header: 'Email', cell: (r) => r.email },
  { header: 'Score', cell: (r) => r.score, align: 'right' },
  { header: 'Level', cell: (r) => r.level },
  { header: 'Churn risk', cell: (r) => (r.atRisk ? `${r.churnRisk} (at risk)` : r.churnRisk) },
  { header: 'Active days (30d)', cell: (r) => r.activeDays30d, align: 'right' },
  { header: 'Reads (30d)', cell: (r) => r.reads30d, align: 'right' },
  { header: 'Lessons (30d)', cell: (r) => r.lessonsCompleted30d, align: 'right' },
  { header: 'Last active', cell: (r) => (r.lastActiveAt ? r.lastActiveAt.slice(0, 10) : 'never') },
];

export function EngagementTab() {
  const [page, setPage] = useState(0);
  const q = useUserEngagement(page);
  const total = q.data?.total ?? 0;
  const size = q.data?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => q.refetch()}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the score works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Engagement score (0-100, last 30 days) = 40 x min(active days / 12, 1) + 20 x min(reads / 15, 1) +
              20 x min(lessons completed / 8, 1) + 10 for any enrollment + 10 for a completed course.
              Levels: high 70+, medium 40+, low 15+, otherwise dormant.
            </p>
            <p>
              Churn risk: accounts under 7 days old are new. Idle 30+ days is high; idle 14+ days is high with an
              active enrollment, otherwise medium; idle 7+ days is medium with an active enrollment, otherwise low.
              Users at high or medium risk are flagged at risk.
            </p>
          </CardContent>
        </Card>
        <DataTable
          title="User engagement"
          description="Sorted by score within the page."
          caption="Per-user engagement score and churn risk"
          columns={engagementColumns}
          rows={q.data?.items ?? []}
          rowKey={(r) => String(r.userId)}
          filename={`analytics-engagement-page-${page + 1}.csv`}
          emptyText="No users yet."
        />
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <span aria-live="polite">Page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </QueryState>
  );
}
