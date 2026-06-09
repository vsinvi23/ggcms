import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmsService, mediaService, CmsQueryParams } from '../services/cmsService';
import { CmsCreateDto, CmsUpdateDto, CmsSubmitRequest, CmsApproveRequest, CmsPublishRequest, CmsSendBackRequest, CmsType } from '../types';
import { taskKeys } from './useTasks';

// Query keys
export const cmsKeys = {
  all: ['cms'] as const,
  list: (params?: CmsQueryParams) => [...cmsKeys.all, 'list', params] as const,
  detail: (id: number) => [...cmsKeys.all, id] as const,
  body: (id: number) => [...cmsKeys.all, id, 'body'] as const,
  activity: (id: number, type: CmsType) => [...cmsKeys.all, id, type, 'activity'] as const,
  bySlug: (slug: string, type: CmsType) => [...cmsKeys.all, 'slug', slug, type] as const,
};

/**
 * Hook to fetch paginated CMS items
 */
export const useCmsList = (params?: CmsQueryParams) => {
  return useQuery({
    queryKey: cmsKeys.list(params),
    queryFn: () => cmsService.getAll(params),
    // Don't cache stale search results
    staleTime: params?.search ? 0 : 60_000,
  });
};

/**
 * Hook to fetch a single CMS item by numeric ID
 */
export const useCmsById = (id: number, enabled = true, type: CmsType = 'ARTICLE') => {
  return useQuery({
    queryKey: [...cmsKeys.detail(id), type],
    queryFn: () => cmsService.getById(id, type),
    enabled: enabled && id > 0,
  });
};

/**
 * Hook to fetch a single CMS item by slug.
 * Used by edit/review routes which now use human-readable slugs instead of UUIDs.
 */
export const useCmsBySlug = (slug: string | undefined, enabled = true, type: CmsType = 'ARTICLE') => {
  return useQuery({
    queryKey: slug ? cmsKeys.bySlug(slug, type) : cmsKeys.all,
    queryFn: () => cmsService.getBySlug(slug!, type),
    enabled: enabled && !!slug,
  });
};

/**
 * Hook to create a new CMS item
 */
export const useCreateCms = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CmsCreateDto) => cmsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

/**
 * Hook to update CMS metadata
 */
export const useUpdateCms = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CmsUpdateDto }) => 
      cmsService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

/**
 * Hook to delete a CMS item
 */
export const useDeleteCms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type }: { id: number; type?: CmsType }) =>
      cmsService.delete(id, type ?? 'ARTICLE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

// ============================================
// BODY CONTENT HOOKS
// ============================================

/**
 * Hook to upload body content (HTML) to a CMS item
 */
export const useUploadCmsBody = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, content, type }: { id: number; content: string | File; type?: 'ARTICLE' | 'COURSE' }) =>
      cmsService.uploadBody(id, content, type),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.body(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

/**
 * Hook to download body content (HTML) from a CMS item
 */
export const useDownloadCmsBody = (id: number, enabled = false, type: 'ARTICLE' | 'COURSE' = 'ARTICLE') => {
  return useQuery({
    queryKey: [...cmsKeys.body(id), type],
    queryFn: () => cmsService.downloadBody(id, type),
    enabled: enabled && id > 0,
  });
};

// ============================================
// CONTENT/ATTACHMENT HOOKS
// ============================================

/**
 * Hook to upload content/attachment to a CMS item
 */
export const useUploadCmsContent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => 
      cmsService.uploadContent(id, file),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

/**
 * Hook to download CMS content
 */
export const useDownloadCmsContent = (id: number, enabled = false) => {
  return useQuery({
    queryKey: [...cmsKeys.detail(id), 'content'],
    queryFn: () => cmsService.downloadContent(id),
    enabled: enabled && id > 0,
  });
};

// ============================================
// THUMBNAIL HOOKS
// ============================================

/**
 * Hook to upload thumbnail to a CMS item
 */
export const useUploadCmsThumbnail = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => 
      cmsService.uploadThumbnail(id, file),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
    },
  });
};

