import axios from 'axios';
import { API_BASE_URL, MEDIA_BASE_URL } from '@/config/api';
import { CmsResponseDto } from '../types';

// Strip HTML tags and decode common HTML entities for plain text display
const stripHtml = (html: string | null | undefined): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Public endpoints exist under /api/public/... and do not require authentication.
// A separate axios instance is used so no Authorization header is ever attached.
const publicClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

const PUBLIC_ARTICLES = '/public/articles';
const PUBLIC_COURSES = '/public/courses';

export interface PublicCmsQueryParams {
  page?: number;
  size?: number;
  type?: 'ARTICLE' | 'COURSE';
  search?: string;
  categoryId?: number;
  courseType?: string;
}

export interface PublicCmsPagedResponse {
  items: CmsResponseDto[];
  total: number;
  currentPage: number;
  pageSize: number;
}

// ─── Transform helper ──────────────────────────────────────────────────────────

const buildAbsoluteUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  return path.startsWith('http') ? path : `${MEDIA_BASE_URL}${path}`;
};

const transformPublicItem = (item: Record<string, unknown>, type: 'ARTICLE' | 'COURSE'): CmsResponseDto => {
  if (!item) return item as unknown as CmsResponseDto;
  const category = item.category as Record<string, unknown> | undefined;
  const author = item.author as Record<string, unknown> | undefined;
  const thumbnail = item.thumbnail as Record<string, unknown> | undefined;
  const thumbnailUrl = buildAbsoluteUrl(thumbnail?.url as string | undefined);

  return {
    id: item.id as number,
    publicId: (item.publicId as string | undefined) ?? (item.public_id as string | undefined) ?? undefined,
    slug: (item.slug as string | undefined) ?? undefined,
    type,
    courseType: (item.courseType as string | null | undefined) ?? null,
    categoryId: (item.categoryId as number | undefined) ?? (category?.id as number | undefined) ?? null,
    categoryName: (item.categoryName as string | undefined) ?? (category?.name as string | undefined) ?? null,
    createdBy: (item.createdBy as number | undefined) ?? (author?.id as number | undefined) ?? null,
    reviewerId: null,
    reviewerName: null,
    reviewerComment: null,
    status: 'PUBLISHED',
    title: (item.title as string | null | undefined) ?? null,
    // Strip HTML/markdown from description so it shows as clean plain text in cards
    description: stripHtml((item.description as string | undefined) ?? (item.shortDescription as string | undefined) ?? (item.excerpt as string | undefined)),
    body: (item.body as string | null | undefined) ?? (item.content as string | null | undefined) ?? null,
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
    thumbnailLocation: (thumbnail?.url as string | undefined) ?? null,
    thumbnailName: (thumbnail?.name as string | undefined) ?? null,
    thumbnailType: (thumbnail?.mime as string | undefined) ?? null,
    thumbnailSize: (thumbnail?.size as number | undefined) ?? null,
    thumbnailUrl,
    attachments: (item.attachments as CmsResponseDto['attachments']) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: (item.updatedAt as string | null | undefined) ?? null,
    publishedAt: (item.publishedAt as string | null | undefined) ?? null,
    version: (item.version as number | undefined) ?? 1,
    updatedBy: undefined,
  };
};

// ─── Public CMS service ────────────────────────────────────────────────────────

