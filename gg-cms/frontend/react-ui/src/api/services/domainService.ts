import apiClient from '../client';
import { ApiResponse, DomainDto } from '../types';

export const domainService = {
  async getAll(): Promise<DomainDto[]> {
    const response = await apiClient.get<ApiResponse<DomainDto[]>>('/domains');
    return response.data.data || [];
  },
};
