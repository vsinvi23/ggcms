import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileService } from '../services/profileService';
import type { UpsertProfileRequest, CreateProfileRequest } from '../types';

export const profileKeys = {
  profile: ['personalization', 'profile'] as const,
  profiles: ['personalization', 'profiles'] as const,
  recommendations: (limit: number) => ['personalization', 'recommendations', limit] as const,
};

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: profileKeys.profile });
  qc.invalidateQueries({ queryKey: profileKeys.profiles });
  qc.invalidateQueries({ queryKey: ['personalization', 'recommendations'] });
};

export const useProfile = () =>
  useQuery({
    queryKey: profileKeys.profile,
    queryFn: () => profileService.getProfile(),
    staleTime: 5 * 60 * 1000,
  });

export const useProfiles = () =>
  useQuery({
    queryKey: profileKeys.profiles,
    queryFn: () => profileService.listProfiles(),
    staleTime: 5 * 60 * 1000,
  });

export const useUpsertProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertProfileRequest) => profileService.upsertProfile(data),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useCreateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProfileRequest) => profileService.createProfile(data),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useSetActiveProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => profileService.setActiveProfile(id),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useRecommendations = (limit = 10) =>
  useQuery({
    queryKey: profileKeys.recommendations(limit),
    queryFn: () => profileService.getRecommendations(limit),
    staleTime: 2 * 60 * 1000,
  });
