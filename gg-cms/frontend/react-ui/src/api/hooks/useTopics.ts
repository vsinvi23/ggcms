import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { topicService } from '../services/topicService';
import { TopicRelationshipDto } from '../types';

export const TOPICS_QUERY_KEY = ['topics'] as const;

export function useTopics() {
  return useQuery({
    queryKey: TOPICS_QUERY_KEY,
    queryFn: () => topicService.getAll(),
  });
}

export function useTopic(id: number | null) {
  return useQuery({
    queryKey: [...TOPICS_QUERY_KEY, id],
    queryFn: () => (id ? topicService.getById(id) : null),
    enabled: !!id,
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; entity_type?: string; description?: string }) =>
      topicService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
    },
  });
}

export function useUpdateTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; entity_type?: string; description?: string } }) =>
      topicService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...TOPICS_QUERY_KEY, variables.id] });
    },
  });
}

export function useTopicRelationships(topicId: number | null) {
  return useQuery({
    queryKey: [...TOPICS_QUERY_KEY, topicId, 'relationships'],
    queryFn: () => (topicId ? topicService.getRelationships(topicId) : []),
    enabled: !!topicId,
  });
}

export function useSetTopicRelationships() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, relationships }: { topicId: number; relationships: TopicRelationshipDto[] }) =>
      topicService.setRelationships(topicId, relationships),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...TOPICS_QUERY_KEY, variables.topicId, 'relationships'] });
    },
  });
}

export function useContentTopics(contentId: number | null, contentType: string) {
  return useQuery({
    queryKey: [...TOPICS_QUERY_KEY, 'content', contentType, contentId],
    queryFn: () => (contentId ? topicService.getContentTopics(contentId, contentType) : []),
    enabled: !!contentId && !!contentType,
  });
}

export function useTopicContent(topicId: number | null, contentType?: 'ARTICLE' | 'COURSE') {
  return useQuery({
    queryKey: [...TOPICS_QUERY_KEY, topicId, 'content', contentType],
    queryFn: () => (topicId ? topicService.getTopicContent(topicId, contentType) : []),
    enabled: !!topicId,
  });
}
