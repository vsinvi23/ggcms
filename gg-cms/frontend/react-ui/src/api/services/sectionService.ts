import apiClient from '../client';
import { SectionDto, SectionCreateDto } from '../types';

const BASE = '/sections';

function transformLesson(l: any): import('../types').LessonDto {
  const attrs = l.attributes ?? l;
  return {
    id: l.id,
    title: attrs.title ?? '',
    type: attrs.type ?? 'text',
    content: attrs.content ?? null,
    duration: attrs.duration ?? 0,
    order: attrs.order ?? 0,
    section: attrs.section?.data ? { id: attrs.section.data.id } : (attrs.sectionId ? { id: attrs.sectionId } : null),
  };
}

function transformSection(item: any): SectionDto {
  const attrs = item.attributes ?? item;
  // Handle both Strapi format ({course: {data: {id}}}) and Go CMS format ({courseId: number})
  const courseId = attrs.course?.data?.id ?? attrs.courseId ?? null;
  const parentSectionId = attrs.parentSection?.data?.id ?? attrs.parentSectionId ?? null;
  // Handle both Strapi format (childSections.data[]) and Go CMS format (childSections[])
  const rawChildren = attrs.childSections?.data ?? attrs.childSections ?? [];
  const rawLessons = attrs.lessons?.data ?? attrs.lessons ?? [];
  return {
    id: item.id,
    title: attrs.title ?? '',
    description: attrs.description ?? null,
    order: attrs.order ?? 0,
    course: courseId ? { id: courseId } : null,
    parentSection: parentSectionId ? { id: parentSectionId } : null,
    childSections: rawChildren.map((s: any) => transformSection(s)),
    lessons: rawLessons.map((l: any) => transformLesson(l)),
  };
}

export const sectionService = {
  async getSectionsByCourse(courseId: number): Promise<SectionDto[]> {
    const response = await apiClient.get(BASE, {
      params: {
        'filters[course][id][$eq]': courseId,
        'filters[parentSection][id][$null]': true,
        'populate[childSections][populate][lessons]': true,
        'populate[lessons]': true,
        sort: 'order:asc',
        'pagination[pageSize]': 200,
      },
    });
    return (response.data.data ?? []).map(transformSection);
  },

  async createSection(data: SectionCreateDto): Promise<SectionDto> {
    const payload = {
      title: data.title,
      order: data.order,
      course: { id: data.courseId },
      ...(data.parentSectionId ? { parentSection: { id: data.parentSectionId } } : {}),
    };
    const response = await apiClient.post(BASE, { data: payload });
    return transformSection(response.data.data);
  },

  async updateSection(id: number, data: Partial<SectionCreateDto> & { description?: string | null }): Promise<SectionDto> {
    const payload: any = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.order !== undefined) payload.order = data.order;
    if ('description' in data) payload.description = data.description;
    const response = await apiClient.put(`${BASE}/${id}`, { data: payload });
    return transformSection(response.data.data);
  },

  async deleteSection(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },
};