// ============================================
// MEDIA HOOKS (for rich editor)
// ============================================

/**
 * Hook to upload media (image/video) from the rich editor
 */
export const useUploadMedia = () => {
  return useMutation({
    mutationFn: (file: File) => mediaService.upload(file),
  });
};

// ============================================
// WORKFLOW HOOKS
// ============================================

/**
 * Hook to submit CMS for review
 */
export const useSubmitCmsForReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type, data }: { id: number; type?: CmsType; data?: CmsSubmitRequest }) =>
      cmsService.submitForReview(id, type ?? 'ARTICLE', data),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
      // New tasks are created on submit — refresh My Tasks list
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

/**
 * Hook to approve CMS item (reviewer approves before publish)
 */
export const useApproveCms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type, data }: { id: number; type?: CmsType; data?: CmsApproveRequest }) =>
      cmsService.approve(id, type ?? 'ARTICLE', data),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

/**
 * Hook to publish CMS item (admin only)
 */
export const usePublishCms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type, data }: { id: number; type?: CmsType; data?: CmsPublishRequest }) =>
      cmsService.publish(id, type ?? 'ARTICLE', data),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
      // Task status is updated to published — refresh My Tasks list
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

/**
 * Hook to send CMS back to draft
 */
export const useSendCmsBack = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type, data }: { id: number; type?: CmsType; data: CmsSendBackRequest }) =>
      cmsService.sendBack(id, type ?? 'ARTICLE', data),
    onSuccess: (data, { id, type }) => {
      const cmsType = type ?? 'ARTICLE';

      // Seed the slug-keyed detail cache with the full item returned by the backend.
      // This prevents a background GET /api/cms/:slug that could return 404 if the
      // DB is momentarily unavailable (e.g. a migration just ran) or the server restarted.
      if (data?.slug) {
        queryClient.setQueryData(cmsKeys.bySlug(data.slug, cmsType), data);
      }

      // Invalidate other caches that need to reflect the new DRAFT status.
      queryClient.invalidateQueries({ queryKey: [...cmsKeys.detail(id), cmsType] });
      queryClient.invalidateQueries({ queryKey: [...cmsKeys.body(id), cmsType] });
      queryClient.invalidateQueries({ queryKey: [...cmsKeys.all, 'list'] });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, cmsType) });
    },
  });
};

export const useRejectCms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, type, data }: { id: number; type?: CmsType; data: { comment: string; reviewerId?: number } }) =>
      cmsService.reject(id, type ?? 'ARTICLE', data),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
    },
  });
};

export const useAssignReviewer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, type }: { id: number; userId: number; type?: CmsType }) =>
      cmsService.assignReviewer(id, userId, type ?? 'ARTICLE'),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: [...cmsKeys.detail(id), type ?? 'ARTICLE'] });
      queryClient.invalidateQueries({ queryKey: [...cmsKeys.all, 'list'] });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

export const useClaimReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type }: { id: number; type?: CmsType }) =>
      cmsService.claimReview(id, type ?? 'ARTICLE'),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

export const useReassignReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, note }: { id: number; type?: CmsType; note: string }) =>
      cmsService.reassignReview(id, type ?? 'ARTICLE', note),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.all });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
    },
  });
};

export const useSaveReviewNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, note }: { id: number; type?: CmsType; note: string }) =>
      cmsService.saveReviewNote(id, type ?? 'ARTICLE', note),
    onSuccess: (_, { id, type }) => {
      queryClient.invalidateQueries({ queryKey: cmsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: cmsKeys.activity(id, type ?? 'ARTICLE') });
    },
  });
};

// ============================================
// ACTIVITY LOG HOOKS
// ============================================

/**
 * Hook to fetch the workflow event history for a CMS item.
 * Automatically refreshes after workflow actions.
 */
export const useCmsActivity = (id: number, type: CmsType = 'ARTICLE', enabled = true) => {
  return useQuery({
    queryKey: cmsKeys.activity(id, type),
    queryFn: () => cmsService.getActivity(id, type),
    enabled: enabled && id > 0,
    staleTime: 30_000,
  });
};
