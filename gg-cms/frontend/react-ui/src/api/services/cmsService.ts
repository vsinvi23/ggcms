import apiClient from '../client';
import { MEDIA_BASE_URL } from '@/config/api';
import {
  CmsType,
  CmsCreateDto,
  CmsUpdateDto,
  CmsResponseDto,
  CmsPagedResponse,
  CmsSubmitRequest,
  CmsApproveRequest,
  CmsPublishRequest,
  CmsSendBackRequest,
  MediaUploadResponse,
  WorkflowEventResponse,
} from '../types';

// Paths are relative to apiClient.baseURL which already includes /api.
// Do NOT add /api here — that would produce a double-prefix like /api/api/cms.
const CMS_BASE = '/cms';

export interface CmsQueryParams {
  page?: number;
  size?: number;
  type?: CmsType;
  status?: string;
  search?: string;
  categoryId?: number;
  courseType?: string;
}

// ─── Transform helper ──────────────────────────────────────────────────────────

/**
 * Maps a raw Strapi CMS entity to the CmsResponseDto shape expected by the UI.
 * Strapi returns flat entity objects (not wrapped in .attributes in v5).
 */
const transformCmsItem = (item: Record<string, unknown>, type?: CmsType): CmsResponseDto => {
  if (!item) return item as unknown as CmsResponseDto;

  const category = item.category as Record<string, unknown> | undefined;
  const author = item.author as Record<string, unknown> | undefined;
  const reviewer = item.reviewer as Record<string, unknown> | undefined;
  const updatedByObj = item.updatedBy as Record<string, unknown> | undefined;

  // Go CMS backend returns thumbnailUrl as a flat field.
  // Strapi (legacy) returns thumbnail as a nested media object.
  const thumbnail = item.thumbnail as Record<string, unknown> | undefined;
  const thumbnailUrlRaw = thumbnail?.url as string | undefined;
  const thumbnailUrl: string | null =
    (item.thumbnailUrl as string | undefined) ??
    (thumbnailUrlRaw
      ? thumbnailUrlRaw.startsWith('http')
        ? thumbnailUrlRaw
        : `${MEDIA_BASE_URL}${thumbnailUrlRaw}`
      : null);

  return {
    id: item.id as number,
    publicId: (item.publicId as string | undefined) ?? undefined,
    slug: (item.slug as string | undefined) ?? undefined,
    type: ((item.type as CmsType | undefined) || type || 'ARTICLE') as CmsType,
    articleType: (item.articleType as string | null | undefined) ?? null,
    courseType: (item.courseType as string | null | undefined) ?? null,
    blockCount: (item.blockCount as number | undefined) ?? 0,
    categoryId: (category?.id as number | undefined) ?? (item.categoryId as number | undefined) ?? null,
    createdBy: (author?.id as number | undefined) ?? (item.createdBy as number | undefined) ?? null,
    createdByName: (author?.name as string | undefined) ?? (item.createdByName as string | undefined) ?? undefined,
    reviewerId: (reviewer?.id as number | undefined) ?? (item.reviewerId as number | undefined) ?? null,
    reviewerName: (reviewer?.name as string | undefined) ?? (reviewer?.username as string | undefined) ?? (item.reviewerName as string | undefined) ?? null,
    reviewerComment: (item.reviewerComment as string | null | undefined) ?? null,
    status: (((item.status as string | undefined) || 'DRAFT').toUpperCase()) as CmsResponseDto['status'],
    title: (item.title as string | null | undefined) ?? null,
    description: (item.description as string | null | undefined) ?? (item.excerpt as string | null | undefined) ?? null,
    body: (item.body as string | null | undefined) ?? (item.content as string | null | undefined) ?? null,
    categoryName: (item.categoryName as string | null | undefined) ?? null,
    // Body/content fields (Go CMS stores body inline)
    bodyLocation: null,
    bodyName: null,
    bodyType: null,
    bodySize: null,
    bodyUrl: null,
    contentLocation: null,
    contentName: null,
    contentType: null,
    contentSize: null,
    contentUrl: null,
    // Thumbnail
    thumbnailLocation: thumbnailUrlRaw ?? (item.thumbnailUrl as string | undefined) ?? null,
    thumbnailName: (thumbnail?.name as string | undefined) ?? null,
    thumbnailType: (thumbnail?.mime as string | undefined) ?? null,
    thumbnailSize: (thumbnail?.size as number | undefined) ?? null,
    thumbnailUrl,
    // Attachments
    attachments: (item.attachments as CmsResponseDto['attachments']) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: (item.updatedAt as string | null | undefined) ?? null,
    publishedAt: (item.publishedAt as string | null | undefined) ?? null,
    version: (item.version as number | undefined) ?? 1,
    updatedBy: (updatedByObj?.id as number | undefined) ?? null,
    hasPendingDraft: (item.hasPendingDraft as boolean | undefined) ?? false,
    publishedVersion: (item.publishedVersion as number | null | undefined) ?? null,
    publishedTitle: (item.publishedTitle as string | null | undefined) ?? null,
    publishedDescription: (item.publishedDescription as string | null | undefined) ?? null,
    publishedBody: (item.publishedBody as string | null | undefined) ?? null,
    reviewBaselineTitle: (item.reviewBaselineTitle as string | null | undefined) ?? null,
    reviewBaselineDescription: (item.reviewBaselineDescription as string | null | undefined) ?? null,
    reviewBaselineBody: (item.reviewBaselineBody as string | null | undefined) ?? null,
    publishedChaptersSnapshot: (item.publishedChaptersSnapshot as string | null | undefined) ?? null,
    reviewBaselineChapters: (item.reviewBaselineChapters as string | null | undefined) ?? null,
  };
};

