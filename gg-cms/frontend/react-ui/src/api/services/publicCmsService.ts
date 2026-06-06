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

const transformPublicItem = (item: any, type: 'ARTICLE' | 'COURSE'): CmsResponseDto => {
  if (!item) return item;
  const thumbnail = item.thumbnail;
  const thumbnailUrl = buildAbsoluteUrl(thumbnail?.url);

  return {
    id: item.id,
    publicId: item.publicId ?? item.public_id ?? undefined,
    slug: item.slug ?? undefined,
    type,
    courseType: item.courseType ?? null,
    categoryId: item.categoryId ?? item.category?.id ?? null,
    categoryName: item.categoryName ?? item.category?.name ?? null,
    createdBy: item.createdBy ?? item.author?.id ?? null,
    reviewerId: null,
    reviewerName: null,
    reviewerComment: null,
    status: 'PUBLISHED',
    title: item.title ?? null,
    // Strip HTML/markdown from description so it shows as clean plain text in cards
    description: stripHtml(item.description ?? item.shortDescription ?? item.excerpt),
    body: item.body ?? item.content ?? null,
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
    thumbnailLocation: thumbnail?.url ?? null,
    thumbnailName: thumbnail?.name ?? null,
    thumbnailType: thumbnail?.mime ?? null,
    thumbnailSize: thumbnail?.size ?? null,
    thumbnailUrl,
    attachments: item.attachments ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? null,
    publishedAt: item.publishedAt ?? null,
    version: item.version ?? 1,
    updatedBy: null,
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

    const items: any[] = response.data.data ?? [];
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

    const items: any[] = response.data.data ?? [];
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

    const items: any[] = response.data.data ?? [];
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
