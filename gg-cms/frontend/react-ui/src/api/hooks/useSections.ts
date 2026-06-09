import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sectionService } from '../services/sectionService';
import { SectionCreateDto } from '../types';

// Query keys
export const sectionKeys = {
  all: ['sections'] as const,
  byCourse: (courseId: number) => [...sectionKeys.all, 'course', courseId] as const,
};

/**
 * Hook to fetch all top-level sections for a course
 */
export const useSectionsByCourse = (courseId: number, enabled = true) => {
  return useQuery({
    queryKey: sectionKeys.byCourse(courseId),
    queryFn: () => sectionService.getSectionsByCourse(courseId),
    enabled: enabled && !!courseId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

/**
 * Hook to create a new section
 */
export const useCreateSection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SectionCreateDto) => sectionService.createSection(data),
    onSuccess: (_, data) =>
      qc.invalidateQueries({ queryKey: sectionKeys.byCourse(data.courseId) }),
  });
};

/**
 * Hook to update a section
 */
export const useUpdateSection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SectionCreateDto> & { description?: string | null } }) =>
      sectionService.updateSection(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sectionKeys.all }),
  });
};

/**
 * Hook to delete a section
 */
export const useDeleteSection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sectionService.deleteSection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sectionKeys.all }),
  });
};
