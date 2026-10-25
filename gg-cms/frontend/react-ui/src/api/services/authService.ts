import apiClient, { clearAuthToken, clearUserData } from '../client';
import { API_BASE_URL } from '@/config/api';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';

const AUTH_BASE = '/auth';

export type SocialProvider = 'google' | 'github' | 'linkedin';

export interface AuthProviderInfo {
  id: SocialProvider;
  name: string;
}

export interface ConnectedIdentity {
  provider: SocialProvider;
  email?: string;
  name?: string;
  linkedAt: string;
  lastLoginAt?: string;
}

export interface VerifyEmailResult {
  status: 'verified' | 'linked' | 'signed_up';
}

type ApiErrorBody = { message?: string; code?: string; error?: { message?: string } };

const errorBody = (error: unknown): ApiErrorBody | undefined =>
  (error as { response?: { data?: ApiErrorBody } })?.response?.data;

export const getErrorCode = (error: unknown): string | undefined => errorBody(error)?.code;

const errorMessage = (error: unknown, fallback: string): string => {
  const body = errorBody(error);
  return body?.message || body?.error?.message || fallback;
};

// Map a raw Go backend user object to the shape expected by AuthContext.
// Go returns role as a flat string ("admin" | "user"), not a nested object.
const mapGoUser = (u: Record<string, unknown>) => ({
  id: (u?.id as number | undefined) ?? 0,
  email: (u?.email as string | undefined) ?? '',
  name: (u?.name as string | undefined) || (u?.username as string | undefined) || '',
  username: u?.username as string | undefined,
  role: (u?.role as string | undefined) || 'user',
  roleType: (u?.role as string | undefined) || 'user',
  status: (u?.status as string | undefined) || 'ACTIVE',
  mobileNo: (u?.mobileNo as string | undefined) || '',
  groups: [] as string[],
  groupIds: [] as number[],
  blocked: false,
  confirmed: (u?.emailVerified as boolean | undefined) ?? false,
  emailVerified: (u?.emailVerified as boolean | undefined) ?? false,
  passwordSet: (u?.passwordSet as boolean | undefined) ?? true,
  avatarUrl: u?.avatarUrl as string | undefined,
  lastLogin: (u?.lastLogin as string | null | undefined) || null,
  createdAt: u?.createdAt as string | undefined,
  updatedAt: u?.updatedAt as string | undefined,
});

export const authService = {
  // The session is carried by HttpOnly cookies; the response body only contains the user.
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await apiClient.post(`${AUTH_BASE}/local`, {
        identifier: credentials.email,
        password: credentials.password,
      });
      return { token: '', user: mapGoUser(response.data.user) };
    } catch (error: unknown) {
      const e = error as Error & { response?: { status?: number } };
      if (e.response?.status === 401) throw error;
      throw new Error(errorMessage(error, 'Login failed'));
    }
  },

  // Registration never reveals whether the email exists and does not start a session;
  // the caller signs in afterwards.
  register: async (data: RegisterRequest): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/local/register`, {
        username: data.username || data.name?.replace(/\s+/g, '') || data.email.split('@')[0],
        email: data.email,
        password: data.password,
        name: data.name,
      });
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Registration failed'));
    }
  },

  getCurrentUser: async () => {
    try {
      const response = await apiClient.get('/users/me');
      const raw = response.data?.data ?? response.data;
      return mapGoUser(raw);
    } catch {
      throw new Error('Failed to get current user');
    }
  },

  forgotPassword: async (email: string) => {
    try {
      await apiClient.post(`${AUTH_BASE}/forgot-password`, { email });
      return { success: true, message: 'Password reset email sent' };
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Failed to send reset email'));
    }
  },

  resetPassword: async (code: string, password: string, passwordConfirmation: string) => {
    try {
      await apiClient.post(`${AUTH_BASE}/reset-password`, { code, password, passwordConfirmation });
      return { success: true, message: 'Password reset successful' };
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Failed to reset password'));
    }
  },

  // POST /users/me/password — revokes every other session; this device stays signed in.
  // For social-only accounts (no password yet) currentPassword may be empty and a recent login is required.
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    try {
      await apiClient.post('/users/me/password', { currentPassword, newPassword });
    } catch (error: unknown) {
      const err = new Error(errorMessage(error, 'Failed to change password')) as Error & { code?: string };
      err.code = getErrorCode(error);
      throw err;
    }
  },

  // Re-prove the password to refresh the "recent login" window (needed to link accounts).
  reauth: async (password: string): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/reauth`, { password });
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Incorrect password'));
    }
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/logout`);
    } catch {
      // best-effort — still clear client-side state
    }
    clearAuthToken();
    clearUserData();
  },

  logoutAll: async (): Promise<void> => {
    await apiClient.post(`${AUTH_BASE}/logout-all`);
    clearAuthToken();
    clearUserData();
  },

  verifyEmail: async (token: string): Promise<VerifyEmailResult> => {
    try {
      const response = await apiClient.post(`${AUTH_BASE}/email/verify`, { token });
      return (response.data?.data ?? response.data) as VerifyEmailResult;
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'This link is invalid or has expired.'));
    }
  },

  resendVerification: async (): Promise<void> => {
    await apiClient.post(`${AUTH_BASE}/email/resend`);
  },

  // ── Social login ──────────────────────────────────────────────────────────

  getProviders: async (): Promise<AuthProviderInfo[]> => {
    const response = await apiClient.get(`${AUTH_BASE}/providers`);
    const data = response.data?.data ?? response.data;
    return (data?.providers ?? []) as AuthProviderInfo[];
  },

  // Full-page navigation target; the backend answers with a 302 to the provider.
  getSocialStartUrl: (provider: SocialProvider, redirect?: string): string => {
    const q = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    return `${API_BASE_URL}${AUTH_BASE}/${provider}/start${q}`;
  },

  confirmLinkWithPassword: async (ticket: string, password: string): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/link/confirm`, { ticket, password });
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Could not confirm. Check your password and try again.'));
    }
  },

  sendLinkEmail: async (ticket: string): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/link/email`, { ticket });
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Could not send the email.'));
    }
  },

  submitSocialEmail: async (ticket: string, email: string): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/social/email`, { ticket, email });
    } catch (error: unknown) {
      throw new Error(errorMessage(error, 'Could not send the verification email.'));
    }
  },

  listIdentities: async (): Promise<ConnectedIdentity[]> => {
    const response = await apiClient.get('/users/me/identities');
    const data = response.data?.data ?? response.data;
    return (data?.identities ?? []) as ConnectedIdentity[];
  },

  // Returns the provider URL to navigate to. Throws an Error with .code === 'reauth_required'
  // when the login is older than 5 minutes.
  startLinkIdentity: async (provider: SocialProvider, redirect?: string): Promise<string> => {
    try {
      const response = await apiClient.post(`/users/me/identities/${provider}/link`, { redirect });
      const data = response.data?.data ?? response.data;
      return data.url as string;
    } catch (error: unknown) {
      const err = new Error(errorMessage(error, 'Could not start linking.')) as Error & { code?: string };
      err.code = getErrorCode(error);
      throw err;
    }
  },

  unlinkIdentity: async (provider: SocialProvider): Promise<void> => {
    try {
      await apiClient.delete(`/users/me/identities/${provider}`);
    } catch (error: unknown) {
      const err = new Error(errorMessage(error, 'Could not unlink this account.')) as Error & { code?: string };
      err.code = getErrorCode(error);
      throw err;
    }
  },
};

export default authService;
