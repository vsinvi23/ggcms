import { useQuery } from '@tanstack/react-query';
import { publicCmsService, PublicCmsQueryParams, publicLearningPathService } from '../services/publicCmsService';

// Query keys for public CMS
export const publicCmsKeys = {
  all: ['public-cms'] as const,
  list: (params?: PublicCmsQueryParams) => [...publicCmsKeys.all, 'list', params] as const,
  detail: (id: string | number) => [...publicCmsKeys.all, String(id)] as const,
  body: (id: string | number) => [...publicCmsKeys.all, String(id), 'body'] as const,
};

/**
 * Hook to fetch paginated PUBLISHED CMS items (no auth required)
 */
export const usePublicCmsList = (params?: PublicCmsQueryParams) => {
  return useQuery({
    queryKey: publicCmsKeys.list(params),
    queryFn: () => publicCmsService.getAll(params),
  });
};

/**
 * Hook to fetch a single PUBLISHED CMS item by publicId (UUID) or numeric id.
 * Pass preview=true to allow fetching non-published items.
 */
export const usePublicCmsById = (id: string | number, enabled = true, preview = false, type: 'ARTICLE' | 'COURSE' = 'ARTICLE') => {
  const hasId = typeof id === 'string' ? id.length > 0 : id > 0;
  return useQuery({
    queryKey: [...publicCmsKeys.detail(id), { preview, type }],
    queryFn: () => publicCmsService.getById(id, type, preview),
    enabled: enabled && hasId,
  });
};

/**
 * Hook to fetch body HTML content for a published CMS item
 */
export const usePublicCmsBody = (id: string | number, enabled = true, preview = false, type: 'ARTICLE' | 'COURSE' = 'ARTICLE') => {
  const hasId = typeof id === 'string' ? id.length > 0 : id > 0;
  return useQuery({
    queryKey: [...publicCmsKeys.body(id), { preview, type }],
    queryFn: () => publicCmsService.getBody(id, type, preview),
    enabled: enabled && hasId,
  });
};

/**
 * Hook to fetch published articles for a category slug
 */
export const usePublicArticlesByCategory = (slug: string, params?: { page?: number; size?: number }) => {
  return useQuery({
    queryKey: [...publicCmsKeys.all, 'articles', 'category', slug, params] as const,
    queryFn: () => publicCmsService.getArticlesByCategory(slug, params),
    enabled: !!slug,
  });
};

/**
 * Hook to fetch published courses for a category slug
 */
export const usePublicCoursesByCategory = (slug: string, params?: { page?: number; size?: number }) => {
  return useQuery({
    queryKey: [...publicCmsKeys.all, 'courses', 'category', slug, params] as const,
    queryFn: () => publicCmsService.getCoursesByCategory(slug, params),
    enabled: !!slug,
  });
};

export const usePublicLearningPaths = () =>
  useQuery({
    queryKey: [...publicCmsKeys.all, 'learning-paths'] as const,
    queryFn: publicLearningPathService.getAll,
    staleTime: 5 * 60_000,
  });

export const usePublicLearningPathById = (id: number | string) =>
  useQuery({
    queryKey: [...publicCmsKeys.all, 'learning-paths', String(id)] as const,
    queryFn: () => publicLearningPathService.getById(id),
    enabled: !!id,
  });
