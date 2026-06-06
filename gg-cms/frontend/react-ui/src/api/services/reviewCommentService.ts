import apiClient from '../client';
import { ReviewCommentDto, ReviewCommentCreateDto } from '../types';

const BASE = '/review-comments';

function transformComment(item: any): ReviewCommentDto {
  // Support both Strapi nested format (item.attributes) and our flat backend DTO
  const attrs = item.attributes ?? item;
  return {
    id: item.id,
    content: attrs.content,
    contentType: attrs.contentType,
    contentId: attrs.contentId,
    // Strapi nests author under .data; our backend returns it flat
    author: attrs.author?.data
      ? { id: attrs.author.data.id, ...attrs.author.data.attributes }
      : attrs.author
        ? { id: attrs.author.id ?? 0, name: attrs.author.name ?? '', email: attrs.author.email ?? '' }
        : undefined,
    parent: attrs.parent?.data
      ? { id: attrs.parent.data.id }
      : attrs.parentId
        ? { id: attrs.parentId }
        : null,
    // Strapi nests replies under .data; our backend returns them as a plain array
    replies: (attrs.replies?.data ?? attrs.replies ?? []).map((r: any) => transformComment(r)),
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt ?? attrs.createdAt,
  };
}

export const reviewCommentService = {
  async getComments(contentType: string, contentId: string): Promise<ReviewCommentDto[]> {
    const response = await apiClient.get(BASE, {
      params: {
        'filters[contentType][$eq]': contentType,
        'filters[contentId][$eq]': contentId,
        'filters[parent][$null]': true,
        'populate[author][fields][0]': 'name',
        'populate[author][fields][1]': 'email',
        'populate[replies][populate][author][fields][0]': 'name',
        'pagination[pageSize]': 100,
        sort: 'createdAt:asc',
      },
    });
    return (response.data.data ?? []).map(transformComment);
  },

  async createComment(data: ReviewCommentCreateDto): Promise<ReviewCommentDto> {
    const payload = {
      content: data.content,
      contentType: data.contentType,
      contentId: data.contentId,
      // Backend expects parentId (string); only include when set
      ...(data.parentId != null ? { parentId: String(data.parentId) } : {}),
    };
    const response = await apiClient.post(BASE, { data: payload });
    return transformComment(response.data.data);
  },

  async deleteComment(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },
};
