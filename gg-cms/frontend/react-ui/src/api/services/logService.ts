import apiClient from '../client';

export interface DebugLogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
}

export const logService = {
  async getDebugLogs(level?: string, limit = 100): Promise<DebugLogEntry[]> {
    const params = new URLSearchParams();
    if (level && level !== 'all') params.append('level', level);
    params.append('limit', String(limit));

    const { data } = await apiClient.get<{ items: DebugLogEntry[]; total: number }>(`/logs/debug?${params.toString()}`);
    return data.items || [];
  },

  async downloadDebugLogs(format: 'txt' | 'json' | 'csv' = 'txt'): Promise<void> {
    const response = await apiClient.get(`/logs/download?format=${format}`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `debug-logs.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async downloadAuditLogs(format: 'csv' | 'json' = 'csv'): Promise<void> {
    const response = await apiClient.get(`/audit/download?format=${format}`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit-logs.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
