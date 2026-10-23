import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { authService } from '@/api/services';
import type { SocialProvider } from '@/api/services/authService';
import { userService } from '@/api/services/userService';
import { toUserMessage } from '@/lib/errors';
import { profileService } from '@/api/services/profileService';
import { getVisitorProfile, clearVisitorProfile } from '@/lib/visitorProfile';
import {
  clearAllAuthData,
  setUserData,
} from '@/api/client';
import { UserStatus, GroupResponseDto } from '@/api/types';
import { ADMIN_GROUP_NAME, GROUPS_STORAGE_KEY } from '@/config/api';

interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar?: string;
  status: UserStatus;
  role: 'user' | 'admin';
  emailVerified?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isGroupsLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string, mobileNo?: string) => Promise<{ error?: string; info?: string }>;
  socialLogin: (provider: SocialProvider, redirect?: string) => Promise<{ error?: string }>;
  loginWithToken: (token?: string) => Promise<{ error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  canQuickEditPublic: boolean;
  userGroups: GroupResponseDto[];
  groupNames: string[];
  hasNoGroups: boolean;
  hasGroup: (groupName: string) => boolean;
  visitorProfileImported: boolean;
  clearVisitorImportFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultAuthContext: AuthContextType = {
  user: null,
  isLoading: true,
  isGroupsLoading: false,
  login: async () => ({ error: 'Auth not initialized' }),
  signup: async () => ({ error: 'Auth not initialized' }),
  socialLogin: async () => ({ error: 'Auth not initialized' }),
  loginWithToken: async () => ({ error: 'Auth not initialized' }),
  logout: () => {},
  isAuthenticated: false,
  isAdmin: false,
  isMasterAdmin: false,
  canQuickEditPublic: false,
  userGroups: [],
  groupNames: [],
  hasNoGroups: true,
  hasGroup: () => false,
  visitorProfileImported: false,
  clearVisitorImportFlag: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    console.warn('useAuth called outside AuthProvider - using default context');
    return defaultAuthContext;
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [userGroups, setUserGroups] = useState<GroupResponseDto[]>([]);
  const [visitorProfileImported, setVisitorProfileImported] = useState(false);

  const clearVisitorImportFlag = useCallback(() => setVisitorProfileImported(false), []);

  // Fire-and-forget: import visitor profile from localStorage after login.
  const importVisitorProfile = useCallback(() => {
    const vp = getVisitorProfile();
    if (!vp) return;
    clearVisitorProfile();
    profileService.upsertProfile({
      name: 'Default',
      experienceLevel: vp.experienceLevel,
      roleType: vp.roleType,
      learningGoals: vp.learningGoals ?? null,
      onboardingCompleted: true,
      interestedTagIds: vp.interestedTagIds,
      preferredCategoryIds: vp.preferredCategoryIds,
    }).then(() => {
      setVisitorProfileImported(true);
    }).catch(() => {
      // non-critical — silently ignore
    });
  }, []);

  // Fetch user groups from API and cache them
  const fetchUserGroups = useCallback(async (userId: number) => {
    if (!userId || userId <= 0) return;
    setIsGroupsLoading(true);
    try {
      const groups = await userService.getUserGroups(userId);
      setUserGroups(groups);
      // Groups are kept in memory only — not serialised to sessionStorage —
      // so they cannot be read by a script injected via XSS.
    } catch {
      setUserGroups([]);
    } finally {
      setIsGroupsLoading(false);
    }
  }, []);

  const clearUserGroups = useCallback(() => {
    setUserGroups([]);
  }, []);

  // Helper to check admin/superadmin role variations
  const isAdminRole = useCallback((roleStr?: string) => {
    if (!roleStr) return false;
    const r = roleStr.toLowerCase();
    return r === 'admin' || r === 'superadmin' || r === 'super_admin' || r === 'super-admin';
  }, []);

  // Listen for the 'auth:logout' event dispatched by the 401 Axios interceptor.
  // The JWT now lives in an HttpOnly cookie we cannot read client-side, so a 401
  // that reaches here (client.ts already filters out permission-only 401s) means
  // the session cookie is missing or expired — force logout.
  useEffect(() => {
    const onForcedLogout = () => {
      setUser(null);
      clearAllAuthData();
      clearUserGroups();
    };
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, [clearUserGroups]);

  // Check for existing session on mount by rehydrating from the backend
  // (the JWT lives in an HttpOnly cookie, so we ask the server who we are).
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await authService.getCurrentUser();
        const authUser: AuthUser = {
          id: userData?.id || 0,
          email: userData?.email || '',
          name: userData?.name || '',
          status: (userData?.status as UserStatus) || 'ACTIVE',
          role: isAdminRole(userData?.role) ? 'admin' : 'user',
          emailVerified: userData?.emailVerified,
        };
        if (authUser.id > 0) {
          setUser(authUser);
          setUserData(authUser);
          fetchUserGroups(authUser.id);
        }
      } catch {
        clearAllAuthData();
        if (import.meta.env.DEV) {
          const devUser: AuthUser = {
            id: 1,
            email: 'admin@gg-cms.local',
            name: 'Dev Admin',
            status: 'ACTIVE',
            role: 'admin',
          };
          setUser(devUser);
          setUserData(devUser);
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserGroups]);

  const handleLogout = useCallback(() => {
    authService.logout();
    setUser(null);
    clearAllAuthData();
    clearUserGroups();
  }, [clearUserGroups]);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      if (!email || !password) {
        return { error: 'Email and password are required' };
      }

      const response = await authService.login({ email, password });
      const respUser = response.user as {
        id?: number; email?: string; name?: string; username?: string;
        avatar?: string; blocked?: boolean; roleType?: string; role?: string; emailVerified?: boolean;
      } | undefined;

      if (respUser?.id) {
        const authUser: AuthUser = {
          id: respUser.id,
          email: respUser.email || email,
          name: respUser.name || respUser.username || email.split('@')[0],
          avatar: respUser.avatar,
          status: respUser.blocked ? 'DEACTIVATED' : 'ACTIVE' as UserStatus,
          role: (isAdminRole(respUser.roleType) || isAdminRole(respUser.role) ? 'admin' : 'user'),
          emailVerified: respUser.emailVerified,
        };

        // flushSync ensures state is committed before navigate('/dashboard') runs in caller
        flushSync(() => {
          setUser(authUser);
        });
        setUserData(authUser);
        fetchUserGroups(authUser.id);
        importVisitorProfile();
        return {};
      }

      return { error: 'Login failed. Please try again.' };
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (error.response?.status === 401 || error.response?.status === 400) {
        return { error: 'Invalid email or password' };
      }
      return { error: toUserMessage(err, 'Login failed. Please try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    mobileNo?: string
  ): Promise<{ error?: string; info?: string }> => {
    if (!email || !password || !name) {
      return { error: 'All fields are required' };
    }
    if (password.length < 12) {
      return { error: 'Password must be at least 12 characters' };
    }
    try {
      setIsLoading(true);
      await authService.register({
        name,
        email,
        password,
        mobileNo,
        username: email.split('@')[0],
      });
    } catch (err: unknown) {
      setIsLoading(false);
      return { error: toUserMessage(err, 'Signup failed. Please try again.') };
    }
    setIsLoading(false);

    // Registration is deliberately uniform (it never reveals whether the email already
    // exists), so sign in with the same credentials to start the session.
    const { error } = await login(email, password);
    if (error) {
      return { info: 'If this email can be used, we sent you a confirmation. Please sign in to continue.' };
    }
    return {};
  };

  const socialLogin = async (provider: SocialProvider, redirect?: string): Promise<{ error?: string }> => {
    // Full browser navigation: the backend 302s to the provider and the provider
    // returns to /auth/callback on the SPA with a fixed status or error code.
    window.location.href = authService.getSocialStartUrl(provider, redirect);
    return {};
  };

  // Called after the backend has set the session cookies (social callback, link
  // confirmation, emailed token): fetches the current user and hydrates context state.
  const loginWithToken = useCallback(async (): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      const userData = await authService.getCurrentUser();
      const authUser: AuthUser = {
        id: userData?.id || 0,
        email: userData?.email || '',
        name: userData?.name || '',
        status: (userData?.status as UserStatus) || 'ACTIVE',
        role: isAdminRole(userData?.role) ? 'admin' : 'user',
        emailVerified: userData?.emailVerified,
      };
      flushSync(() => setUser(authUser));
      setUserData(authUser);
      if (authUser.id > 0) {
        fetchUserGroups(authUser.id);
      }
      importVisitorProfile();
      return {};
    } catch {
      clearAllAuthData();
      return { error: 'Failed to complete sign-in. Please try again.' };
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserGroups, isAdminRole]);

  const groupNames = userGroups.map(g => g.name.toUpperCase());
  const adminGroupNames = [ADMIN_GROUP_NAME.toUpperCase(), 'ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'SUPER-ADMIN', 'MASTERADMIN', 'MASTER_ADMIN'];
  const masterAdminGroupNames = ['SUPERADMIN', 'SUPER_ADMIN', 'SUPER-ADMIN', 'MASTERADMIN', 'MASTER_ADMIN'];
  
  const isAdmin = isAdminRole(user?.role) || groupNames.some(g => adminGroupNames.includes(g));
  const isMasterAdmin = (user?.role && masterAdminGroupNames.includes(user.role.toUpperCase())) || groupNames.some(g => masterAdminGroupNames.includes(g));
  const hasGroupWithQuickEdit = userGroups.some(
    g => g.permissions?.publicQuickEdit?.enabled === true ||
         (g.permissions?.publicQuickEdit as { edit?: boolean } | undefined)?.edit === true ||
         (g.permissions as { publicQuickEdit?: unknown } | undefined)?.publicQuickEdit === true
  );
  const canQuickEditPublic = isMasterAdmin || hasGroupWithQuickEdit;
  
  const hasNoGroups = userGroups.length === 0;
  const hasGroup = useCallback(
    (groupName: string) => groupNames.includes(groupName.toUpperCase()),
    [groupNames]
  );

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isGroupsLoading,
        login,
        signup,
        socialLogin,
        loginWithToken,
        logout: handleLogout,
        isAuthenticated,
        isAdmin,
        isMasterAdmin,
        canQuickEditPublic,
        userGroups,
        groupNames,
        hasNoGroups,
        hasGroup,
        visitorProfileImported,
        clearVisitorImportFlag,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
