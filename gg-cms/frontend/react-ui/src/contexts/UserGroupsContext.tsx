import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { userService } from '@/api/services/userService';
import { GroupResponseDto } from '@/api/types';

// Cache keys
const GROUPS_CACHE_KEY = 'user_groups_cache';

interface UserGroupsContextType {
  groups: GroupResponseDto[];
  isLoading: boolean;
  isAdmin: boolean;
  hasNoGroups: boolean;
  groupNames: string[];
  fetchUserGroups: (userId: number) => Promise<void>;
  clearGroups: () => void;
  hasGroup: (groupName: string) => boolean;
}

const UserGroupsContext = createContext<UserGroupsContextType | undefined>(undefined);

// Default context for when provider isn't available
const defaultContext: UserGroupsContextType = {
  groups: [],
  isLoading: false,
  isAdmin: false,
  hasNoGroups: true,
  groupNames: [],
  fetchUserGroups: async () => {},
  clearGroups: () => {},
  hasGroup: () => false,
};

export const useUserGroups = () => {
  const context = useContext(UserGroupsContext);
  if (!context) {
    console.warn('useUserGroups called outside UserGroupsProvider - using default context');
    return defaultContext;
  }
  return context;
};

interface UserGroupsProviderProps {
  children: ReactNode;
}

export const UserGroupsProvider: React.FC<UserGroupsProviderProps> = ({ children }) => {
  const [groups, setGroups] = useState<GroupResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load from cache on mount
  useEffect(() => {
    const cached = sessionStorage.getItem(GROUPS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setGroups(parsed);
      } catch {
        sessionStorage.removeItem(GROUPS_CACHE_KEY);
      }
    }
  }, []);

  // Fetch user groups from API and cache them
  const fetchUserGroups = useCallback(async (userId: number) => {
    if (!userId || userId <= 0) return;
    
    setIsLoading(true);
    try {
      const userGroups = await userService.getUserGroups(userId);
      setGroups(userGroups);
      // Cache in sessionStorage
      sessionStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(userGroups));
    } catch (error) {
      console.error('Failed to fetch user groups:', error);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear groups (on logout)
  const clearGroups = useCallback(() => {
    setGroups([]);
    sessionStorage.removeItem(GROUPS_CACHE_KEY);
  }, []);

  // Get group names for easy checking
  const groupNames = groups.map(g => g.name.toUpperCase());

  // Check if user is in ADMIN group
  const isAdmin = groupNames.includes('ADMIN');

  // Check if user has no groups
  const hasNoGroups = groups.length === 0;

  // Check if user has a specific group
  const hasGroup = useCallback((groupName: string) => {
    return groupNames.includes(groupName.toUpperCase());
  }, [groupNames]);

  return (
    <UserGroupsContext.Provider
      value={{
        groups,
        isLoading,
        isAdmin,
        hasNoGroups,
        groupNames,
        fetchUserGroups,
        clearGroups,
        hasGroup,
      }}
    >
      {children}
    </UserGroupsContext.Provider>
  );
};
