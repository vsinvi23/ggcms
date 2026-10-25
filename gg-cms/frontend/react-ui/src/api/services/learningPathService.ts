import apiClient from '../client';
import { PathProgressDto } from '../types';

export interface LearningPathCourseDto {
  courseId: number;
  sortOrder: number;
}

export type LearningPathKind = 'LEARNING_PLAN' | 'INTERVIEW_PREP' | 'STRUCTURED_PATH' | 'SECURITY_TRACK' | 'PRACTICE_TRACK';

export interface LearningPathDto {
  id: number;
  kind: string;
  slug?: string;
  title: string;
  description: string;
  createdById: number;
  courseCount: number;
  courses: LearningPathCourseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface LearningPathCreateDto {
  kind: LearningPathKind;
  title: string;
  description?: string;
}

export interface LearningPathUpdateDto {
  title?: string;
  description?: string;
}

export const learningPathService = {
  getAll: async (kind?: string): Promise<LearningPathDto[]> => {
    const response = await apiClient.get('/learning-paths', {
      params: kind ? { kind } : {},
    });
    return response.data.data ?? [];
  },

  getById: async (id: number): Promise<LearningPathDto> => {
    const response = await apiClient.get(`/learning-paths/${id}`);
    return response.data.data;
  },

  getProgress: async (idOrSlug: number | string): Promise<PathProgressDto> => {
    const response = await apiClient.get(`/learning-paths/${idOrSlug}/progress`);
    return response.data.data;
  },

  create: async (data: LearningPathCreateDto): Promise<LearningPathDto> => {
    const response = await apiClient.post('/learning-paths', data);
    return response.data.data;
  },

  update: async (id: number, data: LearningPathUpdateDto): Promise<LearningPathDto> => {
    const response = await apiClient.put(`/learning-paths/${id}`, data);
    return response.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/learning-paths/${id}`);
  },

  setCourses: async (id: number, courses: LearningPathCourseDto[]): Promise<void> => {
    await apiClient.put(`/learning-paths/${id}/courses`, { courses });
  },
};
