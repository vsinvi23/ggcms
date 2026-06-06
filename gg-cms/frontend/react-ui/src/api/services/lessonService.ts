import apiClient from '../client';
import { LessonDto, LessonCreateDto } from '../types';

const BASE = '/lessons';

function transformLesson(item: any): LessonDto {
  const attrs = item.attributes ?? item;
  return {
    id: item.id,
    title: attrs.title,
    type: attrs.type ?? 'text',
    content: attrs.content ?? null,
    duration: attrs.duration ?? 0,
    order: attrs.order ?? 0,
    section: attrs.section?.data ? { id: attrs.section.data.id } : null,
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
    const payload: any = {};
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
