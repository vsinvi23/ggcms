import apiClient from '../client';
import { TaskDto, TaskCreateDto, TaskPagedResponse } from '../types';

const BASE = '/tasks';

function transformTask(item: any): TaskDto {
  const attrs = item.attributes ?? item;
  return {
    id: item.id,
    contentId: attrs.contentId ?? undefined,
    type: attrs.type,
    title: attrs.title,
    status: attrs.status,
    ownershipType: attrs.ownershipType,
    user: attrs.user?.data
      ? { id: attrs.user.data.id, ...attrs.user.data.attributes }
      : undefined,
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt,
  };
}

// Normalize plural type names sent by the UI ('articles'→'article', 'courses'→'course')
function normalizeType(t?: string): string | undefined {
  if (!t) return undefined;
  if (t === 'articles') return 'article';
  if (t === 'courses') return 'course';
  return t;
}

export const taskService = {
  async getTasks(params?: {
    type?: string;
    status?: string;
    ownershipType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<TaskPagedResponse> {
    const response = await apiClient.get(BASE, {
      params: {
        'filters[type][$eq]': normalizeType(params?.type),
        'filters[status][$eq]': params?.status,
        'filters[ownershipType][$eq]': params?.ownershipType,
        'pagination[page]': params?.page ?? 1,
        'pagination[pageSize]': params?.pageSize ?? 25,
        'populate[user][fields][0]': 'name',
        'populate[user][fields][1]': 'email',
      },
    });
    const { data, meta } = response.data;
    return {
      items: (data ?? []).map(transformTask),
      total: meta?.pagination?.total ?? 0,
      currentPage: meta?.pagination?.page ?? 1,
      pageSize: meta?.pagination?.pageSize ?? 25,
    };
  },

  async getTask(id: number): Promise<TaskDto> {
    const response = await apiClient.get(`${BASE}/${id}`);
    return transformTask(response.data.data);
  },

  async createTask(data: TaskCreateDto): Promise<TaskDto> {
    const response = await apiClient.post(BASE, { data });
    return transformTask(response.data.data);
  },

  async updateTask(id: number, data: Partial<TaskCreateDto>): Promise<TaskDto> {
    const response = await apiClient.put(`${BASE}/${id}`, { data });
    return transformTask(response.data.data);
  },

  async deleteTask(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`);
  },
};