// ─── CMS service ───────────────────────────────────────────────────────────────

export const cmsService = {
  /**
   * Get paginated list of CMS items.
   * GET /api/cms?type=ARTICLE&page=0&size=10
   * Strapi returns { data: [...], meta: { pagination: {...} } }
   */
  getAll: async (params?: CmsQueryParams): Promise<CmsPagedResponse> => {
    const response = await apiClient.get(CMS_BASE, {
      params: {
        type: params?.type ?? 'ARTICLE',
        page: params?.page ?? 0,
        size: params?.size ?? 10,
        ...(params?.status && { status: params.status }),
        ...(params?.search && { search: params.search }),
        ...(params?.categoryId && { categoryId: params.categoryId }),
        ...(params?.courseType && { courseType: params.courseType }),
      },
    });

    const items: Record<string, unknown>[] = response.data.data ?? [];
    const pagination = response.data.meta?.pagination ?? {};
    const type = params?.type ?? 'ARTICLE';

    return {
      items: items.map((item) => transformCmsItem(item, type)),
      totalElements: pagination.total ?? 0,
      currentPage: (pagination.page ?? 1) - 1,
      pageSize: pagination.pageSize ?? 10,
    };
  },

  /**
   * Get a single CMS item by numeric ID.
   * GET /api/cms/:id?type=ARTICLE
   */
  getById: async (id: number, type: CmsType = 'ARTICLE'): Promise<CmsResponseDto> => {
    const response = await apiClient.get(`${CMS_BASE}/${id}`, {
      params: { type },
    });
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Get a single CMS item by slug.
   * The backend's GetByID handler tries numeric parse first, then falls back to slug lookup.
   */
  getBySlug: async (slug: string, type: CmsType = 'ARTICLE'): Promise<CmsResponseDto> => {
    const response = await apiClient.get(`${CMS_BASE}/${slug}`, {
      params: { type },
    });
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Create a new CMS item.
   * POST /api/cms
   */
  create: async (data: CmsCreateDto): Promise<CmsResponseDto> => {
    const response = await apiClient.post(CMS_BASE, data);
    return transformCmsItem(response.data.data, data.type);
  },

  /**
   * Update a CMS item's metadata.
   * PUT /api/cms/:id?type=ARTICLE
   * Go CMS reads `type` from the query string, not the body.
   */
  update: async (id: number, data: CmsUpdateDto): Promise<CmsResponseDto> => {
    const type = data.type ?? 'ARTICLE';
    const response = await apiClient.put(`${CMS_BASE}/${id}`, data, { params: { type } });
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Delete a CMS item.
   * DELETE /api/cms/:id?type=ARTICLE
   */
  delete: async (id: number, type: CmsType = 'ARTICLE'): Promise<void> => {
    await apiClient.delete(`${CMS_BASE}/${id}`, { params: { type } });
  },

  // ─── Workflow endpoints ──────────────────────────────────────────────────────

  /**
   * Submit a CMS item for review.
   * POST /api/cms/:id/submit?type=ARTICLE
   */
  submitForReview: async (
    id: number,
    type: CmsType = 'ARTICLE',
    data?: CmsSubmitRequest
  ): Promise<CmsResponseDto> => {
    const response = await apiClient.post(
      `${CMS_BASE}/${id}/submit`,
      data ?? {},
      { params: { type } }
    );
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Approve a CMS item (reviewer approves before publish).
   * POST /api/cms/:id/approve?type=ARTICLE
   */
  approve: async (
    id: number,
    type: CmsType = 'ARTICLE',
    data?: CmsApproveRequest
  ): Promise<CmsResponseDto> => {
    const response = await apiClient.post(
      `${CMS_BASE}/${id}/approve`,
      data ?? {},
      { params: { type } }
    );
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Publish a CMS item (admin only).
   * POST /api/cms/:id/publish?type=ARTICLE
   */
  publish: async (
    id: number,
    type: CmsType = 'ARTICLE',
    data?: CmsPublishRequest
  ): Promise<CmsResponseDto> => {
    const response = await apiClient.post(
      `${CMS_BASE}/${id}/publish`,
      data ?? {},
      { params: { type } }
    );
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Send a CMS item back to draft with a reviewer comment.
   * POST /api/cms/:id/send-back?type=ARTICLE
   */
  sendBack: async (
    id: number,
    type: CmsType = 'ARTICLE',
    data: CmsSendBackRequest
  ): Promise<CmsResponseDto> => {
    const response = await apiClient.post(
      `${CMS_BASE}/${id}/send-back`,
      { comment: data.comment },
      { params: { type } }
    );
    return transformCmsItem(response.data.data, type);
  },

  /**
   * Permanently reject a CMS item (no further revision expected).
   * POST /api/cms/:id/reject?type=ARTICLE
   */
  reject: async (
    id: number,
    type: CmsType = 'ARTICLE',
    data: { comment: string; reviewerId?: number }
  ): Promise<void> => {
    await apiClient.post(
      `${CMS_BASE}/${id}/reject`,
      { comment: data.comment },
      { params: { type } }
    );
  },

  /**
   * Claim review — assign the calling user as reviewer.
   * POST /api/cms/:id/claim-review?type=ARTICLE
   */
  claimReview: async (id: number, type: CmsType = 'ARTICLE'): Promise<void> => {
    await apiClient.post(`${CMS_BASE}/${id}/claim-review`, {}, { params: { type } });
  },

  /**
   * Admin assigns a specific user as reviewer (without re-submitting).
   * POST /api/cms/:id/assign-reviewer?type=ARTICLE|COURSE  body: { userId }
   */
  assignReviewer: async (id: number, userId: number, type: CmsType = 'ARTICLE'): Promise<void> => {
    await apiClient.post(`${CMS_BASE}/${id}/assign-reviewer`, { userId }, { params: { type } });
  },

  /**
   * Reassign review — release the reviewer assignment (clear reviewer_id) with a handoff note.
   * POST /api/cms/:id/reassign-review?type=ARTICLE
   */
  reassignReview: async (id: number, type: CmsType = 'ARTICLE', note: string): Promise<void> => {
    await apiClient.post(`${CMS_BASE}/${id}/reassign-review`, { note }, { params: { type } });
  },

  /**
   * Save review note — persist reviewer's draft comment without changing workflow status.
   * POST /api/cms/:id/review-note?type=ARTICLE
   */
  saveReviewNote: async (id: number, type: CmsType = 'ARTICLE', note: string): Promise<void> => {
    await apiClient.post(`${CMS_BASE}/${id}/review-note`, { note }, { params: { type } });
  },

  // ─── Activity log ────────────────────────────────────────────────────────────

  /**
   * Fetch the workflow event history for a CMS item.
   * GET /api/cms/:id/activity?type=ARTICLE
   */
  getActivity: async (id: number, type: CmsType = 'ARTICLE'): Promise<WorkflowEventResponse[]> => {
    const response = await apiClient.get(`${CMS_BASE}/${id}/activity`, { params: { type } });
    const raw: Record<string, unknown>[] = response.data.data ?? response.data ?? [];
    return raw.map((e) => {
      const user = e.user as Record<string, unknown> | undefined;
      return {
        id: e.id as number,
        entityType: (e.entityType as string | undefined) ?? (e.entity_type as string | undefined) ?? '',
        entityId: (e.entityId as number | undefined) ?? (e.entity_id as number | undefined) ?? id,
        userId: (e.userId as number | undefined) ?? (e.user_id as number | undefined) ?? 0,
        userName: (e.userName as string | undefined) ?? (e.user_name as string | undefined) ?? (user?.name as string | undefined) ?? 'Unknown',
        fromStatus: (e.fromStatus as string | undefined) ?? (e.from_status as string | undefined) ?? '',
        toStatus: (e.toStatus as string | undefined) ?? (e.to_status as string | undefined) ?? '',
        action: (e.action as string | undefined) ?? '',
        comment: (e.comment as string | null | undefined) ?? null,
        version: (e.version as number | null | undefined) ?? null,
        titleSnapshot: (e.titleSnapshot as string | undefined) ?? (e.title_snapshot as string | undefined) ?? undefined,
        createdAt: (e.createdAt as string | undefined) ?? (e.created_at as string | undefined) ?? '',
      };
    });
  },

  // ─── Thumbnail helpers ───────────────────────────────────────────────────────

  /**
   * Build an absolute URL for a Strapi-hosted thumbnail.
   * Pass the relative path returned in thumbnailLocation/thumbnailUrl.
   */
  buildMediaUrl: (path: string): string => {
    if (!path) return '';
    return path.startsWith('http') ? path : `${MEDIA_BASE_URL}${path}`;
  },

  // ─── Body content helpers ────────────────────────────────────────────────────

  /**
   * Store HTML body content in the CMS item's body field.
   * PUT /api/cms/:id
   */
  uploadBody: async (id: number, content: string | File, type: CmsType = 'ARTICLE'): Promise<void> => {
    const htmlContent = content instanceof File ? await content.text() : content;
    await cmsService.update(id, { type, body: htmlContent });
  },

  /**
   * Retrieve the HTML body content from the CMS item's body field (falls back to description).
   * GET /api/cms/:id?type=ARTICLE
   */
  downloadBody: async (id: number, type: CmsType = 'ARTICLE'): Promise<string> => {
    const item = await cmsService.getById(id, type);
    return item.body ?? item.description ?? '';
  },

  // ─── Content/attachment file helpers ────────────────────────────────────────

  /**
   * Upload a content file to Strapi's media library, then attach its URL to
   * the CMS item's contentLocation field.
   * POST /api/upload  →  PUT /api/cms/:id
   */
  uploadContent: async (id: number, file: File, type: CmsType = 'ARTICLE'): Promise<void> => {
    const uploaded = await mediaService.upload(file);
    await apiClient.put(`${CMS_BASE}/${id}`, {
      type,
      contentLocation: uploaded.url,
      contentName: file.name,
      contentType: file.type,
      contentSize: file.size,
    });
  },

  /**
   * Return the absolute URL for the content file attached to a CMS item.
   * GET /api/cms/:id?type=ARTICLE
   */
  downloadContent: async (id: number, type: CmsType = 'ARTICLE'): Promise<string | null> => {
    const item = await cmsService.getById(id, type);
    return item.contentUrl ?? null;
  },

  // ─── Thumbnail helpers ───────────────────────────────────────────────────────

  /**
   * Upload a thumbnail image to Strapi's media library, then attach its URL to
   * the CMS item's thumbnailLocation field.
   * POST /api/upload  →  PUT /api/cms/:id
   */
  uploadThumbnail: async (id: number, file: File, type: CmsType = 'ARTICLE'): Promise<void> => {
    const uploaded = await mediaService.upload(file);
    await apiClient.put(`${CMS_BASE}/${id}`, {
      type,
      thumbnailLocation: uploaded.url,
      thumbnailName: file.name,
      thumbnailType: file.type,
      thumbnailSize: file.size,
    });
  },
};

// ─── Media (upload) service ───────────────────────────────────────────────────

/**
 * Upload files through Strapi's built-in upload plugin.
 * Strapi exposes POST /api/upload (multipart/form-data with field "files").
 */
export const mediaService = {
  /**
   * Upload a file to Strapi's media library.
   * Returns the created Strapi media object.
   * POST /api/upload
   */
  upload: async (file: File): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('files', file); // Strapi expects the field name "files"

    const response = await apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    // Strapi returns an array; take the first uploaded file
    const uploaded = Array.isArray(response.data) ? response.data[0] : response.data;

    return {
      url: uploaded.url.startsWith('http')
        ? uploaded.url
        : `${MEDIA_BASE_URL}${uploaded.url}`,
      filename: uploaded.name,
      size: uploaded.size,
      mimeType: uploaded.mime,
    };
  },

  /**
   * Build an absolute URL for a Strapi media file path.
   */
  getMediaUrl: (path: string): string => {
    if (!path) return '';
    return path.startsWith('http') ? path : `${MEDIA_BASE_URL}${path}`;
  },
};

export default cmsService;
