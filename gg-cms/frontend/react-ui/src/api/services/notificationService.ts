import apiClient from '../client';
import { NotificationDto, NotificationPagedResponse } from '../types';

const BASE = '/notifications';

function transformNotification(item: any): NotificationDto {
  const attrs = item.attributes ?? item;
  return {
    id: item.id,
    title: attrs.title,
    message: attrs.message,
    read: attrs.read ?? false,
    link: attrs.link ?? null,
    createdAt: attrs.createdAt,
  };
}

export const notificationService = {
  async getNotifications(params?: {
    read?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<NotificationPagedResponse> {
    const queryParams: Record<string, any> = {
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
