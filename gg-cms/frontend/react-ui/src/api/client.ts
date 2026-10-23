import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './types';
import {
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from '@/config/api';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  // Auth is carried via the HttpOnly "jwt"/"refresh_token" cookies set by the backend.
  // withCredentials: true is required so the browser attaches them.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getCsrfTokenFromCookie = (): string | null => {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

// Request interceptor — attach the CSRF header (auth itself is the HttpOnly cookie)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken && config.headers) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshPromise: Promise<boolean> | null = null;

// One shared refresh for all concurrent 401s. The refresh token is an HttpOnly
// cookie, so there is nothing to read here; a session may exist only while the
// readable csrf_token cookie is present.
const refreshSession = (): Promise<boolean> => {
  if (!getCsrfTokenFromCookie()) return Promise.resolve(false);
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const isAuthEndpoint = (url?: string): boolean => !!url && url.startsWith('/auth/');

// Response interceptor — on 401 try one silent refresh, replay the request, and
// only signal logout (custom event handled by AuthContext) if that fails.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint(original.url)) {
      original._retry = true;
      if (await refreshSession()) {
        return apiClient(original);
      }
      if (!window.location.pathname.includes('/auth')) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

// ─── Session helpers ───────────────────────────────────────────────────────────
// The session lives in HttpOnly cookies. No token is ever stored in JS-accessible storage.

export const getAuthToken = (): string | null => null;

export const clearAuthToken = (): void => {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage unavailable
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
 * True while a session may exist (the readable CSRF cookie set at sign-in is present).
 * The server remains the source of truth.
 */
export const isAuthenticated = (): boolean => getCsrfTokenFromCookie() !== null;

export default apiClient;
