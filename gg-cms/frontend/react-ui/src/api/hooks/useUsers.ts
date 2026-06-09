import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService, UserQueryParams } from '../services/userService';
import { UserResponse, UserDto, GroupResponseDto } from '../types';
import { AxiosError } from 'axios';

// Query keys
export const userKeys = {
  all: ['users'] as const,
  list: (params?: UserQueryParams) => [...userKeys.all, 'list', params] as const,
  detail: (id: number) => [...userKeys.all, 'detail', id] as const,
  groups: (id: number) => [...userKeys.all, 'groups', id] as const,
};

/**
 * Hook to create a new user (admin only)
 */
export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; groupId?: number }) =>
      userService.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

/**
 * Hook to update a user (admin only)
 */
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: number;
      data: { name?: string; mobileNo?: string; status?: string; groupId?: number };
    }) => userService.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

/**
 * Hook to delete a user (admin only)
 */
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => userService.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

/**
 * Hook to deactivate a user (admin only)
 */
export const useDeactivateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => userService.deactivateUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

/**
 * Hook to activate a user (admin only)
 */
export const useActivateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => userService.activateUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};

// Helper to map UserDto to UserResponse for backwards compatibility
function mapUserDtoToResponse(dto: UserDto): UserResponse {
  return {
    id: String(dto.id),
    name: dto.name,
    email: dto.email,
    status: dto.status as UserResponse['status'],
    lastLogin: dto.lastLogin,
    createdAt: dto.createdAt,
    mobileNo: dto.mobileNo,
    groups: dto.groups,
  };
}

/**
 * Hook to fetch paginated users (React Query)
 */
export const useUsersQuery = (params?: UserQueryParams, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => userService.getUsers(params),
    enabled: options?.enabled !== false,
  });
};

/**
 * Hook to fetch a single user by ID (React Query)
 */
export const useUserQuery = (id: number, enabled = true) => {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => userService.getUser(id),
    enabled: enabled && id > 0,
  });
};

/**
 * Hook to fetch groups for a user (React Query)
 */
export const useUserGroups = (userId: number, enabled = true) => {
  return useQuery({
    queryKey: userKeys.groups(userId),
    queryFn: () => userService.getUserGroups(userId),
    enabled: enabled && userId > 0,
  });
};

interface UseUsersReturn {
  users: UserResponse[];
  totalElements: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  fetchUsers: (params?: UserQueryParams) => Promise<void>;
  getUser: (userId: string) => Promise<UserResponse | null>;
  clearError: () => void;
}

export const useUsers = (): UseUsersReturn => {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (params?: UserQueryParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await userService.getUsers(params);
      setUsers(data.items.map(mapUserDtoToResponse));
      const total = data.total ?? data.totalElements ?? 0;
      setTotalElements(total);
      setTotalPages(Math.ceil(total / (params?.size || 10)));
      setCurrentPage(data.currentPage ?? 0);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUser = useCallback(async (userId: string): Promise<UserResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const dto = await userService.getUser(parseInt(userId));
      return mapUserDtoToResponse(dto);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to fetch user');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    users,
    totalElements,
    totalPages,
    currentPage,
    isLoading,
    error,
    fetchUsers,
    getUser,
    clearError,
  };
};

export default useUsers;
