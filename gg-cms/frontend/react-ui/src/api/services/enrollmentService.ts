import apiClient from '../client';
import { EnrollmentDto, EnrollmentProgressDto } from '../types';

const BASE = '/enrollments';

function transformEnrollment(item: Record<string, unknown>): EnrollmentDto {
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  // Handle both Strapi ({course: {data: {id, attributes}}}) and Go CMS ({course: {id}})
  let course = null;
  const courseField = attrs.course as Record<string, unknown> | undefined;
  if (courseField?.data) {
    const courseData = courseField.data as Record<string, unknown>;
    const courseAttrs = courseData.attributes as Record<string, unknown> | undefined;
    course = { id: courseData.id, title: (courseAttrs?.title ?? '') as string };
  } else if (courseField?.id) {
    course = { id: courseField.id, title: (courseField.title ?? '') as string };
  }
  // Handle both Strapi ({completedLessons: {data: [...]}}) and Go CMS ({completedLessons: [...]})
  const completedLessonsField = attrs.completedLessons as Record<string, unknown> | undefined;
  const rawLessons = (completedLessonsField?.data ?? attrs.completedLessons ?? []) as Record<string, unknown>[];
  return {
    id: item.id as number,
    status: (attrs.status ?? 'active') as EnrollmentDto['status'],
    progress: (attrs.progress ?? 0) as number,
    enrolledAt: (attrs.enrolledAt ?? null) as string | null,
    lastAccessedAt: (attrs.lastAccessedAt ?? null) as string | null,
    completedAt: (attrs.completedAt ?? null) as string | null,
    course,
    completedLessons: rawLessons.map((l) => ({ id: (l.id ?? l) as number })),
  };
}

export const enrollmentService = {
  async getMyEnrollments(): Promise<EnrollmentDto[]> {
    const response = await apiClient.get(BASE);
    const raw = response.data.data ?? response.data ?? [];
    const items = Array.isArray(raw) ? raw : [];
    return items.map(transformEnrollment);
  },

  async getMyEnrollment(courseId: number): Promise<EnrollmentDto | null> {
    const response = await apiClient.get(BASE, {
      params: {
        'filters[course][id][$eq]': courseId,
        'populate[course][fields][0]': 'title',
        'populate[completedLessons][fields][0]': 'id',
        'pagination[pageSize]': 1,
      },
    });
    const items = response.data.data ?? [];
    return items.length > 0 ? transformEnrollment(items[0]) : null;
  },

  async enroll(courseId: number): Promise<EnrollmentDto> {
    const response = await apiClient.post(BASE, {
      data: { course: courseId, enrolledAt: new Date().toISOString() },
    });
    return transformEnrollment(response.data.data);
  },

  async updateProgress(enrollmentId: number, data: EnrollmentProgressDto): Promise<EnrollmentDto> {
    const payload: Record<string, unknown> = {};
    if (data.progress !== undefined) payload.progress = data.progress;
    if (data.status !== undefined) payload.status = data.status;
    if (data.completedLessonId !== undefined) {
      // Go CMS expects [{id: N}] array, not Strapi's {connect: [...]}
      payload.completedLessons = [{ id: data.completedLessonId }];
    }
    const response = await apiClient.put(`${BASE}/${enrollmentId}`, { data: payload });
    // Response: { success, data: enrollmentDTO }
    return transformEnrollment(response.data.data ?? response.data);
  },

  async drop(enrollmentId: number): Promise<void> {
    await apiClient.put(`${BASE}/${enrollmentId}`, { data: { status: 'dropped' } });
  },
};
