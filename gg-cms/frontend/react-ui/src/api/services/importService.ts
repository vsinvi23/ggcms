import apiClient from '../client';

export interface ImportPreviewItem {
  fileName: string;
  index: number;
  type: string;
  title: string;
  description: string;
  body: string;
  categorySlug: string;
  categoryId?: number;
  articleType: string;
  courseType: string;
  tags: string[];
  valid: boolean;
  error?: string;
}

export interface ImportPreviewResponse {
  items: ImportPreviewItem[];
  total: number;
  valid: number;
  invalid: number;
}

export interface ImportConfirmItem {
  type: string;
  title: string;
  description: string;
  body: string;
  categoryId?: number;
  articleType: string;
  courseType: string;
}

export interface ImportConfirmResult {
  title: string;
  id?: number;
  success: boolean;
  error?: string;
}

export interface ImportConfirmResponse {
  created: number;
  failed: number;
  results: ImportConfirmResult[];
}

export async function previewImport(files: File[]): Promise<ImportPreviewResponse> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const { data } = await apiClient.post<ImportPreviewResponse>('/import/preview', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function confirmImport(items: ImportConfirmItem[]): Promise<ImportConfirmResponse> {
  const { data } = await apiClient.post<ImportConfirmResponse>('/import/confirm', { items });
  return data;
}
