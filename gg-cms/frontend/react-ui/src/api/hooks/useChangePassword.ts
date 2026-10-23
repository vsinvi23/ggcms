import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/authService';

export const useChangePassword = () =>
  useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authService.changePassword(currentPassword, newPassword),
  });
