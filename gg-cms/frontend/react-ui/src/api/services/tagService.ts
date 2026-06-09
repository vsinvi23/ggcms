import apiClient from '../client';
import { TagDto } from '../types';

const BASE = '/tags';

export const tagService = {
  async getAll(): Promise<TagDto[]> {
    const response = await apiClient.get(BASE);
    return response.data.data ?? response.data ?? [];
  },

  async create(name: string): Promise<TagDto> {
    const response = await apiClient.post(BASE, { name: name.toLowerCase().trim() });
    return response.data.data ?? response.data;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },

  async getCategoryTags(categoryId: number): Promise<TagDto[]> {
    const response = await apiClient.get(`/categories/${categoryId}/tags`);
    return response.data.data ?? response.data ?? [];
  },

  async setCategoryTags(categoryId: number, tagIds: number[]): Promise<void> {
    await apiClient.put(`/categories/${categoryId}/tags`, { tagIds });
  },
};
