import apiClient from '../client';

export interface ContentTypeDto {
  id: number;
  kind: string;
  value: string;
  label: string;
  description: string;
  sortOrder: number;
}

export interface ContentTypeCreateDto {
  kind: string;
  value: string;
  label: string;
  description?: string;
  sortOrder?: number;
}

export interface ContentTypeUpdateDto {
  label?: string;
  description?: string;
  sortOrder?: number;
}

export const contentTypeService = {
  getAll: async (kind: string): Promise<ContentTypeDto[]> => {
    const response = await apiClient.get('/content-types', { params: { kind } });
    return response.data.data ?? [];
  },

  create: async (data: ContentTypeCreateDto): Promise<ContentTypeDto> => {
    const response = await apiClient.post('/content-types', data);
    return response.data.data;
  },

  update: async (id: number, data: ContentTypeUpdateDto): Promise<ContentTypeDto> => {
    const response = await apiClient.put(`/content-types/${id}`, data);
    return response.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/content-types/${id}`);
  },
};
