import apiClient from '../client';
import { NotificationDto, NotificationPagedResponse } from '../types';

const BASE = '/notifications';

function transformNotification(item: Record<string, unknown>): NotificationDto {
  const attrs = (item.attributes ?? item) as Record<string, unknown>;
  return {
    id: item.id as number,
    title: attrs.title as string,
    message: attrs.message as string,
    read: (attrs.read ?? false) as boolean,
    link: (attrs.link ?? null) as string | null,
    createdAt: attrs.createdAt as string,
  };
}

export const notificationService = {
  async getNotifications(params?: {
    read?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<NotificationPagedResponse> {
    const queryParams: Record<string, unknown> = {
      'pagination[page]': params?.page ?? 1,
      'pagination[pageSize]': params?.pageSize ?? 50,
      sort: 'createdAt:desc',
    };
    if (params?.read !== undefined) {
      queryParams['filters[read][$eq]'] = params.read;
    }
    const response = await apiClient.get(BASE, { params: queryParams });
    const { data, meta } = response.data;
    return {
      items: (data ?? []).map(transformNotification),
      total: meta?.pagination?.total ?? 0,
      currentPage: meta?.pagination?.page ?? 1,
      pageSize: meta?.pagination?.pageSize ?? 50,
    };
  },

  async markRead(id: number): Promise<void> {
    await apiClient.patch(`${BASE}/${id}/read`, {});
  },

  async markAllRead(): Promise<void> {
    await apiClient.patch(`${BASE}/read-all`, {});
  },
};
