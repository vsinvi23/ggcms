import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lessonService } from '../services/lessonService';
import { LessonCreateDto } from '../types';
import { sectionKeys } from './useSections';

// Query keys
export const lessonKeys = {
  all: ['lessons'] as const,
  bySection: (sectionId: number) => [...lessonKeys.all, 'section', sectionId] as const,
};

/**
 * Hook to fetch all lessons for a section
 */
export const useLessonsBySection = (sectionId: number, enabled = true) => {
  return useQuery({
    queryKey: lessonKeys.bySection(sectionId),
    queryFn: () => lessonService.getLessonsBySection(sectionId),
    enabled: enabled && !!sectionId,
  });
};

/**
 * Hook to create a new lesson
 */
export const useCreateLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LessonCreateDto) => lessonService.createLesson(data),
    onSuccess: (_, data) => {
      qc.invalidateQueries({ queryKey: lessonKeys.bySection(data.sectionId) });
      // Also invalidate the sections-by-course cache so CourseChapterViewer
      // picks up the new lesson when it renders after the editor closes.
      qc.invalidateQueries({ queryKey: sectionKeys.all });
    },
  });
};

/**
 * Hook to update a lesson
 */
export const useUpdateLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LessonCreateDto> }) =>
      lessonService.updateLesson(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lessonKeys.all });
      qc.invalidateQueries({ queryKey: sectionKeys.all });
    },
  });
};

/**
 * Hook to delete a lesson
 */
export const useDeleteLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lessonService.deleteLesson(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lessonKeys.all });
      qc.invalidateQueries({ queryKey: sectionKeys.all });
    },
  });
};
