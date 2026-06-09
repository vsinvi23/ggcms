import axios from 'axios';
import { API_BASE_URL } from '@/config/api';

export interface FeatureFlags {
  learning_paths: boolean;
  interview_prep: boolean;
  social_login: boolean;
}

const publicClient = axios.create({ baseURL: API_BASE_URL });

export const featuresService = {
  async getFlags(): Promise<FeatureFlags> {
    const { data } = await publicClient.get<{ success: boolean; data: FeatureFlags }>('/features');
    return data.data;
  },
};
