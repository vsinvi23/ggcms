import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangeFilter } from '@/components/analytics/AnalyticsShared';
import { isValidRange, rangeFromDays } from '@/lib/analyticsHelpers';
import {
  CohortsTab,
  ContentTab,
  EngagementTab,
  FunnelTab,
  OverviewTab,
  RecommendationsTab,
  SearchTab,
} from '@/components/analytics/AnalyticsTabs';

const RANGE_TABS = new Set(['overview', 'content', 'search', 'funnel', 'recommendations']);

export default function Analytics() {
  const [tab, setTab] = useState('overview');
  const [draft, setDraft] = useState(() => rangeFromDays(30));
  const [range, setRange] = useState(draft);

  const changeRange = (r: typeof draft) => {
    setDraft(r);
    if (isValidRange(r)) setRange(r);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">Usage, content performance, search, conversion and retention</p>
        </div>

        {RANGE_TABS.has(tab) && <DateRangeFilter value={draft} onChange={changeRange} />}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="cohorts">Retention</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4"><OverviewTab range={range} /></TabsContent>
          <TabsContent value="content" className="mt-4"><ContentTab range={range} /></TabsContent>
          <TabsContent value="search" className="mt-4"><SearchTab range={range} /></TabsContent>
          <TabsContent value="funnel" className="mt-4"><FunnelTab range={range} /></TabsContent>
          <TabsContent value="cohorts" className="mt-4"><CohortsTab /></TabsContent>
          <TabsContent value="recommendations" className="mt-4"><RecommendationsTab range={range} /></TabsContent>
          <TabsContent value="engagement" className="mt-4"><EngagementTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
