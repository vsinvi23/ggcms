import { useMutation } from '@tanstack/react-query';
import {
  previewImport,
  confirmImport,
  ImportConfirmItem,
} from '../services/importService';

export function useImportPreview() {
  return useMutation({
    mutationFn: (files: File[]) => previewImport(files),
  });
}

export function useImportConfirm() {
  return useMutation({
    mutationFn: (items: ImportConfirmItem[]) => confirmImport(items),
  });
}
