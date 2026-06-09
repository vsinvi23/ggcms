import apiClient from '../client';
import { ApiResponse, GroupCreateDto, GroupResponseDto, GroupPagedResponse, GroupUserDto } from '../types';
import { transformGroup, transformUser } from '../apiHelpers';

const GROUPS_BASE = '/user-groups';

export interface GroupQueryParams {
  page?: number;
  size?: number;
}

export interface AddMemberRequest {
  userId: number;
}

export const groupService = {
  /**
   * Get paginated list of groups
   * GET /user-groups?pagination[page]=1&pagination[pageSize]=10
   * Uses Strapi's standard endpoint
   */
  getGroups: async (params?: GroupQueryParams): Promise<GroupPagedResponse> => {
    try {
      const response = await apiClient.get(GROUPS_BASE, {
        params: {
          'pagination[page]': (params?.page ?? 0) + 1, // Convert to 1-based
          'pagination[pageSize]': params?.size ?? 10,
          populate: 'members',
        },
      });
      
      const groups = response.data.data || [];
      const pagination = response.data.meta?.pagination || {};
      
      const transformedGroups = groups.map(transformGroup);
      
      return {
        items: transformedGroups,
        totalElements: pagination.total || 0,
        currentPage: (pagination.page || 1) - 1, // Convert to 0-based
        pageSize: pagination.pageSize || 10,
      };
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      return { items: [], totalElements: 0, currentPage: 0, pageSize: 10 };
    }
  },

  /**
   * Get a single group by ID
   * GET /user-groups/:id?populate=members
   */
  getGroup: async (id: number): Promise<GroupResponseDto> => {
    try {
      const response = await apiClient.get(`${GROUPS_BASE}/${id}`, {
        params: { populate: 'members' },
      });
      return transformGroup(response.data.data);
    } catch (error) {
      throw new Error('Failed to fetch group');
    }
  },

  /**
   * Create a new group (admin only)
   * POST /user-groups
   */
  createGroup: async (data: GroupCreateDto): Promise<GroupResponseDto> => {
    try {
      const response = await apiClient.post(GROUPS_BASE, { data });
      return transformGroup(response.data.data);
    } catch (error) {
      throw new Error('Failed to create group');
    }
  },

  /**
   * Update a group (admin only)
   * PUT /user-groups/:id
   */
  updateGroup: async (id: number, data: GroupCreateDto): Promise<GroupResponseDto> => {
    try {
      const response = await apiClient.put(`${GROUPS_BASE}/${id}`, { data });
      return transformGroup(response.data.data);
    } catch (error) {
      throw new Error('Failed to update group');
    }
  },

  /**
   * Delete a group (admin only)
   * DELETE /user-groups/:id
   */
  deleteGroup: async (id: number): Promise<void> => {
    try {
      await apiClient.delete(`${GROUPS_BASE}/${id}`);
    } catch (error) {
      throw new Error('Failed to delete group');
    }
  },

  /**
   * Get members of a group
   * GET /user-groups/:id/members
   * Uses our custom endpoint
   */
  getGroupMembers: async (groupId: number): Promise<GroupUserDto[]> => {
    try {
      const response = await apiClient.get(`${GROUPS_BASE}/${groupId}/members`);
      const members = response.data.data || [];
      return members.map(transformUser);
    } catch (error) {
      console.error('Failed to fetch group members:', error);
      return [];
    }
  },

  /**
   * Add a member to a group (admin only)
   * POST /user-groups/:id/members
   * Uses our custom endpoint
   */
  addGroupMember: async (groupId: number, userId: number): Promise<void> => {
    try {
      await apiClient.post(`${GROUPS_BASE}/${groupId}/members`, { userId });
    } catch (error) {
      throw new Error('Failed to add member to group');
    }
  },

  /**
   * Remove a member from a group (admin only)
   * DELETE /user-groups/:id/members/:userId
   * Uses our custom endpoint
   */
  removeGroupMember: async (groupId: number, userId: number): Promise<void> => {
    try {
      await apiClient.delete(`${GROUPS_BASE}/${groupId}/members/${userId}`);
    } catch (error) {
      throw new Error('Failed to remove member from group');
    }
  },
};

export default groupService;
