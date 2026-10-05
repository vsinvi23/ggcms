import apiClient from '../client';

export interface ImportLessonItem {
  title: string;
  type: string;
  duration: number;
  order: number;
  body: string;
}

export interface ImportSectionItem {
  title: string;
  order: number;
  lessons: ImportLessonItem[];
}

export interface ImportPreviewItem {
  fileName: string;
  index: number;
  type: string;
  title: string;
  description: string;
  body: string;
  bodyFormat: string;
  categorySlug: string;
  categoryId?: number;
  articleType: string;
  courseType: string;
  interactiveMetadata?: string;
  kind?: string;
  slug?: string;
  sequencedCourses?: string[];
  status?: string;
  tags: string[];
  sections: ImportSectionItem[];
  /** Non-fatal issues found while parsing, e.g. an image path that does not resolve. */
  warnings?: string[];
  valid: boolean;
  error?: string;
  exists?: boolean;
  existingId?: number;
  /** Client-side choice for an item that already exists: replace it (default) or skip it. */
  overwrite?: boolean;
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
  categorySlug?: string;
  categoryId?: number;
  articleType: string;
  courseType: string;
  interactiveMetadata?: string;
  kind?: string;
  slug?: string;
  sequencedCourses?: string[];
  status?: string;
  sections: ImportSectionItem[];
  exists?: boolean;
  existingId?: number;
  overwrite?: boolean;
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
  const response = await apiClient.post<{ data: ImportPreviewResponse }>('/import/preview', form);
  const resData = response.data;
  return (resData as any)?.data || resData;
}

export async function confirmImport(items: ImportConfirmItem[]): Promise<ImportConfirmResponse> {
  const response = await apiClient.post<{ data: ImportConfirmResponse }>('/import/confirm', { items });
  const resData = response.data;
  return (resData as any)?.data || resData;
}

