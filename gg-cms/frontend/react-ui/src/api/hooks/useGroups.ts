import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupService, GroupQueryParams } from '../services/groupService';
import { GroupCreateDto, GroupResponseDto, GroupUserDto } from '../types';
import { AxiosError } from 'axios';

// Query keys
export const groupKeys = {
  all: ['groups'] as const,
  list: (params?: GroupQueryParams) => [...groupKeys.all, 'list', params] as const,
  detail: (id: number) => [...groupKeys.all, 'detail', id] as const,
  members: (id: number) => [...groupKeys.all, 'members', id] as const,
};

/**
 * Hook to fetch paginated groups (React Query)
 */
export const useGroupsQuery = (params?: GroupQueryParams) => {
  return useQuery({
    queryKey: groupKeys.list(params),
    queryFn: () => groupService.getGroups(params),
  });
};

/**
 * Hook to fetch a single group by ID
 */
export const useGroup = (id: number, enabled = true) => {
  return useQuery({
    queryKey: groupKeys.detail(id),
    queryFn: () => groupService.getGroup(id),
    enabled: enabled && id > 0,
  });
};

/**
 * Hook to fetch members of a group
 */
export const useGroupMembers = (groupId: number, enabled = true) => {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    queryFn: () => groupService.getGroupMembers(groupId),
    enabled: enabled && groupId > 0,
  });
};

/**
 * Hook to create a new group (admin only)
 */
export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: GroupCreateDto) => groupService.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
};

/**
 * Hook to update a group (admin only)
 */
export const useUpdateGroup = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: GroupCreateDto }) => 
      groupService.updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
};

/**
 * Hook to delete a group (admin only)
 */
export const useDeleteGroup = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => groupService.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
};

/**
 * Hook to add a member to a group (admin only)
 */
export const useAddGroupMember = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) => 
      groupService.addGroupMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
};

/**
 * Hook to remove a member from a group (admin only)
 */
export const useRemoveGroupMember = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) => 
      groupService.removeGroupMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
};

// Legacy compatibility interface
interface LegacyGroupResponse {
  id: string;
  name: string;
  description: string | null;
  members?: Array<{ id: string; name: string; email: string; createdAt: string }>;
}

interface UseGroupsReturn {
  groups: LegacyGroupResponse[];
  isLoading: boolean;
  error: string | null;
  fetchGroups: () => Promise<void>;
  getGroup: (groupId: string) => Promise<LegacyGroupResponse | null>;
  createGroup: (data: GroupCreateDto) => Promise<LegacyGroupResponse | null>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  clearError: () => void;
}

// Convert new DTO to legacy format
const mapToLegacy = (dto: GroupResponseDto): LegacyGroupResponse => ({
  id: String(dto.id),
  name: dto.name,
  description: null,
  members: dto.users?.map(u => ({
    id: String(u.id),
    name: u.name,
    email: u.email,
    createdAt: new Date().toISOString(),
  })) || [],
});

/**
 * Legacy hook for backward compatibility
 */
export const useGroups = (): UseGroupsReturn => {
  const [groups, setGroups] = useState<LegacyGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await groupService.getGroups();
      setGroups(data.items.map(mapToLegacy));
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to fetch groups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getGroup = useCallback(async (groupId: string): Promise<LegacyGroupResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await groupService.getGroup(parseInt(groupId));
      return mapToLegacy(result);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to fetch group');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGroup = useCallback(async (data: GroupCreateDto): Promise<LegacyGroupResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await groupService.createGroup(data);
      const legacy = mapToLegacy(result);
      setGroups(prev => [...prev, legacy]);
      return legacy;
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to create group');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteGroup = useCallback(async (groupId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await groupService.deleteGroup(parseInt(groupId));
      setGroups(prev => prev.filter(g => g.id !== groupId));
      return true;
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'Failed to delete group');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    groups,
    isLoading,
    error,
    fetchGroups,
    getGroup,
    createGroup,
    deleteGroup,
    clearError,
  };
};

export default useGroups;
