import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { authService } from '@/api/services';
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
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isGroupsLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string, mobileNo?: string) => Promise<{ error?: string }>;
  socialLogin: (provider: 'google' | 'github') => Promise<{ error?: string }>;
  loginWithToken: (token?: string) => Promise<{ error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
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
        const userData = await authService.getCurrentUser() as {
          id?: number; email?: string; name?: string; status?: string; role?: string;
        };
        const authUser: AuthUser = {
          id: userData?.id || 0,
          email: userData?.email || '',
          name: userData?.name || '',
          status: (userData?.status as UserStatus) || 'ACTIVE',
          role: isAdminRole(userData?.role) ? 'admin' : 'user',
        };
        if (authUser.id > 0) {
          setUser(authUser);
          setUserData(authUser);
          fetchUserGroups(authUser.id);
        }
      } catch {
        clearAllAuthData();
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

      if (response.token) {
        const respUser = response.user as {
          id?: number; email?: string; name?: string; username?: string;
          avatar?: string; blocked?: boolean; roleType?: string; role?: string;
        } | undefined;
        const authUser: AuthUser = {
          id: respUser?.id || 0,
          email: respUser?.email || email,
          name: respUser?.name || respUser?.username || email.split('@')[0],
          avatar: respUser?.avatar,
          status: respUser?.blocked ? 'DEACTIVATED' : 'ACTIVE' as UserStatus,
          role: (isAdminRole(respUser?.roleType) || isAdminRole(respUser?.role) ? 'admin' : 'user'),
        };

        // flushSync ensures state is committed before navigate('/dashboard') runs in caller
        flushSync(() => {
          setUser(authUser);
        });
        setUserData(authUser);
        if (authUser.id > 0) {
          fetchUserGroups(authUser.id);
        }
        importVisitorProfile();
        return {};
      }

      return { error: 'Login failed - no token received' };
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
  ): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      if (!email || !password || !name) {
        return { error: 'All fields are required' };
      }
      if (password.length < 6) {
        return { error: 'Password must be at least 6 characters' };
      }

      const response = await authService.register({
        name,
        email,
        password,
        mobileNo,
        username: email.split('@')[0],
      });

      if (response.token) {
        const respUser = response.user as {
          id?: number; email?: string; name?: string; role?: string; roleType?: string;
        } | undefined;
        const authUser: AuthUser = {
          id: respUser?.id || 0,
          email: respUser?.email || email,
          name: respUser?.name || name,
          status: 'ACTIVE' as UserStatus,
          role: (isAdminRole(respUser?.role) || isAdminRole(respUser?.roleType) ? 'admin' : 'user'),
        };

        flushSync(() => {
          setUser(authUser);
        });
        setUserData(authUser);
        if (authUser.id > 0) {
          fetchUserGroups(authUser.id);
        }
        importVisitorProfile();
        return {};
      }

      return { error: 'Registration failed - no token received' };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400) {
        const msg = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data;
        const detail = msg?.error?.message || msg?.message || '';
        if (detail.toLowerCase().includes('email') || detail.toLowerCase().includes('already')) {
          return { error: 'An account with this email already exists.' };
        }
        if (detail.toLowerCase().includes('username')) {
          return { error: 'This username is already taken.' };
        }
        return { error: 'Invalid registration details. Please check your input.' };
      }
      return { error: toUserMessage(err, 'Signup failed. Please try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  const socialLogin = async (provider: 'google' | 'github'): Promise<{ error?: string }> => {
    try {
      const url = await authService.getOAuthURL(provider);
      // Full browser redirect — the provider will call our backend callback which
      // in turn redirects to /auth/callback?token=... on the frontend.
      window.location.href = url;
      // This line is never reached (page navigates away), but we return {} to
      // satisfy the type signature so callers don't need a special case.
      return {};
    } catch {
      return { error: `Failed to start ${provider} sign-in. Please try again.` };
    }
  };

  // Called by OAuthCallback page after the backend redirects back — the JWT is
  // already set as an HttpOnly cookie server-side, so this just confirms the
  // session by fetching the current user and hydrating context state.
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
  const adminGroupNames = [ADMIN_GROUP_NAME.toUpperCase(), 'ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'SUPER-ADMIN'];
  // isAdmin: primary check is role stored on user object (from JWT/login response),
  // supplemented by group membership check so either alone is sufficient
  const isAdmin = isAdminRole(user?.role) || groupNames.some(g => adminGroupNames.includes(g));
  const hasNoGroups = userGroups.length === 0;
  const hasGroup = useCallback(
    (groupName: string) => groupNames.includes(groupName.toUpperCase()),
    [groupNames]
  );

  // React user state is the single source of truth for authentication.
  // Token expiry is handled by the setTimeout useEffect above (calls handleLogout).
  // The 401 interceptor + onForcedLogout handle external invalidation.
  // Re-checking the JWT on every render via checkIsAuthenticated() is redundant
  // and fragile — a transient sessionStorage read failure or JWT decode error
  // would redirect the user to /auth even with a fully valid session.
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
