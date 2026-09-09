import { apiClient } from '../client';
import { ApiResponse, TopicDto, TopicRelationshipDto, ContentTopicDto, TopicResolutionDto } from '../types';

export const topicService = {
  async getAll(): Promise<TopicDto[]> {
    const response = await apiClient.get<ApiResponse<TopicDto[]>>('/topics');
    return response.data.data || [];
  },

  async getById(id: number): Promise<TopicDto> {
    const response = await apiClient.get<ApiResponse<TopicDto>>(`/topics/${id}`);
    if (!response.data.data) {
      throw new Error('Topic not found');
    }
    return response.data.data;
  },

  async create(data: { name: string; entity_type?: string; description?: string }): Promise<TopicDto> {
    const response = await apiClient.post<ApiResponse<TopicDto>>('/topics', data);
    if (!response.data.data) {
      throw new Error('Failed to create topic');
    }
    return response.data.data;
  },

  async update(id: number, data: { name: string; entity_type?: string; description?: string }): Promise<TopicDto> {
    const response = await apiClient.put<ApiResponse<TopicDto>>(`/topics/${id}`, data);
    if (!response.data.data) {
      throw new Error('Failed to update topic');
    }
    return response.data.data;
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/topics/${id}`);
  },

  async getRelationships(topicId: number): Promise<TopicRelationshipDto[]> {
    const response = await apiClient.get<ApiResponse<TopicRelationshipDto[]>>(`/topics/${topicId}/relationships`);
    return response.data.data || [];
  },

  async setRelationships(topicId: number, relationships: TopicRelationshipDto[]): Promise<void> {
    await apiClient.put(`/topics/${topicId}/relationships`, { relationships });
  },

  async getContentTopics(contentId: number, contentType: string): Promise<TopicDto[]> {
    const response = await apiClient.get<ApiResponse<TopicDto[]>>(`/topics/content/${contentType}/${contentId}`);
    return response.data.data || [];
  },

  async setContentTopics(contentId: number, contentType: string, topicIds: number[]): Promise<void> {
    await apiClient.put(`/topics/content/${contentType}/${contentId}`, { topic_ids: topicIds });
  },

  async resolveTopic(rawName: string): Promise<TopicResolutionDto> {
    const response = await apiClient.get<ApiResponse<TopicResolutionDto>>(`/topics/resolve`, {
      params: { q: rawName },
    });
    if (!response.data.data) {
      return { status: 'NEW', confidence: 0, raw_input: rawName };
    }
    return response.data.data;
  },
};
