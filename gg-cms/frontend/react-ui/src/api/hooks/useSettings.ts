import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService, StorageSettings } from '../services/settingsService';
import { toast } from 'sonner';

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getAll(),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (settings: Partial<StorageSettings>) => settingsService.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Feature flags are derived from settings on the backend, so
      // invalidate the features cache too so changes take effect immediately.
      queryClient.invalidateQueries({ queryKey: ['features'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save settings');
    },
  });

  const testStorageMutation = useMutation({
    mutationFn: () => settingsService.testStorage(),
    onSuccess: (msg) => toast.success(msg),
    onError: (err: Error) => toast.error(err.message || 'Storage test failed'),
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    update: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
    testStorage: testStorageMutation.mutate,
    isTesting: testStorageMutation.isPending,
  };
}
