import apiClient from '../client';
import type {
  AnalyticsCohortsDto,
  AnalyticsContentDto,
  AnalyticsDashboardDto,
  AnalyticsFunnelDto,
  AnalyticsOverviewDto,
  AnalyticsRecommendationsDto,
  AnalyticsSearchDto,
  DateRange,
  TopContentDto,
  UserEngagementPage,
} from '../types';

interface RawTopContent {
  _id?: { content_id?: string; content_type?: string };
  content_id?: string;
  content_type?: string;
  contentId?: string | number;
  contentType?: string;
  views?: number;
  title?: string;
  slug?: string;
}

const unwrap = <T>(body: { data?: T } | T): T => ((body as { data?: T })?.data ?? body) as T;

export const analyticsService = {
  getDashboard: async (): Promise<AnalyticsDashboardDto> => {
    const res = await apiClient.get('/analytics/dashboard');
    const data = res.data?.data ?? res.data ?? {};
    const topContent: TopContentDto[] = ((data.top_content ?? data.topContent ?? []) as RawTopContent[]).map((t) => ({
      contentId: String(t.contentId ?? t._id?.content_id ?? t.content_id ?? ''),
      contentType: t.contentType ?? t._id?.content_type ?? t.content_type ?? '',
      views: t.views ?? 0,
      title: t.title,
      slug: t.slug,
    }));
    return { pageViews30d: Number(data.page_views_30d ?? data.pageViews30d ?? 0), topContent };
  },

  getOverview: async (range: DateRange): Promise<AnalyticsOverviewDto> =>
    unwrap((await apiClient.get('/analytics/overview', { params: range })).data),

  getContent: async (range: DateRange, limit = 10): Promise<AnalyticsContentDto> =>
    unwrap((await apiClient.get('/analytics/content', { params: { ...range, limit } })).data),

  getSearch: async (range: DateRange, limit = 10): Promise<AnalyticsSearchDto> =>
    unwrap((await apiClient.get('/analytics/search', { params: { ...range, limit } })).data),

  getFunnel: async (range: DateRange): Promise<AnalyticsFunnelDto> =>
    unwrap((await apiClient.get('/analytics/funnel', { params: range })).data),

  getCohorts: async (weeks = 8): Promise<AnalyticsCohortsDto> =>
    unwrap((await apiClient.get('/analytics/cohorts', { params: { weeks } })).data),

  getRecommendations: async (range: DateRange): Promise<AnalyticsRecommendationsDto> =>
    unwrap((await apiClient.get('/analytics/recommendations', { params: range })).data),

  getUserEngagement: async (page = 0, size = 20): Promise<UserEngagementPage> =>
    unwrap((await apiClient.get('/analytics/users/engagement', { params: { page, size } })).data),
};
