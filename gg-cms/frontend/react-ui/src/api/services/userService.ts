import apiClient from '../client';
import { ApiResponse, UserDto, UserPagedResponse, GroupResponseDto } from '../types';
import { transformUser, transformGroup } from '../apiHelpers';

const USERS_BASE = '/users';

export interface UserQueryParams {
  page?: number;
  size?: number;
}

export const userService = {
  /**
   * Get paginated list of users
   * GET /users?page=0&size=10
   * Uses custom Strapi endpoint we created
   */
  getUsers: async (params?: UserQueryParams): Promise<UserPagedResponse> => {
    try {
      const response = await apiClient.get(USERS_BASE, {
        params: {
          page: params?.page ?? 0,
          size: params?.size ?? 10,
        },
      });
      
      // Response format: { data: [...users], meta: { pagination: {...} } }
      const users = response.data.data || [];
      const pagination = response.data.meta?.pagination || {};
      
      // Transform Strapi users to UI format
      const transformedUsers = users.map(transformUser);
      
      return {
        items: transformedUsers,
        totalElements: pagination.total || 0,
        currentPage: (pagination.page || 1) - 1, // Convert to 0-based
        pageSize: pagination.pageSize || 10,
      };
    } catch (error) {
      console.error('Failed to fetch users:', error);
      return { items: [], totalElements: 0, currentPage: 0, pageSize: 10 };
    }
  },

  /**
   * Get a single user by ID
   * GET /users/:id
   * Uses Strapi's built-in users-permissions endpoint
   */
  getUser: async (userId: number): Promise<UserDto> => {
    try {
      const response = await apiClient.get(`${USERS_BASE}/${userId}`);
      return transformUser(response.data);
    } catch (error) {
      throw new Error('Failed to fetch user');
    }
  },

  /**
   * Get groups for a user
   * GET /users/:id/groups
   * Uses custom endpoint we created
   */
  getUserGroups: async (userId: number): Promise<GroupResponseDto[]> => {
    try {
      const response = await apiClient.get(`${USERS_BASE}/${userId}/groups`);
      const groups = response.data.data || [];
      return groups.map(transformGroup);
    } catch (error) {
      console.error('Failed to fetch user groups:', error);
      return [];
    }
  },

  /**
   * Delete a user (admin only)
   * DELETE /users/:id
   * Uses Strapi's built-in users-permissions endpoint
   */
  deleteUser: async (userId: number): Promise<void> => {
    try {
      await apiClient.delete(`${USERS_BASE}/${userId}`);
    } catch (error) {
      throw new Error('Failed to delete user');
    }
  },

  /**
   * Deactivate a user (admin only)
   * POST /users/:id/deactivate
   * Uses custom endpoint we created
   */
  deactivateUser: async (userId: number): Promise<void> => {
    try {
      await apiClient.post(`${USERS_BASE}/${userId}/deactivate`);
    } catch (error) {
      throw new Error('Failed to deactivate user');
    }
  },

  /**
   * Activate a user (admin only)
   * POST /users/:id/activate
   * Uses custom endpoint we created
   */
  activateUser: async (userId: number): Promise<void> => {
    try {
      await apiClient.post(`${USERS_BASE}/${userId}/activate`);
    } catch (error) {
      throw new Error('Failed to activate user');
    }
  },

  /**
   * Create a new user (admin only)
   * POST /users
   */
  createUser: async (data: { name: string; email: string; password: string; groupId?: number }): Promise<UserDto> => {
    const response = await apiClient.post(USERS_BASE, data);
    return transformUser(response.data);
  },

  /**
   * Update a user
   * PUT /users/:id
   */
  updateUser: async (
    userId: number,
    data: { name?: string; mobileNo?: string; status?: string; groupId?: number },
  ): Promise<UserDto> => {
    const response = await apiClient.put(`${USERS_BASE}/${userId}`, data);
    return transformUser(response.data);
  },
};

export default userService;
