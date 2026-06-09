import apiClient from '../client';
import { ReviewCommentDto, ReviewCommentCreateDto } from '../types';

const BASE = '/review-comments';

function transformComment(item: Record<string, unknown>): ReviewCommentDto {
  // Support both Strapi nested format (item.attributes) and our flat backend DTO
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  const authorField = attrs.author as Record<string, unknown> | undefined;
  const authorData = authorField?.data as Record<string, unknown> | undefined;
  const authorAttrs = authorData?.attributes as Record<string, unknown> | undefined;
  const parentField = attrs.parent as Record<string, unknown> | undefined;
  const parentData = parentField?.data as Record<string, unknown> | undefined;
  const repliesField = attrs.replies as Record<string, unknown> | undefined;
  return {
    id: item.id as string,
    content: attrs.content as string,
    contentType: attrs.contentType as ReviewCommentDto['contentType'],
    contentId: attrs.contentId as string,
    // Strapi nests author under .data; our backend returns it flat
    author: authorData
      ? { id: authorData.id as number, name: (authorAttrs?.name ?? '') as string, email: (authorAttrs?.email ?? '') as string }
      : authorField
        ? { id: (authorField.id ?? 0) as number, name: (authorField.name ?? '') as string, email: (authorField.email ?? '') as string }
        : undefined,
    parent: parentData
      ? { id: parentData.id as string }
      : attrs.parentId
        ? { id: attrs.parentId as string }
        : null,
    // Strapi nests replies under .data; our backend returns them as a plain array
    replies: ((repliesField?.data ?? attrs.replies ?? []) as Record<string, unknown>[]).map((r) => transformComment(r)),
    createdAt: attrs.createdAt as string,
    updatedAt: (attrs.updatedAt ?? attrs.createdAt) as string,
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
