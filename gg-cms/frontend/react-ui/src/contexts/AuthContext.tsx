import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { authService } from '@/api/services';
import { userService } from '@/api/services/userService';
import { toUserMessage } from '@/lib/errors';
import { profileService } from '@/api/services/profileService';
import { getVisitorProfile, clearVisitorProfile } from '@/lib/visitorProfile';
import {
  getAuthToken,
  setAuthToken,
  clearAllAuthData,
  setUserData,
  getUserData,
  isAuthenticated as checkStoredToken,
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
  loginWithToken: (token: string) => Promise<{ error?: string }>;
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

// Helper to decode JWT and extract user info
const decodeToken = (token: string): { sub?: string; email?: string; userId?: number; role?: string; exp?: number } | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

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

  // Stores the token expiry so onForcedLogout can check it even after the old axios
  // interceptor (pre-HMR) has already cleared the token from sessionStorage.
  const tokenExpiryRef = useRef<number | null>(null);

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

  // Keep tokenExpiryRef in sync with the active session.
  // This must run whenever user changes so the ref reflects the latest expiry.
  useEffect(() => {
    if (!user) {
      tokenExpiryRef.current = null;
      return;
    }
    const token = getAuthToken();
    if (token) {
      const decoded = decodeToken(token);
      tokenExpiryRef.current = decoded?.exp ?? null;
    }
  }, [user]);

  // Listen for the 'auth:logout' event dispatched by the 401 Axios interceptor.
  // CRITICAL: The old pre-HMR interceptor clears the token BEFORE dispatching this
  // event, so checkIsAuthenticated() would return false even for valid sessions.
  // Instead we check tokenExpiryRef which is set when the user logs in and persists
  // in memory even after sessionStorage is cleared by the old interceptor.
  useEffect(() => {
    const onForcedLogout = () => {
      const expiry = tokenExpiryRef.current;
      if (expiry && Date.now() < expiry * 1000) {
        // Token was still valid when this fired → permissions error, not auth failure.
        // Do NOT log the user out.
        return;
      }
      // Token expired or no session → real auth failure, force logout.
      setUser(null);
      clearAllAuthData();
      clearUserGroups();
    };
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, [clearUserGroups]);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (checkStoredToken()) {
        const storedUser = getUserData<AuthUser>();
        if (storedUser) {
          setUser(storedUser);
          // Groups are memory-only (not cached in sessionStorage) to prevent
          // XSS payloads from reading permission data via sessionStorage.
          fetchUserGroups(storedUser.id);
        } else {
          clearAllAuthData();
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [fetchUserGroups]);

  // Auto-logout when JWT expires
  useEffect(() => {
    if (!user) return;
    const token = getAuthToken();
    if (!token) return;
    const decoded = decodeToken(token);
    if (!decoded?.exp) return;

    const timeUntilExpiry = decoded.exp * 1000 - Date.now();
    if (timeUntilExpiry <= 0) {
      handleLogout();
      return;
    }
    const timer = setTimeout(() => handleLogout(), timeUntilExpiry);
    return () => clearTimeout(timer);
  }, [user]);

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
        const authUser: AuthUser = {
          id: response.user?.id || 0,
          email: response.user?.email || email,
          name: response.user?.name || response.user?.username || email.split('@')[0],
          avatar: response.user?.avatar,
          status: response.user?.blocked ? 'DEACTIVATED' : 'ACTIVE' as UserStatus,
          role: response.user?.roleType === 'admin' || response.user?.role === 'admin' ? 'admin' : 'user',
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
        const authUser: AuthUser = {
          id: response.user?.id || 0,
          email: response.user?.email || email,
          name: response.user?.name || name,
          status: 'ACTIVE' as UserStatus,
          role: (response.user?.role === 'admin' ? 'admin' : 'user'),
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

  // Called by OAuthCallback page after the backend redirects back with a JWT.
  // Stores the token, fetches the full user profile, and hydrates context state.
  const loginWithToken = useCallback(async (token: string): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      setAuthToken(token);
      const decoded = decodeToken(token);
      const userData = await authService.getCurrentUser();
      const authUser: AuthUser = {
        id: userData?.id || decoded?.userId || 0,
        email: userData?.email || decoded?.email || '',
        name: userData?.name || '',
        status: (userData?.status as UserStatus) || 'ACTIVE',
        role: (decoded?.role as 'admin' | 'user') || 'user',
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
  }, [fetchUserGroups]);

  const groupNames = userGroups.map(g => g.name.toUpperCase());
  // isAdmin: primary check is role stored on user object (from JWT/login response),
  // supplemented by group membership check so either alone is sufficient
  const isAdmin = user?.role === 'admin' || groupNames.includes(ADMIN_GROUP_NAME.toUpperCase());
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
