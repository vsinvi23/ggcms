import apiClient from '../client';
import {
  ReactionSummary,
  NoteDto,
  FavouriteDto,
  FavouriteItemDto,
  HighlightDto,
} from '../types';

type ContentType = 'article' | 'course';

// All engagement endpoints sit under /api/engagement.
// apiClient.baseURL already includes /api.
const BASE = '/engagement';

export const engagementService = {
  // ── Reactions ────────────────────────────────────────────────────────────

  /** POST /api/engagement/:contentType/:contentId/react */
  react: async (contentType: ContentType, contentId: number, value: 'like' | 'dislike'): Promise<void> => {
    await apiClient.post(`${BASE}/${contentType}/${contentId}/react`, { value });
  },

  /** DELETE /api/engagement/:contentType/:contentId/react */
  unreact: async (contentType: ContentType, contentId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${contentType}/${contentId}/react`);
  },

  /** GET /api/engagement/:contentType/:contentId/reactions */
  getReactions: async (contentType: ContentType, contentId: number): Promise<ReactionSummary> => {
    const res = await apiClient.get(`${BASE}/${contentType}/${contentId}/reactions`);
    return res.data.data as ReactionSummary;
  },

  // ── Notes ────────────────────────────────────────────────────────────────

  /** PUT /api/engagement/:contentType/:contentId/note */
  upsertNote: async (contentType: ContentType, contentId: number, body: string): Promise<NoteDto> => {
    const res = await apiClient.put(`${BASE}/${contentType}/${contentId}/note`, { body });
    return res.data.data as NoteDto;
  },

  /** GET /api/engagement/:contentType/:contentId/note */
  getNote: async (contentType: ContentType, contentId: number): Promise<NoteDto | null> => {
    const res = await apiClient.get(`${BASE}/${contentType}/${contentId}/note`);
    return (res.data.data as NoteDto) ?? null;
  },

  /** GET /api/engagement/notes?page=0&size=10 */
  listMyNotes: async (page = 0, size = 20): Promise<{ items: NoteDto[]; total: number }> => {
    const res = await apiClient.get(`${BASE}/notes`, { params: { page, size } });
    const items = (res.data.data as NoteDto[]) ?? [];
    const total = res.data.meta?.pagination?.total ?? 0;
    return { items, total };
  },

  /** DELETE /api/engagement/notes/:id */
  deleteNote: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/notes/${id}`);
  },

  // ── Favourites ───────────────────────────────────────────────────────────

  /** POST /api/engagement/:contentType/:contentId/favourite */
  toggleFavourite: async (contentType: ContentType, contentId: number): Promise<FavouriteDto> => {
    const res = await apiClient.post(`${BASE}/${contentType}/${contentId}/favourite`);
    return res.data.data as FavouriteDto;
  },

  /** GET /api/engagement/:contentType/:contentId/favourite */
  isFavourited: async (contentType: ContentType, contentId: number): Promise<FavouriteDto> => {
    const res = await apiClient.get(`${BASE}/${contentType}/${contentId}/favourite`);
    return res.data.data as FavouriteDto;
  },

  /** GET /api/engagement/favourites?page=0&size=20 */
  listMyFavourites: async (page = 0, size = 20): Promise<{ items: FavouriteItemDto[]; total: number }> => {
    const res = await apiClient.get(`${BASE}/favourites`, { params: { page, size } });
    const items = (res.data.data as FavouriteItemDto[]) ?? [];
    const total = res.data.meta?.pagination?.total ?? 0;
    return { items, total };
  },

  // ── Highlights ───────────────────────────────────────────────────────────

  /** POST /api/engagement/:contentType/:contentId/highlights */
  createHighlight: async (
    contentType: ContentType,
    contentId: number,
    payload: { text: string; startOffset: number; endOffset: number; color?: string; note?: string; contentTitle?: string; contentSlug?: string }
  ): Promise<HighlightDto> => {
    const res = await apiClient.post(`${BASE}/${contentType}/${contentId}/highlights`, payload);
    return res.data.data as HighlightDto;
  },

  /** PUT /api/engagement/highlights/:id */
  updateHighlight: async (id: string, payload: { note?: string; color?: string }): Promise<void> => {
    await apiClient.put(`${BASE}/highlights/${id}`, payload);
  },

  /** GET /api/engagement/:contentType/:contentId/highlights */
  listHighlights: async (contentType: ContentType, contentId: number): Promise<HighlightDto[]> => {
    const res = await apiClient.get(`${BASE}/${contentType}/${contentId}/highlights`);
    return (res.data.data as HighlightDto[]) ?? [];
  },

  /** GET /api/engagement/highlights?page=0&size=20 */
  listMyHighlights: async (page = 0, size = 20): Promise<{ items: HighlightDto[]; total: number }> => {
    const res = await apiClient.get(`${BASE}/highlights`, { params: { page, size } });
    const items = (res.data.data as HighlightDto[]) ?? [];
    const total = res.data.meta?.pagination?.total ?? 0;
    return { items, total };
  },

  /** DELETE /api/engagement/highlights/:id */
  deleteHighlight: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/highlights/${id}`);
  },
};

export default engagementService;
