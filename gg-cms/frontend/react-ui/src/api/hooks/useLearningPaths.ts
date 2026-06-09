import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  learningPathService,
  LearningPathCreateDto,
  LearningPathUpdateDto,
  LearningPathCourseDto,
} from '../services/learningPathService';

export const learningPathKeys = {
  all: ['learning-paths'] as const,
  list: (kind?: string) => [...learningPathKeys.all, 'list', kind] as const,
  detail: (id: number) => [...learningPathKeys.all, id] as const,
};

export const useLearningPaths = (kind?: string) => {
  return useQuery({
    queryKey: learningPathKeys.list(kind),
    queryFn: () => learningPathService.getAll(kind),
    staleTime: 2 * 60 * 1000,
  });
};

export const useLearningPath = (id: number, enabled = true) => {
  return useQuery({
    queryKey: learningPathKeys.detail(id),
    queryFn: () => learningPathService.getById(id),
    enabled: enabled && id > 0,
  });
};

export const useCreateLearningPath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LearningPathCreateDto) => learningPathService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningPathKeys.all }),
  });
};

export const useUpdateLearningPath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LearningPathUpdateDto }) =>
      learningPathService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: learningPathKeys.detail(id) });
      qc.invalidateQueries({ queryKey: learningPathKeys.all });
    },
  });
};

export const useDeleteLearningPath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => learningPathService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningPathKeys.all }),
  });
};

export const useSetLearningPathCourses = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, courses }: { id: number; courses: LearningPathCourseDto[] }) =>
      learningPathService.setCourses(id, courses),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: learningPathKeys.detail(id) });
      qc.invalidateQueries({ queryKey: learningPathKeys.all });
    },
  });
};
