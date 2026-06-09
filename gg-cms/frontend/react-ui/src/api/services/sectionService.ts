import apiClient from '../client';
import { SectionDto, SectionCreateDto } from '../types';

const BASE = '/sections';

function transformLesson(l: Record<string, unknown>): import('../types').LessonDto {
  const attrs = (l.attributes ?? l) as Record<string, unknown>;
  const sectionField = attrs.section as Record<string, unknown> | undefined;
  const sectionData = sectionField?.data as Record<string, unknown> | undefined;
  return {
    id: l.id as number,
    title: (attrs.title ?? '') as string,
    type: (attrs.type ?? 'text') as import('../types').LessonDto['type'],
    content: (attrs.content ?? null) as string | null,
    duration: (attrs.duration ?? 0) as number,
    order: (attrs.order ?? 0) as number,
    section: sectionData ? { id: sectionData.id as number } : (attrs.sectionId ? { id: attrs.sectionId as number } : null),
  };
}

function transformSection(item: Record<string, unknown>): SectionDto {
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  // Handle both Strapi format ({course: {data: {id}}}) and Go CMS format ({courseId: number})
  const courseField = attrs.course as Record<string, unknown> | undefined;
  const courseId = (courseField?.data as Record<string, unknown> | undefined)?.id ?? attrs.courseId ?? null;
  const parentSectionField = attrs.parentSection as Record<string, unknown> | undefined;
  const parentSectionId = (parentSectionField?.data as Record<string, unknown> | undefined)?.id ?? attrs.parentSectionId ?? null;
  // Handle both Strapi format (childSections.data[]) and Go CMS format (childSections[])
  const childSectionsField = attrs.childSections as Record<string, unknown> | undefined;
  const rawChildren = ((childSectionsField?.data ?? attrs.childSections ?? []) as Record<string, unknown>[]);
  const lessonsField = attrs.lessons as Record<string, unknown> | undefined;
  const rawLessons = ((lessonsField?.data ?? attrs.lessons ?? []) as Record<string, unknown>[]);
  return {
    id: item.id as number,
    title: (attrs.title ?? '') as string,
    description: (attrs.description ?? null) as string | null,
    order: (attrs.order ?? 0) as number,
    course: courseId ? { id: courseId as number } : null,
    parentSection: parentSectionId ? { id: parentSectionId as number } : null,
    childSections: rawChildren.map((s) => transformSection(s)),
    lessons: rawLessons.map((l) => transformLesson(l)),
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
    const payload: Record<string, unknown> = {};
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
