import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { privacyService } from '../services/privacyService';
import { authService } from '../services/authService';
import type { ConsentInput, SelfProfileUpdate, UserPreferencesUpdate } from '../types';

export const privacyKeys = {
  retention: ['privacy', 'retention'] as const,
  consent: ['privacy', 'consent'] as const,
  preferences: ['privacy', 'preferences'] as const,
  me: ['privacy', 'me'] as const,
};

export const useRetention = () =>
  useQuery({ queryKey: privacyKeys.retention, queryFn: privacyService.getRetention, staleTime: 10 * 60_000 });

export const useConsent = (enabled: boolean) =>
  useQuery({ queryKey: privacyKeys.consent, queryFn: privacyService.getConsent, enabled, staleTime: 60_000 });

export const useSaveConsent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConsentInput) => privacyService.saveConsent(input),
    onSuccess: (data) => qc.setQueryData(privacyKeys.consent, data),
  });
};

export const usePreferences = () =>
  useQuery({ queryKey: privacyKeys.preferences, queryFn: privacyService.getPreferences });

export const useUpdatePreferences = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: UserPreferencesUpdate) => privacyService.updatePreferences(update),
    onSuccess: (data) => qc.setQueryData(privacyKeys.preferences, data),
  });
};

export const useExportData = () => useMutation({ mutationFn: () => privacyService.exportData() });

export const useDeleteAccount = () =>
  useMutation({ mutationFn: (password?: string) => privacyService.deleteAccount(password) });

export const useSelfProfile = () =>
  useQuery({ queryKey: privacyKeys.me, queryFn: () => authService.getCurrentUser() });

export const useUpdateSelfProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: SelfProfileUpdate) => privacyService.updateMe(update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: privacyKeys.me });
      qc.invalidateQueries({ queryKey: privacyKeys.preferences });
    },
  });
};

export const useUnsubscribe = () => useMutation({ mutationFn: (token: string) => privacyService.unsubscribe(token) });
