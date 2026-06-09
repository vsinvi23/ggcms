import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../services/notificationService';

// Query keys
export const notifKeys = {
  all: ['notifications'] as const,
  list: (params?: Record<string, unknown>) => [...notifKeys.all, 'list', params] as const,
};

/**
 * Hook to fetch notifications
 */
export const useNotifications = (params?: { read?: boolean; page?: number }) => {
  return useQuery({
    queryKey: notifKeys.list(params),
    queryFn: () => notificationService.getNotifications(params),
  });
};

/**
 * Hook to mark a single notification as read
 */
export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notifKeys.all }),
  });
};

/**
 * Hook to mark all notifications as read
 */
export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notifKeys.all }),
  });
};