export const publicCmsService = {
  /**
   * Get paginated list of PUBLISHED items.
   * Routes to /api/public/articles or /api/public/courses based on type.
   * GET /api/public/articles?page=0&size=10
   */
  getAll: async (params?: PublicCmsQueryParams): Promise<PublicCmsPagedResponse> => {
    const type = params?.type ?? 'ARTICLE';
    const base = type === 'COURSE' ? PUBLIC_COURSES : PUBLIC_ARTICLES;

    const response = await publicClient.get(base, {
      params: {
        page: params?.page ?? 0,
        size: params?.size ?? 10,
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params?.courseType ? { courseType: params.courseType } : {}),
      },
    });

    const items: Record<string, unknown>[] = response.data.data ?? [];
    const pagination = response.data.meta?.pagination ?? {};

    return {
      items: items.map((item) => transformPublicItem(item, type)),
      total: pagination.total ?? 0,
      currentPage: (pagination.page ?? 1) - 1,
      pageSize: pagination.pageSize ?? 10,
    };
  },

  /**
   * Get a single PUBLISHED item by publicId (UUID) or numeric id.
   * Pass preview=true to allow non-published items (for editor preview).
   * GET /api/public/articles/:id  or  /api/public/courses/:id
   */
  getById: async (id: string | number, type: 'ARTICLE' | 'COURSE' = 'ARTICLE', preview = false): Promise<CmsResponseDto> => {
    const base = type === 'COURSE' ? PUBLIC_COURSES : PUBLIC_ARTICLES;
    const response = await publicClient.get(`${base}/${id}`, { params: preview ? { preview: 'true' } : undefined });
    return transformPublicItem(response.data.data ?? response.data, type);
  },

  /**
   * Get published articles by category slug.
   * GET /api/public/articles/category/:slug
   */
  getArticlesByCategory: async (
    slug: string,
    params?: { page?: number; size?: number }
  ): Promise<PublicCmsPagedResponse> => {
    const response = await publicClient.get(`${PUBLIC_ARTICLES}/category/${slug}`, {
      params: {
        page: params?.page ?? 0,
        size: params?.size ?? 10,
      },
    });

    const items: Record<string, unknown>[] = response.data.data ?? [];
    const pagination = response.data.meta?.pagination ?? {};

    return {
      items: items.map((item) => transformPublicItem(item, 'ARTICLE')),
      total: pagination.total ?? 0,
      currentPage: (pagination.page ?? 1) - 1,
      pageSize: pagination.pageSize ?? 10,
    };
  },

  /**
   * Get published courses by category slug.
   * GET /api/public/courses/category/:slug
   */
  getCoursesByCategory: async (
    slug: string,
    params?: { page?: number; size?: number }
  ): Promise<PublicCmsPagedResponse> => {
    const response = await publicClient.get(`${PUBLIC_COURSES}/category/${slug}`, {
      params: {
        page: params?.page ?? 0,
        size: params?.size ?? 10,
      },
    });

    const items: Record<string, unknown>[] = response.data.data ?? [];
    const pagination = response.data.meta?.pagination ?? {};

    return {
      items: items.map((item) => transformPublicItem(item, 'COURSE')),
      total: pagination.total ?? 0,
      currentPage: (pagination.page ?? 1) - 1,
      pageSize: pagination.pageSize ?? 10,
    };
  },

  /**
   * Get the body HTML for a published CMS item.
   * Uses the `body` field if populated, otherwise falls back to raw `description`.
   * Fetches raw to avoid the HTML-stripped version stored in CmsResponseDto.description.
   */
  getBody: async (id: string | number, type: 'ARTICLE' | 'COURSE' = 'ARTICLE', preview = false): Promise<string> => {
    const base = type === 'COURSE' ? PUBLIC_COURSES : PUBLIC_ARTICLES;
    const response = await publicClient.get(`${base}/${id}`, { params: preview ? { preview: 'true' } : undefined });
    const item = response.data.data ?? response.data;
    // Prefer body (rich HTML), then content (Strapi article field), then excerpt/description as last resort
    return item.body || item.content || item.description || item.excerpt || '';
  },

  /**
   * Build an absolute URL for a Strapi-hosted media file.
   */
  buildMediaUrl: (path: string | null | undefined): string => {
    return buildAbsoluteUrl(path) ?? '';
  },
};

export default publicCmsService;

// ─── Public learning-path service (no auth) ────────────────────────────────────

export interface PublicLearningPathDto {
  id: number;
  kind: string;
  title: string;
  description: string;
  courses?: PublicCmsPagedResponse['items'];
}

export const publicLearningPathService = {
  async getAll(): Promise<PublicLearningPathDto[]> {
    const { data } = await publicClient.get<{ success: boolean; data: PublicLearningPathDto[] }>('/learning-paths');
    return data.data ?? [];
  },

  async getById(id: number | string): Promise<PublicLearningPathDto> {
    const { data } = await publicClient.get<{ success: boolean; data: PublicLearningPathDto }>(`/learning-paths/${id}`);
    return data.data;
  },
};
