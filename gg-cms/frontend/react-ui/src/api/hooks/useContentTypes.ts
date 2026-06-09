import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  contentTypeService,
  ContentTypeCreateDto,
  ContentTypeUpdateDto,
} from '../services/contentTypeService';

export const contentTypeKeys = {
  all: ['content-types'] as const,
  byKind: (kind: string) => [...contentTypeKeys.all, kind] as const,
};

export const useContentTypes = (kind: string) => {
  return useQuery({
    queryKey: contentTypeKeys.byKind(kind),
    queryFn: () => contentTypeService.getAll(kind),
    staleTime: 5 * 60 * 1000, // 5 min
  });
};

export const useCreateContentType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ContentTypeCreateDto) => contentTypeService.create(data),
    onSuccess: (_, { kind }) => {
      qc.invalidateQueries({ queryKey: contentTypeKeys.byKind(kind) });
    },
  });
};

export const useUpdateContentType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, kind }: { id: number; data: ContentTypeUpdateDto; kind: string }) =>
      contentTypeService.update(id, data),
    onSuccess: (_, { kind }) => {
      qc.invalidateQueries({ queryKey: contentTypeKeys.byKind(kind) });
    },
  });
};

export const useDeleteContentType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: string }) =>
      contentTypeService.delete(id),
    onSuccess: (_, { kind }) => {
      qc.invalidateQueries({ queryKey: contentTypeKeys.byKind(kind) });
    },
  });
};
