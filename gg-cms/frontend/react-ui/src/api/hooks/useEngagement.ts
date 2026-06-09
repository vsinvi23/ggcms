import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { engagementService } from '../services/engagementService';

type ContentType = 'article' | 'course';

// ── Query keys ────────────────────────────────────────────────────────────────

export const engagementKeys = {
  reactions: (ct: ContentType, cid: number) => ['engagement', 'reactions', ct, cid] as const,
  note: (ct: ContentType, cid: number) => ['engagement', 'note', ct, cid] as const,
  myNotes: (page?: number) => ['engagement', 'notes', 'my', page] as const,
  favourite: (ct: ContentType, cid: number) => ['engagement', 'favourite', ct, cid] as const,
  myFavourites: (page?: number) => ['engagement', 'favourites', 'my', page] as const,
  highlights: (ct: ContentType, cid: number) => ['engagement', 'highlights', ct, cid] as const,
  myHighlights: (page?: number) => ['engagement', 'highlights', 'my', page] as const,
};

// ── Reactions ─────────────────────────────────────────────────────────────────

export const useReactions = (contentType: ContentType, contentId: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.reactions(contentType, contentId),
    queryFn: () => engagementService.getReactions(contentType, contentId),
    enabled: !!user && contentId > 0,
    staleTime: 30_000,
  });
};

export const useReact = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: 'like' | 'dislike') =>
      engagementService.react(contentType, contentId, value),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.reactions(contentType, contentId) });
    },
  });
};

export const useUnreact = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => engagementService.unreact(contentType, contentId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.reactions(contentType, contentId) });
    },
  });
};

// ── Notes ─────────────────────────────────────────────────────────────────────

export const useNote = (contentType: ContentType, contentId: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.note(contentType, contentId),
    queryFn: () => engagementService.getNote(contentType, contentId),
    enabled: !!user && contentId > 0,
  });
};

export const useUpsertNote = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => engagementService.upsertNote(contentType, contentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.note(contentType, contentId) });
      // Refresh My Learning notes list
      queryClient.invalidateQueries({ queryKey: ['engagement', 'notes', 'my'] });
    },
  });
};

export const useDeleteNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => engagementService.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement', 'notes', 'my'] });
    },
  });
};

export const useMyNotes = (page = 0, size = 20) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.myNotes(page),
    queryFn: () => engagementService.listMyNotes(page, size),
    enabled: !!user,
  });
};

// ── Favourites ────────────────────────────────────────────────────────────────

export const useFavourite = (contentType: ContentType, contentId: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.favourite(contentType, contentId),
    queryFn: () => engagementService.isFavourited(contentType, contentId),
    enabled: !!user && contentId > 0,
  });
};

export const useToggleFavourite = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => engagementService.toggleFavourite(contentType, contentId),
    onSuccess: (data) => {
      // Update the favourite status in cache immediately
      queryClient.setQueryData(
        engagementKeys.favourite(contentType, contentId),
        data
      );
      // Refresh My Learning favourites list
      queryClient.invalidateQueries({ queryKey: ['engagement', 'favourites', 'my'] });
    },
  });
};

export const useMyFavourites = (page = 0, size = 20) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.myFavourites(page),
    queryFn: () => engagementService.listMyFavourites(page, size),
    enabled: !!user,
  });
};

// ── Highlights ────────────────────────────────────────────────────────────────

export const useHighlights = (contentType: ContentType, contentId: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.highlights(contentType, contentId),
    queryFn: () => engagementService.listHighlights(contentType, contentId),
    enabled: !!user && contentId > 0,
  });
};

export const useCreateHighlight = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { text: string; startOffset: number; endOffset: number; color?: string; note?: string; contentTitle?: string; contentSlug?: string }) =>
      engagementService.createHighlight(contentType, contentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.highlights(contentType, contentId) });
    },
  });
};

export const useUpdateHighlight = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, color }: { id: string; note?: string; color?: string }) =>
      engagementService.updateHighlight(id, { note, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.highlights(contentType, contentId) });
      queryClient.invalidateQueries({ queryKey: ['engagement', 'highlights', 'my'] });
    },
  });
};

export const useDeleteHighlight = (contentType: ContentType, contentId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => engagementService.deleteHighlight(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engagementKeys.highlights(contentType, contentId) });
      queryClient.invalidateQueries({ queryKey: ['engagement', 'highlights', 'my'] });
    },
  });
};

export const useMyHighlights = (page = 0, size = 20) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: engagementKeys.myHighlights(page),
    queryFn: () => engagementService.listMyHighlights(page, size),
    enabled: !!user,
  });
};
