import apiClient from '../client';
import type {
  ConsentInput,
  ConsentState,
  PrivacyRetentionDto,
  SelfProfile,
  SelfProfileUpdate,
  UserPreferences,
  UserPreferencesUpdate,
} from '../types';

const unwrap = <T>(body: { data?: T } | T): T => ((body as { data?: T })?.data ?? body) as T;

export const privacyService = {
  getRetention: async (): Promise<PrivacyRetentionDto> => unwrap((await apiClient.get('/privacy/retention')).data),

  getConsent: async (): Promise<ConsentState> => unwrap((await apiClient.get('/users/me/consent')).data),

  saveConsent: async (input: ConsentInput): Promise<ConsentState> =>
    unwrap((await apiClient.post('/users/me/consent', input)).data),

  getPreferences: async (): Promise<UserPreferences> => unwrap((await apiClient.get('/users/me/preferences')).data),

  updatePreferences: async (update: UserPreferencesUpdate): Promise<UserPreferences> =>
    unwrap((await apiClient.put('/users/me/preferences', update)).data),

  exportData: async (): Promise<Blob> =>
    (await apiClient.get('/users/me/export', { responseType: 'blob' })).data as Blob,

  deleteAccount: async (password?: string): Promise<void> => {
    await apiClient.delete('/users/me', { data: password ? { password } : {} });
  },

  updateMe: async (update: SelfProfileUpdate): Promise<SelfProfile> =>
    unwrap((await apiClient.put('/users/me', update)).data),

  unsubscribe: async (token: string): Promise<void> => {
    await apiClient.post('/notifications/unsubscribe', null, { params: { token } });
  },
};
