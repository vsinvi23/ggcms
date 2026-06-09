import apiClient from '../client';
import { TaskDto, TaskCreateDto, TaskPagedResponse } from '../types';

const BASE = '/tasks';

function transformTask(item: Record<string, unknown>): TaskDto {
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  const userField = attrs.user as Record<string, unknown> | undefined;
  const userData = userField?.data as Record<string, unknown> | undefined;
  const userAttrs = userData?.attributes as Record<string, unknown> | undefined;
  return {
    id: item.id as number,
    contentId: (attrs.contentId ?? undefined) as number | undefined,
    type: attrs.type as TaskDto['type'],
    title: attrs.title as string,
    status: attrs.status as string,
    ownershipType: attrs.ownershipType as TaskDto['ownershipType'],
    user: userData
      ? { id: userData.id as number, name: (userAttrs?.name ?? '') as string, email: (userAttrs?.email ?? '') as string }
      : undefined,
    createdAt: attrs.createdAt as string,
    updatedAt: attrs.updatedAt as string,
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
