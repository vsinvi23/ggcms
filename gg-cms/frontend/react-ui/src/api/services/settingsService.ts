import apiClient from '../client';

export interface StorageSettings {
  'storage.provider': 'local' | 's3';
  'storage.local.upload_dir': string;
  'storage.local.base_url': string;
  'storage.s3.bucket': string;
  'storage.s3.region': string;
  'storage.s3.access_key': string;
  'storage.s3.secret_key': string;
  'storage.s3.endpoint': string;
  'storage.s3.public_url': string;
  'upload.max_size_mb': string;
  'upload.allowed_types': string;
  [key: string]: string;
}

export const settingsService = {
  async getAll(): Promise<StorageSettings> {
    const { data } = await apiClient.get<{ success: boolean; data: StorageSettings }>('/settings');
    return data.data;
  },

  async update(settings: Partial<StorageSettings>): Promise<void> {
    await apiClient.put('/settings', settings);
  },

  async testStorage(): Promise<string> {
    const { data } = await apiClient.post<{ success: boolean; message: string }>('/settings/test-storage');
    return data.message;
  },
};
