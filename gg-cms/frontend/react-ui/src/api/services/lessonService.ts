import apiClient from '../client';
import { LessonDto, LessonCreateDto } from '../types';

const BASE = '/lessons';

function transformLesson(item: Record<string, unknown>): LessonDto {
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  const sectionField = attrs.section as Record<string, unknown> | undefined;
  const sectionData = sectionField?.data as Record<string, unknown> | undefined;
  return {
    id: item.id as number,
    title: attrs.title as string,
    type: (attrs.type ?? 'text') as LessonDto['type'],
    content: (attrs.content ?? null) as string | null,
    duration: (attrs.duration ?? 0) as number,
    order: (attrs.order ?? 0) as number,
    section: sectionData ? { id: sectionData.id as number } : null,
  };
}

export const lessonService = {
  async getLessonsBySection(sectionId: number): Promise<LessonDto[]> {
    const response = await apiClient.get(BASE, {
      params: {
        'filters[section][id][$eq]': sectionId,
        sort: 'order:asc',
        'pagination[pageSize]': 200,
      },
    });
    return (response.data.data ?? []).map(transformLesson);
  },

  async createLesson(data: LessonCreateDto): Promise<LessonDto> {
    const payload = {
      title: data.title,
      type: data.type ?? 'text',
      content: data.content,
      duration: data.duration ?? 0,
      order: data.order,
      section: { id: data.sectionId },
    };
    const response = await apiClient.post(BASE, { data: payload });
    return transformLesson(response.data.data);
  },

  async updateLesson(id: number, data: Partial<LessonCreateDto>): Promise<LessonDto> {
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.type !== undefined) payload.type = data.type;
    if (data.content !== undefined) payload.content = data.content;
    if (data.duration !== undefined) payload.duration = data.duration;
    if (data.order !== undefined) payload.order = data.order;
    const response = await apiClient.put(`${BASE}/${id}`, { data: payload });
    return transformLesson(response.data.data);
  },

  async deleteLesson(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },
};
