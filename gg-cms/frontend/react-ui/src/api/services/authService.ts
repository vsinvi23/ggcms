import apiClient, { setAuthToken, clearAuthToken, clearUserData } from '../client';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';

// Go backend uses /auth endpoints
const AUTH_BASE = '/auth';

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
  confirmed: true,
  lastLogin: (u?.lastLogin as string | null | undefined) || null,
  createdAt: u?.createdAt as string | undefined,
  updatedAt: u?.updatedAt as string | undefined,
});

export const authService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await apiClient.post(`${AUTH_BASE}/local`, {
        identifier: credentials.email,
        password: credentials.password,
      });
      
      // Strapi returns { jwt, user } directly (not wrapped in ApiResponse)
      const { jwt, user } = response.data;
      
      if (jwt) {
        setAuthToken(jwt);
      }
      
      return {
        token: jwt,
        user: mapGoUser(user),
      };
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string; error?: { message?: string } } } };
      throw new Error(e.response?.data?.message || e.response?.data?.error?.message || 'Login failed');
    }
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    try {
      const response = await apiClient.post(`${AUTH_BASE}/local/register`, {
        username: data.username || data.name?.replace(/\s+/g, '') || data.email.split('@')[0],
        email: data.email,
        password: data.password,
        name: data.name,
      });

      const { jwt, user } = response.data;

      if (jwt) {
        setAuthToken(jwt);
      }

      return {
        token: jwt,
        user: mapGoUser(user),
      };
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string; error?: { message?: string } } }; message?: string };
      console.error('Registration error:', e.response?.data);
      throw new Error(
        e.response?.data?.message || e.response?.data?.error?.message || e.message || 'Registration failed',
      );
    }
  },

  /**
   * Get current authenticated user
   * GET /users/me
   * Requires authentication token
   */
  getCurrentUser: async () => {
    try {
      const response = await apiClient.get('/users/me');
      // Go wraps the response in { success, data }; unwrap it.
      const raw = response.data?.data ?? response.data;
      return mapGoUser(raw);
    } catch (error) {
      throw new Error('Failed to get current user');
    }
  },

  /**
   * Forgot password - request reset
   * POST /auth/forgot-password
   */
  forgotPassword: async (email: string) => {
    try {
      await apiClient.post(`${AUTH_BASE}/forgot-password`, { email });
      return { success: true, message: 'Password reset email sent' };
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string; error?: { message?: string } } } };
      throw new Error(e.response?.data?.message || e.response?.data?.error?.message || 'Failed to send reset email');
    }
  },

  /**
   * Reset password with code
   * POST /auth/reset-password
   */
  resetPassword: async (code: string, password: string, passwordConfirmation: string) => {
    try {
      await apiClient.post(`${AUTH_BASE}/reset-password`, {
        code,
        password,
        passwordConfirmation,
      });
      return { success: true, message: 'Password reset successful' };
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string; error?: { message?: string } } } };
      throw new Error(e.response?.data?.message || e.response?.data?.error?.message || 'Failed to reset password');
    }
  },

  /**
   * Get the OAuth provider redirect URL.
   * GET /auth/{provider} → { url: string }
   * The caller should do window.location.href = url to start the OAuth flow.
   */
  getOAuthURL: async (provider: 'google' | 'github'): Promise<string> => {
    const response = await apiClient.get(`${AUTH_BASE}/${provider}`);
    return response.data.url as string;
  },

  /**
   * Logout - clear the backend session cookie and stored token
   */
  logout: async (): Promise<void> => {
    try {
      await apiClient.post(`${AUTH_BASE}/logout`);
    } catch {
      // best-effort — still clear client-side state
    }
    clearAuthToken();
    clearUserData();
  },
};

export default authService;
