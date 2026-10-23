import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analyticsService';
import type { DateRange } from '../types';

const STALE = 60_000;

export const useAnalyticsDashboard = (enabled = true) =>
  useQuery({
    queryKey: ['analytics', 'dashboard'] as const,
    queryFn: () => analyticsService.getDashboard(),
    staleTime: STALE,
    enabled,
  });

export const useAnalyticsOverview = (range: DateRange, enabled = true) =>
  useQuery({
    queryKey: ['analytics', 'overview', range] as const,
    queryFn: () => analyticsService.getOverview(range),
    staleTime: STALE,
    enabled,
  });

export const useAnalyticsContent = (range: DateRange) =>
  useQuery({
    queryKey: ['analytics', 'content', range] as const,
    queryFn: () => analyticsService.getContent(range),
    staleTime: STALE,
  });

export const useAnalyticsSearch = (range: DateRange) =>
  useQuery({
    queryKey: ['analytics', 'search', range] as const,
    queryFn: () => analyticsService.getSearch(range),
    staleTime: STALE,
  });

export const useAnalyticsFunnel = (range: DateRange) =>
  useQuery({
    queryKey: ['analytics', 'funnel', range] as const,
    queryFn: () => analyticsService.getFunnel(range),
    staleTime: STALE,
  });

export const useAnalyticsCohorts = (weeks = 8) =>
  useQuery({
    queryKey: ['analytics', 'cohorts', weeks] as const,
    queryFn: () => analyticsService.getCohorts(weeks),
    staleTime: STALE,
  });

export const useAnalyticsRecommendations = (range: DateRange) =>
  useQuery({
    queryKey: ['analytics', 'recommendations', range] as const,
    queryFn: () => analyticsService.getRecommendations(range),
    staleTime: STALE,
  });

export const useUserEngagement = (page: number, size = 20) =>
  useQuery({
    queryKey: ['analytics', 'engagement', page, size] as const,
    queryFn: () => analyticsService.getUserEngagement(page, size),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
