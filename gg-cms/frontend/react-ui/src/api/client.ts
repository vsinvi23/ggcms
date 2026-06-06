import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './types';
import {
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from '@/config/api';

// In-memory token cache for better performance and security.
// Token is primarily stored in sessionStorage but cached in memory for quick access.
let tokenCache: string | null = null;

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  // Auth is handled via the Authorization: Bearer header set by the request interceptor.
  // withCredentials: false prevents the browser from attaching session cookies to
  // cross-origin requests, eliminating a CSRF attack surface.
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token to every request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor — on 401, signal logout via a custom event.
// IMPORTANT: Never directly clear auth tokens here. The AuthContext listener
// (onForcedLogout) handles clearing, guarded by suppressAuthLogout so that a
// 401 from a non-critical endpoint (e.g. /users/:id/groups) during the post-login
// groups fetch does not log the user out before the dashboard even renders.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      // Only dispatch logout when the token is absent or expired.
      // A 401 on a permission-restricted endpoint with a still-valid token is a
      // permissions error — dispatching auth:logout would redirect to /auth incorrectly.
      if (!isAuthenticated()) {
        if (!window.location.pathname.includes('/auth')) {
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─── Token helpers ─────────────────────────────────────────────────────────────

export const setAuthToken = (token: string): void => {
  tokenCache = token;
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    console.warn('sessionStorage unavailable, using memory only');
  }
};

export const getAuthToken = (): string | null => {
  if (tokenCache) return tokenCache;
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      tokenCache = stored;
      return stored;
    }
  } catch {
    // sessionStorage unavailable
  }
  return null;
};

export const clearAuthToken = (): void => {
  tokenCache = null;
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
};

// ─── User data helpers ─────────────────────────────────────────────────────────

export const setUserData = (userData: object): void => {
  try {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
  } catch {
    console.warn('Failed to store user data');
  }
};

export const getUserData = <T>(): T | null => {
  try {
    const data = sessionStorage.getItem(USER_STORAGE_KEY);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
};

export const clearUserData = (): void => {
  try {
    sessionStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
};

// ─── Compound helpers ──────────────────────────────────────────────────────────

export const clearAllAuthData = (): void => {
  clearAuthToken();
  clearUserData();
};

/**
 * Returns true if a JWT is present and has not yet expired.
 * Does NOT verify the signature — that is the server's responsibility.
 */
export const isAuthenticated = (): boolean => {
  const token = getAuthToken();
  if (!token) return false;
  try {
    // JWT uses base64url encoding — replace url-safe chars before decoding.
    // Plain atob() throws on '-' and '_' which appear in most JWT payloads.
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      clearAuthToken();
      clearUserData();
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export default apiClient;
