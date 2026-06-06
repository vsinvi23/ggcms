import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewCommentService } from '../services/reviewCommentService';
import { ReviewCommentCreateDto } from '../types';

// Query keys
export const commentKeys = {
  all: ['review-comments'] as const,
  list: (contentType: string, contentId: string) =>
    [...commentKeys.all, contentType, contentId] as const,
};

/**
 * Hook to fetch review comments for a piece of content
 */
export const useReviewComments = (
  contentType: string,
  contentId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: commentKeys.list(contentType, contentId),
    queryFn: () => reviewCommentService.getComments(contentType, contentId),
    enabled: enabled && !!contentType && !!contentId,
  });
};

/**
 * Hook to create a new review comment
 */
export const useCreateComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewCommentCreateDto) => reviewCommentService.createComment(data),
    onSuccess: (_, data) =>
      qc.invalidateQueries({
        queryKey: commentKeys.list(data.contentType, data.contentId),
      }),
  });
};

/**
 * Hook to delete a review comment
 */
export const useDeleteComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reviewCommentService.deleteComment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.all }),
  });
};
