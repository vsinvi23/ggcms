import apiClient from '../client';
import type { UserProfileDto, UpsertProfileRequest, CreateProfileRequest, RecommendedItem } from '../types';

export const profileService = {
  getProfile: async (): Promise<UserProfileDto> => {
    const res = await apiClient.get('/personalization/profile');
    return res.data.data;
  },

  upsertProfile: async (data: UpsertProfileRequest): Promise<UserProfileDto> => {
    const res = await apiClient.put('/personalization/profile', data);
    return res.data.data;
  },

  listProfiles: async (): Promise<UserProfileDto[]> => {
    const res = await apiClient.get('/personalization/profiles');
    return res.data.data ?? [];
  },

  createProfile: async (data: CreateProfileRequest): Promise<UserProfileDto> => {
    const res = await apiClient.post('/personalization/profiles', data);
    return res.data.data;
  },

  setActiveProfile: async (id: number): Promise<UserProfileDto> => {
    const res = await apiClient.put(`/personalization/profiles/${id}/activate`);
    return res.data.data;
  },

  getRecommendations: async (limit = 10): Promise<RecommendedItem[]> => {
    const res = await apiClient.get('/personalization/recommendations', {
      params: { limit },
    });
    return res.data.data ?? [];
  },
};
