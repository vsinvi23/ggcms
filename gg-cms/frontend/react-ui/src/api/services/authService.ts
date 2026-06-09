import apiClient, { setAuthToken, clearAuthToken, clearUserData } from '../client';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';

// Go backend uses /auth endpoints
const AUTH_BASE = '/auth';

// Map a raw Go backend user object to the shape expected by AuthContext.
// Go returns role as a flat string ("admin" | "user"), not a nested object.
const mapGoUser = (u: Record<string, unknown>) => ({
  id: u?.id,
  email: u?.email,
  name: u?.name || u?.username,
  username: u?.username,
  role: u?.role || 'user',
  roleType: u?.role || 'user',
  status: u?.status || 'ACTIVE',
  mobileNo: u?.mobileNo || '',
  groups: [],
  groupIds: [],
  blocked: false,
  confirmed: true,
  lastLogin: u?.lastLogin || null,
  createdAt: u?.createdAt,
  updatedAt: u?.updatedAt,
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
      const e = error as { response?: { data?: { error?: { message?: string } } } };
      throw new Error(e.response?.data?.error?.message || 'Failed to send reset email');
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
      const e = error as { response?: { data?: { error?: { message?: string } } } };
      throw new Error(e.response?.data?.error?.message || 'Failed to reset password');
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
   * Logout - clear stored token
   */
  logout: (): void => {
    clearAuthToken();
    clearUserData();
  },
};

export default authService;
