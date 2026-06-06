import apiClient from '../client';
import { EnrollmentDto, EnrollmentProgressDto } from '../types';

const BASE = '/enrollments';

function transformEnrollment(item: any): EnrollmentDto {
  const attrs = item.attributes ?? item;
  // Handle both Strapi ({course: {data: {id, attributes}}}) and Go CMS ({course: {id}})
  let course = null;
  if (attrs.course?.data) {
    course = { id: attrs.course.data.id, title: attrs.course.data.attributes?.title ?? '' };
  } else if (attrs.course?.id) {
    course = { id: attrs.course.id, title: attrs.course.title ?? '' };
  }
  // Handle both Strapi ({completedLessons: {data: [...]}}) and Go CMS ({completedLessons: [...]})
  const rawLessons = attrs.completedLessons?.data ?? attrs.completedLessons ?? [];
  return {
    id: item.id,
    status: attrs.status ?? 'active',
    progress: attrs.progress ?? 0,
    enrolledAt: attrs.enrolledAt ?? null,
    lastAccessedAt: attrs.lastAccessedAt ?? null,
    completedAt: attrs.completedAt ?? null,
    course,
    completedLessons: rawLessons.map((l: any) => ({ id: l.id ?? l })),
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
    const payload: any = {};
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
