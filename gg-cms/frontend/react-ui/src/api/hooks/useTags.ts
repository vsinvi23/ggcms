import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagService } from '../services/tagService';

export const tagKeys = {
  all: ['tags'] as const,
  categoryTags: (categoryId: number) => ['tags', 'category', categoryId] as const,
};

export const useTags = () => {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: () => tagService.getAll(),
  });
};

export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tagService.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tagService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
};

export const useCategoryTags = (categoryId: number, enabled = true) => {
  return useQuery({
    queryKey: tagKeys.categoryTags(categoryId),
    queryFn: () => tagService.getCategoryTags(categoryId),
    enabled: enabled && categoryId > 0,
  });
};

export const useSetCategoryTags = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, tagIds }: { categoryId: number; tagIds: number[] }) =>
      tagService.setCategoryTags(categoryId, tagIds),
    onSuccess: (_, { categoryId }) =>
      qc.invalidateQueries({ queryKey: tagKeys.categoryTags(categoryId) }),
  });
};
