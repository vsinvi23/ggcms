const trimSlash = (s: string) => s.replace(/\/+$/, '');

if (!import.meta.env.VITE_API_BASE_URL && import.meta.env.PROD) {
  throw new Error('[config] VITE_API_BASE_URL must be set for production builds.');
}

export const API_BASE_URL = trimSlash(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
);

// Base server URL (without /api) — used to resolve relative media paths from the backend.
export const MEDIA_BASE_URL = trimSlash(API_BASE_URL.replace(/\/api$/, ''));

export const ADMIN_GROUP_NAME = import.meta.env.VITE_ADMIN_GROUP_NAME || 'Admin';

export const TOKEN_STORAGE_KEY = 'authToken';
export const USER_STORAGE_KEY = 'auth_user';
export const GROUPS_STORAGE_KEY = 'user_groups_cache';

export const ENABLE_REGISTRATION = import.meta.env.VITE_ENABLE_REGISTRATION !== 'false';
export const ENABLE_SOCIAL_LOGIN = import.meta.env.VITE_ENABLE_SOCIAL_LOGIN === 'true';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'CMS';
export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development';
